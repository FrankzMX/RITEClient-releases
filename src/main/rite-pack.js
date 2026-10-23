"use strict";

// RITE pack: Kirka's weapon (and optionally character) textures recolored to
// the RITE palette on the fly, so it keeps working when Kirka renames its
// files. The swapper sends candidate images here; anything that is not a
// weapon or a character skin goes back untouched.
//
// Characters get one flat dark tone over the whole skin: nothing (head
// included) is made to stand out, so no player is easier to see.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MODES = ["off", "weapons", "all"];
const MARK = "rite-orig=1"; // the swapper never redirects a request carrying it
const LOG_MAX = 1000;
const MEMORY_MAX = 48; // textures kept in memory (least recently used go first)
const DISK_MAX_FILES = 400;
const DISK_MAX_BYTES = 200 * 1024 * 1024;

// Kirka weapons, as they tend to appear in texture file names.
const WEAPON = /(^|[^a-z])(ar-?9|weatie|lar|scar|vita|m60|mac-?10|shark|revolver|bayonet|tomahawk|knife|sniper|shotgun|pistol|rifle|smg|minigun|weapon|gun)([^a-z]|$)/i;

const isCandidate = (pathname) => /^\/assets\/.+\.(png|webp)$/i.test(pathname) && !/__shooting-fire__|logo|icon|avatar|emoji|flag|bg|background|ui/i.test(pathname);

// Textures of Kirka's 3D models (weapons and characters ship as .glb with a
// separate /assets/img/texture.<hash>.webp). Not texture-mini: menu previews.
const MODEL_TEXTURE = /^texture\.[0-9a-f]{6,}\.(webp|png)$/i;

// What to do with a texture: "weapon", "character" or null (leave it).
// Characters are 64×64 skins; Kirka's weapon textures are 1024×1024 WebP.
function classify(pathname, width, height, mode) {
  if (mode === "off" || !width || !height) return null;
  const name = path.posix.basename(pathname);
  if (!MODEL_TEXTURE.test(name) && !WEAPON.test(name)) return null;
  if (width === 64 && height === 64) return mode === "all" ? "character" : null;
  return width <= 2048 && height <= 2048 ? "weapon" : null;
}

const mix = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// RGB stops (0-255).
const DARK = [13, 11, 18];
const STEEL = [58, 51, 70];
const GOLD_LOW = [176, 133, 48];
const GOLD_HIGH = [243, 212, 138];
const SKIN_LOW = [20, 17, 26];
const SKIN_HIGH = [74, 65, 82];

// The recolor as one 256-entry table per kind, indexed by luminance: three
// lookups per pixel instead of working out the gradient every time.
function buildTable(kind) {
  const table = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    let rgb;
    if (kind === "character") rgb = lerp3(SKIN_LOW, SKIN_HIGH, l);
    else if (l < 0.72) rgb = lerp3(DARK, STEEL, l / 0.72);
    else rgb = lerp3(GOLD_LOW, GOLD_HIGH, (l - 0.72) / 0.28);
    table.set(rgb.map(Math.round), i * 3);
  }
  return table;
}
const TABLES = { weapon: buildTable("weapon"), character: buildTable("character") };

// Recolors a bitmap in place: BGRA (nativeImage, Chromium's order on Windows
// and Linux) or RGBA (canvas ImageData).
function recolor(bitmap, kind, order = "bgra") {
  const [r, b] = order === "rgba" ? [0, 2] : [2, 0];
  const table = kind === "character" ? TABLES.character : TABLES.weapon;
  for (let i = 0; i < bitmap.length; i += 4) {
    if (bitmap[i + 3] === 0) continue;
    // Luminance (0.114 B + 0.587 G + 0.299 R) in integers.
    const k = ((29 * bitmap[i + b] + 150 * bitmap[i + 1] + 77 * bitmap[i + r] + 128) >> 8) * 3;
    bitmap[i + r] = table[k];
    bitmap[i + 1] = table[k + 1];
    bitmap[i + b] = table[k + 2];
  }
  return bitmap;
}

// Recolored textures on disk (userData), so each one is made once and not on
// every session. Each entry keeps the original's ETag / Last-Modified: the
// next time Kirka answers "not modified" and the saved one is used. Oldest
// entries go first past the limits.
class DiskCache {
  constructor(dir) {
    this.dir = dir;
    this.writes = 0;
    if (dir) this.prune();
  }

  key(mode, url) {
    return crypto.createHash("sha1").update(`${mode}\n${url}`).digest("hex");
  }

  async get(key) {
    if (!this.dir) return null;
    try {
      const meta = JSON.parse(await fs.promises.readFile(path.join(this.dir, `${key}.json`), "utf8"));
      const body = meta.keep ? null : await fs.promises.readFile(path.join(this.dir, `${key}.img`));
      const now = new Date();
      fs.promises.utimes(path.join(this.dir, `${key}.json`), now, now).catch(() => {});
      return { meta, body };
    } catch {
      return null;
    }
  }

  async set(key, meta, body) {
    if (!this.dir || (!meta.etag && !meta.lastModified)) return;
    try {
      await fs.promises.mkdir(this.dir, { recursive: true });
      if (body) await fs.promises.writeFile(path.join(this.dir, `${key}.img`), body);
      await fs.promises.writeFile(path.join(this.dir, `${key}.json`), JSON.stringify(meta));
      if (++this.writes % 20 === 0) this.prune();
    } catch {}
  }

  async prune() {
    try {
      const names = (await fs.promises.readdir(this.dir)).filter((n) => n.endsWith(".json"));
      const entries = [];
      for (const name of names) {
        const base = name.slice(0, -5);
        const meta = await fs.promises.stat(path.join(this.dir, name));
        const img = await fs.promises.stat(path.join(this.dir, `${base}.img`)).catch(() => null);
        entries.push({ base, time: meta.mtimeMs, size: meta.size + (img ? img.size : 0) });
      }
      entries.sort((a, b) => b.time - a.time);
      let total = 0;
      for (const [i, e] of entries.entries()) {
        total += e.size;
        if (i < DISK_MAX_FILES && total <= DISK_MAX_BYTES) continue;
        await fs.promises.rm(path.join(this.dir, `${e.base}.json`), { force: true });
        await fs.promises.rm(path.join(this.dir, `${e.base}.img`), { force: true });
      }
    } catch {}
  }
}

class RitePack {
  // `send(channel, payload)` (optional) reaches the game window, which decodes
  // and recolors the formats nativeImage cannot read (WebP) and answers via
  // `decoded()`.
  // `cacheDir` keeps the recolored textures between sessions; `debug` writes
  // the list of what Kirka loads (texturas-kirka.txt) to tune the weapon names.
  constructor({ net, nativeImage, logFile, send = null, cacheDir = null, debug = false }) {
    this.send = send;
    this.waiting = new Map();
    this.seq = 0;
    this.net = net;
    this.nativeImage = nativeImage;
    this.logFile = logFile;
    this.mode = "off";
    this.cache = new Map();
    this.logged = new Set();
    this.disk = new DiskCache(cacheDir);
    this.debug = debug;
  }

  // Async and only in debug: a sync write blocked the main process mid-load.
  append(text) {
    if (!this.debug || !this.logFile) return;
    fs.promises.appendFile(this.logFile, text).catch(() => {});
  }

  setMode(mode) {
    this.mode = MODES.includes(mode) ? mode : "off";
    this.cache.clear();
  }

  // Notes what the game page downloaded (from its resource timing, sent by the
  // preload): models, atlases and skins may not be plain images, and this
  // list shows where Kirka keeps them.
  note(entries) {
    if (this.mode === "off" || !this.debug || !this.logFile || !Array.isArray(entries)) return;
    const lines = [];
    for (const entry of entries.slice(0, 200)) {
      if (!entry || typeof entry.name !== "string" || this.logged.size >= LOG_MAX) continue;
      let url;
      try {
        url = new URL(entry.name);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || url.search.includes(MARK)) continue;
      const where = `${url.host}${url.pathname}`.slice(0, 300);
      if (this.logged.has(where)) continue;
      this.logged.add(where);
      const kind = String(entry.type || "?").replace(/\W/g, "").slice(0, 20);
      const size = Number.isFinite(entry.size) ? entry.size : "?";
      lines.push(`red\t${kind}\t${size}\t${where}`);
    }
    if (lines.length) this.append(lines.join("\n") + "\n");
  }

  wants(url) {
    if (this.mode === "off" || url.search.includes(MARK)) return false;
    return isCandidate(url.pathname);
  }

  // Lists what Kirka loads (size and path) so the weapon names can be tuned.
  log(pathname, width, height, kind) {
    if (!this.debug || !this.logFile || this.logged.size >= LOG_MAX || this.logged.has(pathname)) return;
    this.logged.add(pathname);
    this.append(`${width}x${height}\t${kind || "-"}\t${pathname}\n`);
  }

  decode(payload) {
    return new Promise((resolve) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve(null);
      }, 8000);
      this.waiting.set(id, (out) => {
        clearTimeout(timer);
        resolve(out);
      });
      if (!this.send("pack:decode", { id, bytes: new Uint8Array(payload.bytes), type: payload.type, pathname: payload.pathname, mode: payload.mode })) {
        this.waiting.get(id)(null);
        this.waiting.delete(id);
      }
    });
  }

  // The game window's answer to `decode`. Only well-formed answers count.
  decoded(out) {
    const done = out && this.waiting.get(out.id);
    if (!done) return;
    this.waiting.delete(out.id);
    const ok = ["weapon", "character"].includes(out.kind) && out.image instanceof Uint8Array && out.image.length < 16 * 1024 * 1024 && ["image/webp", "image/png"].includes(out.type);
    done({ width: Number(out.width) || 0, height: Number(out.height) || 0, kind: ok ? out.kind : null, image: ok ? out.image : null, type: ok ? out.type : null });
  }

  async serve(original) {
    const key = `${this.mode}:${original}`;
    let job = this.cache.get(key);
    if (job) this.cache.delete(key); // back to the end: most recently used
    else job = this.render(original).catch(() => null);
    this.cache.set(key, job);
    while (this.cache.size > MEMORY_MAX) this.cache.delete(this.cache.keys().next().value);
    const out = await job;
    if (out) return new Response(out.body, { headers: { "content-type": out.type, "access-control-allow-origin": "*" } });
    this.cache.delete(key);
    return this.net.fetch(withMark(original));
  }

  // Null means "serve the original" (it isn't a weapon or a character).
  async render(original) {
    const diskKey = this.disk.key(this.mode, original);
    const saved = await this.disk.get(diskKey);
    const headers = {};
    if (saved?.meta.etag) headers["if-none-match"] = saved.meta.etag;
    else if (saved?.meta.lastModified) headers["if-modified-since"] = saved.meta.lastModified;
    const res = await this.net.fetch(withMark(original), { headers });
    if (res.status === 304 && saved) return saved.meta.keep ? null : { body: saved.body, type: saved.meta.type };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = { etag: res.headers.get("etag") || "", lastModified: res.headers.get("last-modified") || "" };
    const out = await this.recolorResponse(res, original);
    this.disk.set(diskKey, out ? { ...meta, type: out.type } : { ...meta, keep: true }, out ? out.body : null);
    return out;
  }

  async recolorResponse(res, original) {
    const type = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());
    const pathname = new URL(original).pathname;
    const image = this.nativeImage.createFromBuffer(buffer);
    const { width, height } = image.getSize();
    if ((!width || !height) && this.send) {
      const out = await this.decode({ bytes: buffer, type, pathname, mode: this.mode });
      this.log(pathname, out?.width || 0, out?.height || 0, out?.kind);
      return out?.kind && out.image ? { body: Buffer.from(out.image), type: out.type } : null;
    }
    const kind = classify(pathname, width, height, this.mode);
    this.log(pathname, width, height, kind);
    if (!kind) return null;
    const bitmap = recolor(Buffer.from(image.toBitmap()), kind);
    return { body: this.nativeImage.createFromBitmap(bitmap, { width, height }).toPNG(), type: "image/png" };
  }
}

function withMark(original) {
  const url = new URL(original);
  url.search = url.search ? `${url.search}&${MARK}` : `?${MARK}`;
  return url.href;
}

const logPath = (root) => path.join(root, "texturas-kirka.txt");

module.exports = { RitePack, classify, recolor, isCandidate, withMark, logPath, MODES, MARK };
