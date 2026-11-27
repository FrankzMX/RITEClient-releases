"use strict";

// «Crear swapper»: a window of the client (src/swapper-maker/*) to make or edit
// a swapper in Documentos/RITEClient/swappers/<nombre>/ without knowing Kirka's
// file names. Each slot (AR-9 → disparo, recarga, pasos en pasto…) maps to
// today's hashed file of Kirka, read from its app.js (src/main/kirka-assets.js).
// The swapper keeps a swapper.json with the slots by name, so after a Kirka
// patch the files are moved to the new names when the swapper is opened again.
//
// Nothing from Kirka is saved: originals are only played from kirka.io.

const fs = require("node:fs");
const path = require("node:path");
const { extractKirkaAssets } = require("./kirka-assets");
const { listSwappers, isSwapperName } = require("./swapper");

const PAGE = path.join(__dirname, "../swapper-maker/maker.html");
const PRELOAD = path.join(__dirname, "../preload/swapper-maker.js");
const ICON = path.join(__dirname, "../assets/icon-client.png");
const MANIFEST = "swapper.json";
const MAX_FILE = 8 * 1024 * 1024;
const ASSET_PATH = /^assets\/(media|img)\/[\w.\- ]{1,100}\.(mp3|wav|ogg|webp|png)$/;

// Names shown for Kirka's sounds (anything else keeps its file name).
const SOUND_NAMES = {
  __reload__: ["armas", "Recarga (todas las armas)"],
  "__bullet-dropping1__": ["armas", "Casquillo 1"],
  "__bullet-dropping2__": ["armas", "Casquillo 2"],
  __hit__: ["combate", "Hitmarker"],
  __kill1__: ["combate", "Kill 1"],
  __kill2__: ["combate", "Kill 2"],
  __kill3__: ["combate", "Kill 3"],
  __kill4__: ["combate", "Kill 4"],
  __kill5__: ["combate", "Kill 5"],
  __wound1__: ["combate", "Herida 1"],
  __wound2__: ["combate", "Herida 2"],
  __whoosh__: ["combate", "Whoosh"],
  __Earth__: ["pasos", "Pasos en tierra"],
  __Grass__: ["pasos", "Pasos en pasto"],
  __Mud__: ["pasos", "Pasos en lodo"],
  __Sand__: ["pasos", "Pasos en arena"],
  __Stone__: ["pasos", "Pasos en piedra"],
  __Water__: ["pasos", "Pasos en agua"],
  __Concrete__: ["pasos", "Pasos en concreto"],
  __NormalWood__: ["pasos", "Pasos en madera"],
  __Snow__: ["pasos", "Pasos en nieve"],
  __Carpet__: ["pasos", "Pasos en alfombra"],
  __ambient__: ["otros", "Ambiente"],
};

// Slots of the helper from what app.js gave (see extractKirkaAssets).
function buildSlots(assets) {
  const slots = [];
  const sharedUse = {};
  for (const [weapon, a] of Object.entries(assets.weapons)) if (a.use) (sharedUse[a.use] ||= []).push(weapon);
  for (const [weapon, a] of Object.entries(assets.weapons)) {
    if (a.use) {
      const others = sharedUse[a.use].filter((w) => w !== weapon);
      slots.push({ id: `${weapon}/disparo`, group: "armas", weapon, label: "Disparo", kind: "audio", path: a.use, note: others.length ? `Es el mismo sonido de ${others.join(", ")}` : "" });
    }
    if (a.texture) slots.push({ id: `${weapon}/skin`, group: "armas", weapon, label: "Skin por defecto", kind: "image", path: a.texture, note: "Se ve con la skin que se llama igual que el arma equipada" });
  }
  for (const [name, file] of Object.entries(assets.media)) {
    const [group, label] = SOUND_NAMES[name] || ["otros", name.replace(/^__|__\s*$/g, "")];
    slots.push({ id: `sonido/${name.trim()}`, group, label, kind: "audio", path: file });
  }
  return slots;
}

function readManifest(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8"));
    if (data && typeof data === "object" && data.slots && typeof data.slots === "object") return data;
  } catch {}
  return { formato: 1, slots: {} };
}

function inside(dir, rel) {
  if (typeof rel !== "string" || !ASSET_PATH.test(rel)) return null;
  const file = path.resolve(dir, rel);
  return file.startsWith(dir + path.sep) ? file : null;
}

// After a Kirka patch: moves each slot's file to today's name. Returns how many moved.
function relocate(dir, manifest, slots) {
  let moved = 0;
  for (const [id, entry] of Object.entries(manifest.slots)) {
    const slot = slots.find((s) => s.id === id);
    if (!slot || !entry || entry.archivo === slot.path) continue;
    const from = inside(dir, entry.archivo);
    const to = inside(dir, slot.path);
    if (!from || !to || !fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    entry.archivo = slot.path;
    moved++;
  }
  return moved;
}

// myinstants.com pages and direct links to an audio file or image.
async function resolveUrl(fetchText, raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (/(^|\.)myinstants\.com$/i.test(url.hostname) && !/\.mp3$/i.test(url.pathname)) {
    const html = await fetchText(url.href);
    const m = html && html.match(/\/media\/sounds\/[^"'\s?#)]+?\.mp3/i);
    return m ? new URL(m[0], url).href : null;
  }
  return url.href;
}

class SwapperMaker {
  constructor({ BrowserWindow, ipcMain, dialog, net, paths, settings, onChange, language = () => "es" }) {
    this.BrowserWindow = BrowserWindow;
    this.dialog = dialog;
    this.net = net;
    this.paths = paths;
    this.settings = settings;
    this.onChange = onChange; // the game's swapper rescans its folder
    this.language = language;
    this.win = null;
    this.catalog = null;

    const handle = (channel, fn) =>
      ipcMain.handle(channel, (event, ...args) => {
        if (!this.win || this.win.isDestroyed() || event.sender !== this.win.webContents) throw new Error("Untrusted sender");
        return fn(...args);
      });
    handle("maker:catalog", (force) => this.loadCatalog(Boolean(force)));
    handle("maker:list", () => ({ swappers: listSwappers(paths.swappers), activo: settings.get("swapperActivo") || "" }));
    handle("maker:open", (name) => this.open(name));
    handle("maker:read", (name, id) => this.read(name, id));
    handle("maker:original", (id) => this.original(id));
    handle("maker:fetch-url", (url) => this.fetchUrl(url));
    handle("maker:pick-file", (kind) => this.pickFile(kind));
    handle("maker:save", (name, changes, origins) => this.save(name, changes, origins));
    handle("maker:use", (name) => this.use(name));
  }

  async fetchBytes(url) {
    const res = await this.net.fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const size = Number(res.headers.get("content-length") || 0);
    if (size > MAX_FILE) throw new Error("too big");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FILE) throw new Error("too big");
    return buf;
  }

  // Today's slots, cached by the name of Kirka's app.js.
  async loadCatalog(force = false) {
    if (this.catalog && !force) return this.catalog;
    const index = (await this.fetchBytes("https://kirka.io/")).toString("utf8");
    const app = index.match(/assets\/js\/app\.([0-9a-f]{6,12})\.js/);
    if (!app) throw new Error("No encontré el app.js de Kirka");
    const src = (await this.fetchBytes(`https://kirka.io/${app[0]}`).catch(async () => {
      // app.js is bigger than MAX_FILE: read it without the limit.
      const res = await this.net.fetch(`https://kirka.io/${app[0]}`);
      return Buffer.from(await res.arrayBuffer());
    })).toString("utf8");
    const assets = extractKirkaAssets(src);
    if (!assets) throw new Error("No pude leer los nombres de Kirka (¿cambió el juego?)");
    this.catalog = { kirka: app[1], slots: buildSlots(assets) };
    return this.catalog;
  }

  dirOf(name) {
    if (!isSwapperName(name)) return null;
    const dir = path.join(this.paths.swappers, name);
    return path.dirname(dir) === this.paths.swappers ? dir : null;
  }

  async open(name) {
    const dir = this.dirOf(name);
    if (!dir || !fs.existsSync(dir)) return null;
    const { slots, kirka } = await this.loadCatalog();
    const manifest = readManifest(dir);
    const moved = relocate(dir, manifest, slots);
    if (moved) {
      manifest.kirka = kirka;
      fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2));
    }
    // Files already there (also in swappers made by hand, without swapper.json).
    const present = {};
    for (const slot of slots) if (fs.existsSync(path.join(dir, slot.path))) present[slot.id] = manifest.slots[slot.id]?.origen || "archivo";
    return { name, present, moved };
  }

  async read(name, id) {
    const dir = this.dirOf(name);
    const slot = (await this.loadCatalog()).slots.find((s) => s.id === id);
    const file = dir && slot ? inside(dir, slot.path) : null;
    if (!file || !fs.existsSync(file) || fs.statSync(file).size > MAX_FILE) return null;
    return fs.promises.readFile(file);
  }

  // Kirka's own file, only to play it here (never saved).
  async original(id) {
    const slot = (await this.loadCatalog()).slots.find((s) => s.id === id);
    return slot ? this.fetchBytes(`https://kirka.io/${slot.path}`) : null;
  }

  async fetchUrl(raw) {
    const url = await resolveUrl(async (u) => (await this.fetchBytes(u)).toString("utf8"), raw);
    if (!url) return { error: "Pega un enlace https de myinstants o de un .mp3/.ogg/.wav/.png/.webp" };
    try {
      return { bytes: await this.fetchBytes(url), name: decodeURIComponent(new URL(url).pathname.split("/").pop() || "url"), origen: url };
    } catch (e) {
      return { error: e.message === "too big" ? "El archivo pesa más de 8 MB" : "No se pudo descargar" };
    }
  }

  async pickFile(kind) {
    const filters = kind === "image" ? [{ name: "Imagen", extensions: ["png", "webp", "jpg", "jpeg"] }] : [{ name: "Sonido", extensions: ["mp3", "wav", "ogg", "m4a", "webm"] }];
    const { canceled, filePaths } = await this.dialog.showOpenDialog(this.win, { properties: ["openFile"], filters });
    if (canceled || !filePaths[0]) return null;
    if (fs.statSync(filePaths[0]).size > MAX_FILE) return { error: "El archivo pesa más de 8 MB" };
    return { bytes: await fs.promises.readFile(filePaths[0]), name: path.basename(filePaths[0]), origen: path.basename(filePaths[0]) };
  }

  // changes: { slotId: Uint8Array (new file) | null (remove) }; origins: { slotId: text }.
  async save(name, changes, origins = {}) {
    const dir = this.dirOf(name);
    if (!dir) return { error: "Nombre no válido" };
    const { slots, kirka } = await this.loadCatalog();
    fs.mkdirSync(dir, { recursive: true });
    const manifest = readManifest(dir);
    manifest.formato = 1;
    manifest.nombre = name;
    manifest.kirka = kirka;
    let written = 0;
    for (const [id, bytes] of Object.entries(changes || {})) {
      const slot = slots.find((s) => s.id === id);
      const file = slot ? inside(dir, slot.path) : null;
      if (!file) continue;
      if (bytes === null) {
        fs.rmSync(file, { force: true });
        delete manifest.slots[id];
        continue;
      }
      if (!(bytes instanceof Uint8Array) || bytes.length > MAX_FILE) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(bytes));
      manifest.slots[id] = { archivo: slot.path, origen: String(origins[id] || "").slice(0, 300) };
      written++;
    }
    fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2));
    this.onChange?.();
    return { ok: true, written };
  }

  use(name) {
    if (name !== "" && !this.dirOf(name)) return false;
    return this.settings.set("swapperActivo", name);
  }

  show() {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.focus();
      return;
    }
    this.win = new this.BrowserWindow({
      title: "RITE · Crear swapper",
      icon: ICON,
      width: 1100,
      height: 760,
      minWidth: 760,
      minHeight: 520,
      backgroundColor: "#07060b",
      autoHideMenuBar: true,
      webPreferences: {
        preload: PRELOAD,
        additionalArguments: [`--rite-lang=${this.language()}`],
        partition: "rite-swapper-maker",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    this.win.removeMenu();
    const wc = this.win.webContents;
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (event) => event.preventDefault());
    this.win.on("closed", () => {
      this.win = null;
    });
    this.win.loadFile(PAGE);
  }
}

module.exports = { SwapperMaker, buildSlots, relocate, readManifest, resolveUrl, MANIFEST };
