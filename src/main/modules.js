"use strict";

// RITE modules: page scripts (like CustomSkinLink) that the client downloads
// from RITE instead of shipping them in a new version. They run exactly like
// userscripts, so a new module or a fix reaches players with a refresh (F5).
//
// Safety:
// - Only a list signed with RITE's Ed25519 key is accepted (modules-key.js has
//   the public half; the private one lives on the author's PC, never on
//   GitHub). The list carries each file's SHA-256, so one signature covers
//   every module. A list with a lower sequence than the one already seen is
//   refused, so an old signed list (with an old bug) can't be replayed.
// - The author has a switch per module (`activo`): every page load asks for the
//   list first (with a short wait), so turning a module off takes it away on
//   the next refresh. Without internet the last verified list is used.
// - Each player can turn any module off, all of them at once, and tournament
//   mode turns all of them off.
// - Modules only run in the Kirka page (like userscripts): they never get the
//   main process, files or the PC.
//
// Published by `npm run modulos` (scripts/modulos.js) on the "modulos" branch
// of the public FrankzMX/RITEClient-releases repo.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPO = "FrankzMX/RITEClient-releases";
const BRANCH = "modulos";
const LIST = "modulos.json";
// The API answers with the file as it is right now (raw.githubusercontent
// caches for 5 minutes, too slow for the switch); a 304 doesn't count against
// its hourly limit. If the API says no (limit), raw with a fresh query.
const SOURCES = [
  { url: `https://api.github.com/repos/${REPO}/contents/${LIST}?ref=${BRANCH}`, headers: { Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" }, etag: true },
  { url: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${LIST}`, bust: true },
];
const FILE_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

const MAX_LIST = 256 * 1024;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_MODULES = 40;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const FILE = /^modulos\/[a-z0-9][a-z0-9-]{0,39}\/[0-9A-Za-z][0-9A-Za-z.+-]{0,39}\.js$/;
const SHA = /^[0-9a-f]{64}$/;
const TYPES = ["visual", "utilidad", "info"];
const SAFE_NAME = /^(?!\.)[^\\/:*?"<>|\x00-\x1f]{1,120}\.js$/i;

const text = (value, max) => (typeof value === "string" ? value.replace(/[\x00-\x1f]/g, " ").trim().slice(0, max) : "");

// Compares "0.1.0-beta.26" style versions: -1, 0 or 1. A release is newer than
// its own betas.
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = ""] = String(v || "0").split("-", 2);
    return { core: core.split(".").map((n) => Number(n) || 0), pre: pre ? pre.split(".") : [] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] || 0) - (y.core[i] || 0);
    if (d) return Math.sign(d);
  }
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const np = /^\d+$/.test(p);
    const nq = /^\d+$/.test(q);
    if (np && nq && Number(p) !== Number(q)) return Math.sign(Number(p) - Number(q));
    if (np !== nq) return np ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

// Checks the signature and shape of a downloaded list. Returns the list or null.
function verifyList(raw, publicKey) {
  if (!publicKey || typeof raw !== "string" || raw.length > MAX_LIST) return null;
  let outer;
  try {
    outer = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!outer || typeof outer.manifiesto !== "string" || typeof outer.firma !== "string") return null;
  try {
    const ok = crypto.verify(null, Buffer.from(outer.manifiesto, "utf8"), publicKey, Buffer.from(outer.firma, "base64"));
    if (!ok) return null;
  } catch {
    return null;
  }
  let manifest;
  try {
    manifest = JSON.parse(outer.manifiesto);
  } catch {
    return null;
  }
  if (!manifest || !Number.isSafeInteger(manifest.secuencia) || manifest.secuencia < 1 || !Array.isArray(manifest.modulos)) return null;
  const seen = new Set();
  const modules = [];
  for (const m of manifest.modulos.slice(0, MAX_MODULES)) {
    if (!m || !ID.test(m.id) || seen.has(m.id) || !VERSION.test(m.version) || !FILE.test(m.archivo) || !SHA.test(m.sha256)) continue;
    seen.add(m.id);
    modules.push({
      id: m.id,
      nombre: text(m.nombre, 60) || m.id,
      descripcion: text(m.descripcion, 200),
      cambios: text(m.cambios, 300),
      autor: text(m.autor, 60),
      version: m.version,
      tipo: TYPES.includes(m.tipo) ? m.tipo : "visual",
      minClient: typeof m.minClient === "string" && VERSION.test(m.minClient) ? m.minClient : "",
      archivo: m.archivo,
      sha256: m.sha256,
      activo: m.activo === true,
      reemplaza: Array.isArray(m.reemplaza) ? m.reemplaza.filter((n) => typeof n === "string" && SAFE_NAME.test(n)).slice(0, 10) : [],
    });
  }
  return { secuencia: manifest.secuencia, fecha: text(manifest.fecha, 40), modulos: modules, raw };
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

class RemoteModules {
  constructor({ dir, fetch, publicKey, clientVersion, onChange = () => {}, now = () => Date.now() }) {
    this.dir = path.join(dir, "modulos");
    this.fetch = fetch;
    this.publicKey = publicKey;
    this.clientVersion = clientVersion;
    this.onChange = onChange;
    this.now = now;
    this.state = { list: null, etag: "", checkedAt: 0, error: "" };
    this.pending = null;
    this.load();
  }

  get enabled() {
    return Boolean(this.publicKey);
  }

  statePath() {
    return path.join(this.dir, "estado.json");
  }

  filePath(m) {
    return path.join(this.dir, `${m.id}@${m.version}.js`);
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.statePath(), "utf8"));
      const list = verifyList(saved.raw, this.publicKey);
      if (list) this.state.list = list;
      if (list && typeof saved.etag === "string") this.state.etag = saved.etag.slice(0, 200);
    } catch {
      // No cache yet.
    }
  }

  save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.statePath(), JSON.stringify({ raw: this.state.list.raw, etag: this.state.etag }));
    } catch (error) {
      console.error("[RITE] módulos: no se pudo guardar la caché", error);
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

  async get(url, headers, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchList(timeoutMs) {
    for (const source of SOURCES) {
      const headers = { ...(source.headers || {}) };
      if (source.etag && this.state.etag && this.state.list) headers["If-None-Match"] = this.state.etag;
      const url = source.bust ? `${source.url}?t=${this.now()}` : source.url;
      let res;
      try {
        res = await this.get(url, headers, timeoutMs);
      } catch {
        continue;
      }
      if (res.status === 304) return { same: true };
      if (res.status === 404) return { missing: true };
      if (!res.ok) continue;
      const raw = await res.text();
      return { raw, etag: source.etag ? res.headers.get("etag") || "" : "" };
    }
    throw new Error("sin conexión");
  }

  // Asks for the list and downloads the files of active modules that changed.
  // Several callers at once share one check. Returns true if anything changed.
  // `quiet`: the page is about to load and will get the result, so no notice.
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
    try {
      const got = await this.fetchList(timeoutMs);
      this.state.checkedAt = this.now();
      this.state.error = "";
      if (got.missing) {
        // Nothing published yet (or the branch was removed): no modules.
        if (this.state.list) {
          this.state.list = null;
          this.state.etag = "";
          this.clearFiles(new Set());
          try {
            fs.rmSync(this.statePath(), { force: true });
          } catch {}
        }
      } else if (!got.same) {
        const list = verifyList(got.raw, this.publicKey);
        if (!list) {
          this.state.error = "firma inválida";
        } else if (this.state.list && list.secuencia < this.state.list.secuencia) {
          this.state.error = "lista más vieja que la guardada";
        } else {
          this.state.list = list;
          this.state.etag = got.etag;
          this.save();
        }
      }
      await this.downloadFiles(timeoutMs);
    } catch (error) {
      this.state.error = error.message || "sin conexión";
    }
    const changed = this.signature() !== before;
    if (changed && !quiet) this.onChange();
    return changed;
  }

  async downloadFiles(timeoutMs) {
    const list = this.state.list;
    const keep = new Set();
    for (const m of list?.modulos || []) {
      keep.add(path.basename(this.filePath(m)));
      if (!m.activo || !this.compatible(m) || this.readCached(m) !== null) continue;
      try {
        const res = await this.get(FILE_BASE + m.archivo, {}, timeoutMs);
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

  // Removes cached files of versions or modules that are no longer listed.
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

  compatible(m) {
    return !m.minClient || compareVersions(this.clientVersion, m.minClient) >= 0;
  }

  // What the player could run right now: used to tell whether a check changed anything.
  signature() {
    return JSON.stringify((this.state.list?.modulos || []).map((m) => [m.id, m.version, m.activo, this.readCached(m) !== null]));
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
    return (this.state.list?.modulos || [])
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
      }));
  }

  status() {
    return { available: this.enabled, checkedAt: this.state.checkedAt, error: this.state.error, secuencia: this.state.list?.secuencia || 0 };
  }

  // Scripts to run in the page, and the local userscripts they replace.
  scripts(settings) {
    if (!this.enabled || !settings.remoteModules || settings.tournamentMode) return { scripts: [], replaces: [] };
    const off = new Set(settings.remoteModulesOff || []);
    const scripts = [];
    const replaces = [];
    for (const m of this.state.list?.modulos || []) {
      if (!m.activo || off.has(m.id) || !this.compatible(m)) continue;
      const code = this.readCached(m);
      if (code === null) continue;
      scripts.push({ name: `RITE ${m.nombre} ${m.version}`, code });
      replaces.push(...m.reemplaza);
    }
    return { scripts, replaces };
  }
}

module.exports = { RemoteModules, verifyList, compareVersions, REPO, BRANCH, LIST };
