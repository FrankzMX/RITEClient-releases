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
// Not downloadable in the clear: RITE's modules travel and sit on disk only as
// AES-256-GCM blobs. The content key of each module comes in /modulos, only to a
// license entitled to it, and is kept (with the pass) in an OS-encrypted state
// file (safeStorage/DPAPI); the code is decrypted only in memory, right before it
// runs. They also ship inside the installer as the same blobs (packDir), so they
// work on the first run without downloading. The free license (D1) is automatic:
// with no license the client gets one from /gratis, tied to this PC, which opens
// the free and open modules. Any paid license opens them too.
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
const GRACE_MS = 72 * 60 * 60 * 1000;
const PASS = /^[A-Za-z0-9_-]{20,200}$/;
const BOLETO = /^[A-Za-z0-9_-]{20,8000}\.[A-Za-z0-9_-]{40,60}$/;
const CLAVE = /^[A-Za-z0-9+/=]{43,48}$/; // 32 bytes en base64

// No cipher (tests, or an OS without one): the state is kept as plain bytes.
const PLAIN = { encrypt: (data) => Buffer.from(data), decrypt: (data) => Buffer.from(data) };

// AES-256-GCM: `blob` = nonce[12] | ciphertext | tag[16] (Buffer). Devuelve el
// código en claro (Buffer) o null si la clave no cuadra (p. ej. alguien la cambió).
function descifrar(blob, claveB64) {
  try {
    const clave = Buffer.from(claveB64, "base64");
    if (clave.length !== 32 || blob.length < 29) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", clave, blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(blob.length - 16));
    return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]);
  } catch {
    return null;
  }
}

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
  const abierto = entry.abierto === true;
  return {
    ...m,
    activo: entry.activo === true,
    abierto,
    gratis: !abierto && entry.gratis === true,
    privado: !abierto,
    clave: typeof entry.clave === "string" && CLAVE.test(entry.clave) ? entry.clave : "",
    cifrado: entry.cifrado === true,
  };
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
  bloqueado: "RITE quitó los scripts gratis de esta PC",
};

class Licencia {
  constructor({ dir, fetch, publicKey, clientVersion, server = SERVIDOR, machineId: getId = machineId, onChange = () => {}, now = () => Date.now(), cipher = PLAIN, packDir = "", settings = null, depuracion = false }) {
    this.dir = path.join(dir, "licencia");
    this.fetch = fetch;
    this.publicKey = publicKey;
    this.clientVersion = clientVersion;
    this.server = server.replace(/\/+$/, "");
    this.getId = getId;
    this.onChange = onChange;
    this.now = now;
    this.cipher = cipher;
    // Where the installer left the packaged blobs (same ciphertext the server has).
    this.packDir = packDir;
    // Returns the current settings, to tell the server which modules this PC has on.
    this.getSettings = settings;
    // Depuración remota abierta (--remote-debugging-port, etc.): los módulos con
    // licencia no se descifran ni corren, para que no se lean en claro en DevTools.
    this.depuracion = depuracion === true;
    // Decrypted code, only in memory, per id@version.
    this.claro = new Map();
    this.state = { pase: "", nombre: "", list: [], etag: "", checkedAt: 0, okAt: 0, error: "" };
    // The server's short pass for rite.lat (X-RITE-Boleto): which license this
    // is and which private modules it opens, signed for 48 h. Only in memory;
    // the licensed modules get it as riteModule.boleto.
    this.boleto = "";
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
    return path.join(this.dir, `${m.id}@${m.version}.rite`);
  }

  // The state file holds the pass and the content keys: kept OS-encrypted.
  readState() {
    const data = fs.readFileSync(this.statePath());
    try {
      return JSON.parse(data.toString("utf8"));
    } catch {
      return JSON.parse(this.cipher.decrypt(data).toString("utf8"));
    }
  }

  load() {
    try {
      const saved = this.readState();
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
      const state = { pase: this.state.pase, nombre: this.state.nombre, etag: this.state.etag, okAt: this.state.okAt, raw: previous };
      fs.writeFileSync(this.statePath(), this.cipher.encrypt(Buffer.from(JSON.stringify(state), "utf8")));
    } catch (error) {
      console.error("[RITE] módulos: no se pudo guardar", error);
    }
  }

  readRaw() {
    try {
      return this.readState().raw || "";
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
      // La versión del cliente, para que el servidor pueda exigir una versión mínima por módulo.
      if (this.clientVersion) init.headers["X-RITE-Version"] = String(this.clientVersion);
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
    this.boleto = "";
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

  // Licencia gratis automática: con el cliente enlazado pero sin pase, saca una de
  // /gratis (atada a esta PC). Si no hay red, se queda sin pase y corre lo cacheado
  // dentro del margen. Un «bloqueado» se recuerda hasta el próximo intento con red.
  async asegurarGratis(timeoutMs) {
    if (!this.enabled || this.state.pase) return;
    let res;
    try {
      res = await this.request("/gratis", { method: "POST", body: { huella: await this.huella(), cliente: this.clientVersion }, timeoutMs });
    } catch {
      return;
    }
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (res.ok && PASS.test(data.pase)) {
      this.state = { ...this.state, pase: data.pase, nombre: text(data.nombre, 60) || "Gratis", etag: "", error: "", okAt: this.now() };
      this.save();
    } else if (typeof data.error === "string") {
      this.state.error = data.error.slice(0, 40);
    }
  }

  async doRefresh(timeoutMs, quiet) {
    const before = this.signature();
    let cut = "";
    try {
      // Sin pase (recién instalado, o se cayó la licencia): saca la gratis automática.
      await this.asegurarGratis(timeoutMs);
      // With a license the server refuses a bad pass; then the open modules
      // are asked for without it, in the same check.
      for (let attempt = 0; attempt < 2; attempt++) {
        const headers = this.state.etag && this.state.list.length ? { "If-None-Match": this.state.etag } : {};
        const instalados = this.instalados();
        if (instalados !== null) headers["X-RITE-Instalados"] = instalados;
        const res = await this.request("/modulos", { headers, timeoutMs });
        this.state.checkedAt = this.now();
        const renewed = res.headers.get("x-rite-pase");
        if (this.state.pase && renewed && PASS.test(renewed)) this.state.pase = renewed;
        const boleto = res.headers.get("x-rite-boleto");
        if (this.state.pase && boleto && BOLETO.test(boleto)) this.boleto = boleto;
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
          // Fall back to the automatic free license (unless this PC was blocked).
          if (error !== "bloqueado") await this.asegurarGratis(timeoutMs);
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

  // Reads a packaged/cached blob and checks it decrypts to the module's code.
  // Returns the ciphertext blob (Buffer) good to keep, or null.
  blobValido(blob, m) {
    if (!blob || blob.length > MAX_FILE || !m.clave) return null;
    const claro = descifrar(blob, m.clave);
    return claro && claro.length <= MAX_FILE && sha256(claro) === m.sha256 ? blob : null;
  }

  async downloadFiles(timeoutMs) {
    const keep = new Set();
    for (const m of this.state.list) {
      keep.add(path.basename(this.filePath(m)));
      if (!m.activo || !this.compatible(m) || this.plano(m) !== null) continue;
      try {
        // 1) El blob que trae el instalador (packDir), si está y cuadra con la clave.
        let blob = this.blobValido(this.leerPack(m), m);
        // 2) Si no, se baja del Panel el blob cifrado (base64) y se descifra en memoria para validarlo.
        if (!blob) {
          const res = await this.request(`/archivo/${m.id}/${m.version}.js`, { timeoutMs });
          if (!res.ok) continue;
          blob = this.blobValido(Buffer.from((await res.text()).trim(), "base64"), m);
        }
        if (!blob) continue;
        fs.mkdirSync(this.dir, { recursive: true });
        // En disco nunca queda el código en claro: se guarda el blob cifrado.
        fs.writeFileSync(this.filePath(m), blob);
        this.claro.delete(`${m.id}@${m.version}`);
      } catch {
        // Next check retries.
      }
    }
    this.clearFiles(keep);
  }

  // The packaged blob the installer shipped (same ciphertext the server has).
  leerPack(m) {
    if (!this.packDir) return null;
    try {
      return fs.readFileSync(path.join(this.packDir, `${m.id}@${m.version}.rite`));
    } catch {
      return null;
    }
  }

  clearFiles(keep) {
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      // .js: the readable copies older clients kept; they go too.
      if ((name.endsWith(".rite") || name.endsWith(".js")) && !keep.has(name)) {
        try {
          fs.rmSync(path.join(this.dir, name), { force: true });
        } catch {}
      }
    }
    // Forget decrypted code of modules no longer listed.
    const vivos = new Set(this.state.list.map((m) => `${m.id}@${m.version}`));
    for (const k of this.claro.keys()) if (!vivos.has(k)) this.claro.delete(k);
  }

  // The module's code in the clear, only in memory (never written to disk).
  // Reads the encrypted blob, decrypts with the content key and checks the
  // author-signed sha256 before handing it back.
  plano(m) {
    // Con depuración remota abierta, los módulos con licencia no se descifran:
    // así su código nunca llega en claro a la página (donde DevTools lo leería).
    if (this.depuracion && m.privado) return null;
    const key = `${m.id}@${m.version}`;
    if (this.claro.has(key)) return this.claro.get(key);
    let code = null;
    try {
      const claro = descifrar(fs.readFileSync(this.filePath(m)), m.clave);
      if (claro && sha256(claro) === m.sha256) code = claro.toString("utf8");
    } catch {}
    this.claro.set(key, code);
    return code;
  }

  compatible(m) {
    return !m.minClient || compareVersions(this.clientVersion, m.minClient) >= 0;
  }

  // Without a successful check for a day, the licensed modules stop.
  inGrace() {
    return this.now() - this.state.okAt <= GRACE_MS;
  }

  // Modules this PC has on ("id1,id2"), sent with /modulos so the Panel can see who has each one.
  // One row per license on the server, so reinstalling doesn't add up. null = don't send
  // (no license yet, no list yet, or modules turned off: the server keeps what it had).
  instalados() {
    if (!this.state.pase || !this.state.list.length || !this.getSettings) return null;
    let all = {};
    try {
      all = this.getSettings() || {};
    } catch {
      return null;
    }
    if (!all.remoteModules || all.tournamentMode) return null;
    const off = new Set(all.remoteModulesOff || []);
    return this.state.list.filter((m) => m.activo && !off.has(m.id)).map((m) => m.id).join(",");
  }

  // Whether a module may run now: on, compatible, and (if licensed) in grace.
  runnable(m) {
    return m.activo && this.compatible(m) && (!m.privado || (this.active && this.inGrace()));
  }

  signature() {
    return JSON.stringify([this.state.pase.slice(0, 8), this.state.list.map((m) => [m.id, m.version, m.activo, m.privado, m.gratis, this.plano(m) !== null])]);
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
      .filter((m) => m.activo && m.tipo !== "datos")
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
        ready: this.plano(m) !== null,
        privado: m.privado,
        gratis: m.gratis,
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
      gratisAuto: this.active && this.state.nombre === "Gratis",
      depuracion: this.depuracion,
    };
  }

  // A data module («datos»), decrypted only in memory: parsed JSON, or null when this
  // license can't open it (or it is off, not compatible, out of grace or not downloaded).
  datos(id) {
    if (!this.enabled) return null;
    const m = this.state.list.find((x) => x.id === id && x.tipo === "datos");
    if (!m || !this.runnable(m)) return null;
    const code = this.plano(m);
    if (code === null) return null;
    try {
      return JSON.parse(code);
    } catch {
      return null;
    }
  }

  // Scripts to run in the page, and the local userscripts they replace.
  scripts(settings) {
    if (!this.enabled || !settings.remoteModules || settings.tournamentMode) return { scripts: [], replaces: [] };
    const off = new Set(settings.remoteModulesOff || []);
    const scripts = [];
    const replaces = [];
    for (const m of this.state.list) {
      if (!this.runnable(m) || off.has(m.id) || m.tipo === "datos") continue;
      const code = this.plano(m);
      if (code === null) continue;
      scripts.push({ name: `RITE ${m.nombre} ${m.version}`, code, module: m.id, boleto: m.privado && !m.gratis ? this.boleto : "" });
      replaces.push(...m.reemplaza);
    }
    return { scripts, replaces };
  }
}

module.exports = { Licencia, verifyEntry, parseList, normalizeCode, machineId, descifrar, SERVIDOR, ERRORS };
