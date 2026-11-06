"use strict";

// RITE modules: page scripts (like CustomSkinLink) that the client downloads
// from RITE's server instead of shipping them in a new version. They run exactly
// like userscripts, so a new module or a fix reaches players with a refresh (F5).
// None lives on GitHub: every module comes from the license server (Railway).
//
// Two kinds of module, decided by the author when publishing:
//   - open («para todo cliente»): the server hands it to any RITE client;
//   - with license: only to the PCs whose license opens it.
//
// Licenses: the author gives a code like RITE-7K2Q-M9XD-4FGH to a player. The
// client sends it, with a hash of this PC's id, to the server, which ties the
// license to that PC and answers with a pass. From then on, before each page
// load, the client asks the server for its modules with the pass and the same
// PC hash:
//   - a revoked license, or the pass used from another PC, cuts the licensed
//     modules off on the next refresh (the client forgets the pass and files);
//   - without connection the last verified copy of a licensed module runs for
//     a day, then stops; open modules keep running from the last copy.
//
// Safety: every module entry is signed by the author's key (modules-key.js).
// The server decides who receives a module and whether it is on, but can't make
// one up or change it: the client re-checks the signature and the file's
// SHA-256. The author has a switch per module (`activo`); each player can turn
// any module off, all of them at once, and tournament mode turns all of them
// off. Modules only run in the Kirka page (like userscripts): they never get
// the main process, files or the PC. The PC id never leaves the PC: only a
// hash of it is sent, and only with a license.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cleanModule, compareVersions, MAX_FILE } = require("./modules");

const SERVIDOR = "https://licencias-production-ac70.up.railway.app";
const MAX_LIST = 512 * 1024;
const MAX_MODULES = 40;
const GRACE_MS = 24 * 60 * 60 * 1000;
const PASS = /^[A-Za-z0-9_-]{20,200}$/;

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const text = (value, max) => (typeof value === "string" ? value.replace(/[\x00-\x1f]/g, " ").trim().slice(0, max) : "");
const normalizeCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");

// A stable id of this PC: Windows' MachineGuid, Linux's machine-id, macOS's
// platform UUID; otherwise what the machine looks like. Only its hash is used.
async function machineId() {
  const { execFile } = require("node:child_process");
  const run = (cmd, args) =>
    new Promise((resolve) => execFile(cmd, args, { timeout: 5000, windowsHide: true }, (error, stdout) => resolve(error ? "" : String(stdout))));
  let id = "";
  try {
    if (process.platform === "win32") {
      const out = await run("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
      id = (/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(out) || [])[1] || "";
    } else if (process.platform === "darwin") {
      const out = await run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
      id = (/"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out) || [])[1] || "";
    } else {
      for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        try {
          id = fs.readFileSync(file, "utf8").trim();
          if (id) break;
        } catch {}
      }
    }
  } catch {}
  return id || `${os.hostname()}|${os.cpus()[0]?.model || ""}|${os.totalmem()}|${os.userInfo().username}`;
}

// One entry of the server's list: its signed `entrada` (JSON text) must carry
// the author's signature and agree with the id and version the server says.
// `activo` and `abierto` come from the server (they are its decisions).
function verifyEntry(entry, publicKey) {
  if (!publicKey || !entry || typeof entry.entrada !== "string" || typeof entry.firma !== "string" || entry.entrada.length > 8000) return null;
  try {
    if (!crypto.verify(null, Buffer.from(entry.entrada, "utf8"), publicKey, Buffer.from(entry.firma, "base64"))) return null;
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(entry.entrada);
  } catch {
    return null;
  }
  const m = cleanModule(parsed);
  if (!m || m.id !== entry.id || m.version !== entry.version) return null;
  return { ...m, activo: entry.activo === true, abierto: entry.abierto === true, privado: entry.abierto !== true };
}

// The server's answer, checked: only entries with a valid signature survive.
function parseList(raw, publicKey) {
  if (typeof raw !== "string" || raw.length > MAX_LIST) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.modulos)) return null;
  const seen = new Set();
  const modulos = [];
  for (const entry of data.modulos.slice(0, MAX_MODULES)) {
    const m = verifyEntry(entry, publicKey);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    modulos.push(m);
  }
  return { nombre: text(data.licencia?.nombre, 60), modulos, raw };
}

const ERRORS = {
  "licencia-invalida": "Esa licencia no existe",
  "otra-pc": "Esa licencia ya está activada en otra PC",
  revocada: "Esa licencia fue revocada",
  "pase-invalido": "La licencia dejó de ser válida en esta PC",
  limite: "Demasiados intentos, espera unos minutos",
  "huella-invalida": "No se pudo identificar esta PC",
  "sin conexión": "Sin conexión con el servidor de RITE",
};

class Licencia {
  constructor({ dir, fetch, publicKey, clientVersion, server = SERVIDOR, machineId: getId = machineId, onChange = () => {}, now = () => Date.now() }) {
    this.dir = path.join(dir, "licencia");
    this.fetch = fetch;
    this.publicKey = publicKey;
    this.clientVersion = clientVersion;
    this.server = server.replace(/\/+$/, "");
    this.getId = getId;
    this.onChange = onChange;
    this.now = now;
    this.state = { pase: "", nombre: "", list: [], etag: "", checkedAt: 0, okAt: 0, error: "" };
    this.huellaCache = "";
    this.pending = null;
    this.load();
  }

  get enabled() {
    return Boolean(this.publicKey);
  }

  // A license is set up on this PC.
  get active() {
    return this.enabled && Boolean(this.state.pase);
  }

  statePath() {
    return path.join(this.dir, "licencia.json");
  }

  filePath(m) {
    return path.join(this.dir, `${m.id}@${m.version}.js`);
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.statePath(), "utf8"));
      if (PASS.test(saved.pase)) {
        this.state.pase = saved.pase;
        this.state.nombre = text(saved.nombre, 60);
        this.state.okAt = Number(saved.okAt) || 0;
      }
      const list = parseList(saved.raw, this.publicKey);
      if (list) {
        this.state.list = list.modulos;
        if (typeof saved.etag === "string") this.state.etag = saved.etag.slice(0, 200);
      }
    } catch {
      // Nothing saved yet.
    }
  }

  save(raw) {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const previous = raw === undefined ? this.readRaw() : raw;
      fs.writeFileSync(this.statePath(), JSON.stringify({ pase: this.state.pase, nombre: this.state.nombre, etag: this.state.etag, okAt: this.state.okAt, raw: previous }));
    } catch (error) {
      console.error("[RITE] módulos: no se pudo guardar", error);
    }
  }

  readRaw() {
    try {
      return JSON.parse(fs.readFileSync(this.statePath(), "utf8")).raw || "";
    } catch {
      return "";
    }
  }

  async huella() {
    if (!this.huellaCache) this.huellaCache = sha256(`rite-huella-v1:${String(await this.getId())}`);
    return this.huellaCache;
  }

  // A request to the server. The pass and the PC hash go only when there is a
  // license on this PC; without one, nothing about the PC is sent.
  async request(pathname, { method = "GET", body, headers = {}, timeoutMs = 8000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init = { method, headers: { ...headers }, signal: controller.signal, cache: "no-store" };
      if (this.state.pase) {
        init.headers.Authorization = `Bearer ${this.state.pase}`;
        init.headers["X-RITE-Huella"] = await this.huella();
      }
      if (body !== undefined) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      return await this.fetch(this.server + pathname, init);
    } finally {
      clearTimeout(timer);
    }
  }

  // Ties the code to this PC and keeps the pass. {ok, nombre} or {ok: false, error}.
  async activar(code) {
    if (!this.enabled) return { ok: false, error: "no-disponible", message: "Esta versión del cliente no trae módulos RITE" };
    const codigo = normalizeCode(code);
    if (codigo.length < 12 || codigo.length > 30) return { ok: false, error: "licencia-invalida", message: ERRORS["licencia-invalida"] };
    let res;
    try {
      res = await this.request("/activar", { method: "POST", body: { codigo, huella: await this.huella(), cliente: this.clientVersion } });
    } catch {
      return { ok: false, error: "sin conexión", message: ERRORS["sin conexión"] };
    }
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (!res.ok || !PASS.test(data.pase)) {
      const error = typeof data.error === "string" ? data.error.slice(0, 40) : "sin conexión";
      return { ok: false, error, message: ERRORS[error] || "No se pudo activar la licencia" };
    }
    this.state = { ...this.state, pase: data.pase, nombre: text(data.nombre, 60), etag: "", error: "", okAt: this.now() };
    this.save();
    await this.refresh({ quiet: true });
    return { ok: true, nombre: this.state.nombre, message: "" };
  }

  // Forgets the license on this PC: its modules go, the open ones stay.
  quitar(error = "") {
    const had = this.active;
    this.state = { ...this.state, pase: "", nombre: "", list: this.state.list.filter((m) => !m.privado), etag: "", okAt: 0, error };
    this.clearFiles(new Set(this.state.list.map((m) => path.basename(this.filePath(m)))));
    this.save();
    if (had) this.onChange();
  }

  refresh({ timeoutMs = 8000, quiet = false } = {}) {
    if (!this.enabled) return Promise.resolve(false);
    if (!this.pending) {
      this.pending = this.doRefresh(timeoutMs, quiet).finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  async doRefresh(timeoutMs, quiet) {
    const before = this.signature();
    let cut = "";
    try {
      // With a license the server refuses a bad pass; then the open modules
      // are asked for without it, in the same check.
      for (let attempt = 0; attempt < 2; attempt++) {
        const headers = this.state.etag && this.state.list.length ? { "If-None-Match": this.state.etag } : {};
        const res = await this.request("/modulos", { headers, timeoutMs });
        this.state.checkedAt = this.now();
        const renewed = res.headers.get("x-rite-pase");
        if (this.state.pase && renewed && PASS.test(renewed)) this.state.pase = renewed;
        if (res.status === 304) {
          this.state.okAt = this.now();
          this.state.error = "";
          if (renewed) this.save();
        } else if (res.ok) {
          const raw = await res.text();
          const list = parseList(raw, this.publicKey);
          if (!list) {
            this.state.error = "respuesta inválida";
          } else {
            this.state.list = list.modulos;
            if (this.state.pase) this.state.nombre = list.nombre || this.state.nombre;
            this.state.etag = String(res.headers.get("etag") || "").slice(0, 200);
            this.state.okAt = this.now();
            this.state.error = "";
            this.save(raw);
          }
        } else if ((res.status === 401 || res.status === 403) && this.state.pase) {
          let data = {};
          try {
            data = await res.json();
          } catch {}
          const error = typeof data.error === "string" ? data.error.slice(0, 40) : "pase-invalido";
          // Revoked, used from another PC or unknown: the license is gone here.
          cut = error;
          this.quitar(error);
          continue;
        } else {
          this.state.error = res.status === 429 ? "limite" : `servidor ${res.status}`;
        }
        break;
      }
      await this.downloadFiles(timeoutMs);
    } catch (error) {
      this.state.error = error?.name === "AbortError" ? "sin conexión" : error?.message || "sin conexión";
    }
    // Why the license went, shown until the next check.
    if (cut) this.state.error = cut;
    const changed = this.signature() !== before;
    if (changed && !quiet) this.onChange();
    return changed;
  }

  async downloadFiles(timeoutMs) {
    const keep = new Set();
    for (const m of this.state.list) {
      keep.add(path.basename(this.filePath(m)));
      if (!m.activo || !this.compatible(m) || this.readCached(m) !== null) continue;
      try {
        const res = await this.request(`/archivo/${m.id}/${m.version}.js`, { timeoutMs });
        if (!res.ok) continue;
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > MAX_FILE || sha256(data) !== m.sha256) continue;
        fs.mkdirSync(this.dir, { recursive: true });
        fs.writeFileSync(this.filePath(m), data);
      } catch {
        // Next check retries.
      }
    }
    this.clearFiles(keep);
  }

  clearFiles(keep) {
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name.endsWith(".js") && !keep.has(name)) {
        try {
          fs.rmSync(path.join(this.dir, name), { force: true });
        } catch {}
      }
    }
  }

  readCached(m) {
    try {
      const code = fs.readFileSync(this.filePath(m));
      return sha256(code) === m.sha256 ? code.toString("utf8") : null;
    } catch {
      return null;
    }
  }

  compatible(m) {
    return !m.minClient || compareVersions(this.clientVersion, m.minClient) >= 0;
  }

  // Without a successful check for a day, the licensed modules stop.
  inGrace() {
    return this.now() - this.state.okAt <= GRACE_MS;
  }

  // Whether a module may run now: on, compatible, and (if licensed) in grace.
  runnable(m) {
    return m.activo && this.compatible(m) && (!m.privado || (this.active && this.inGrace()));
  }

  signature() {
    return JSON.stringify([this.state.pase.slice(0, 8), this.state.list.map((m) => [m.id, m.version, m.activo, m.privado, this.readCached(m) !== null])]);
  }

  // Before the page runs: a fresh check if the last one is older than `maxAgeMs`,
  // but never waiting more than `waitMs` (the cache is used if it doesn't answer).
  async fresh({ maxAgeMs = 3000, waitMs = 2500 } = {}) {
    if (!this.enabled || this.now() - this.state.checkedAt < maxAgeMs) return;
    await Promise.race([this.refresh({ timeoutMs: waitMs, quiet: true }), new Promise((resolve) => setTimeout(resolve, waitMs))]);
  }

  // The modules the menu shows (only the ones the author has turned on).
  list(settings) {
    const off = new Set(settings.remoteModulesOff || []);
    return this.state.list
      .filter((m) => m.activo)
      .map((m) => ({
        id: m.id,
        name: m.nombre,
        description: m.descripcion,
        author: m.autor,
        version: m.version,
        changes: m.cambios,
        type: m.tipo,
        enabled: !off.has(m.id),
        compatible: this.compatible(m),
        ready: this.readCached(m) !== null,
        privado: m.privado,
      }));
  }

  status() {
    return {
      available: this.enabled,
      activa: this.active,
      nombre: this.state.nombre,
      error: this.state.error,
      message: ERRORS[this.state.error] || this.state.error,
      checkedAt: this.state.checkedAt,
      enGracia: this.active && !this.inGrace(),
    };
  }

  // Scripts to run in the page, and the local userscripts they replace.
  scripts(settings) {
    if (!this.enabled || !settings.remoteModules || settings.tournamentMode) return { scripts: [], replaces: [] };
    const off = new Set(settings.remoteModulesOff || []);
    const scripts = [];
    const replaces = [];
    for (const m of this.state.list) {
      if (!this.runnable(m) || off.has(m.id)) continue;
      const code = this.readCached(m);
      if (code === null) continue;
      scripts.push({ name: `RITE ${m.nombre} ${m.version}`, code, module: m.id });
      replaces.push(...m.reemplaza);
    }
    return { scripts, replaces };
  }
}

module.exports = { Licencia, verifyEntry, parseList, normalizeCode, machineId, SERVIDOR, ERRORS };
