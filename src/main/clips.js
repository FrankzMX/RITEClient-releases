"use strict";

// RITE Clips: "save the last 30 seconds" with a key (F8). A hidden recorder
// window (src/clips) films the game window while Kirka is open and clips are
// on, keeping only the last seconds already compressed (H.264 by the graphics
// card when it can). Saving writes them as an .mp4 in Documentos/RITEClient/clips.
// Off by default: filming always costs something, even on the graphics card.

const fs = require("node:fs");
const path = require("node:path");

const PAGE = path.join(__dirname, "../clips/recorder.html");
const PRELOAD = path.join(__dirname, "../preload/clips.js");
const PARTITION = "rite-clips";
const SAVE_TIMEOUT = 15000;
const LEAVE_DELAY = 5000;

// Bits per second for each height at 60 FPS (30 FPS uses 60 %).
const BITRATE = { 720: 8e6, 1080: 14e6, 1440: 24e6 };

function clipOptions(settings) {
  const height = Number(settings.clipsQuality) || 1080;
  const fps = Number(settings.clipsFps) || 60;
  const seconds = Number(settings.clipsSeconds) || 30;
  const bitrate = Math.round((BITRATE[height] || BITRATE[1080]) * (fps >= 60 ? 1 : 0.6));
  return { height, fps, seconds, bitrate, audio: settings.clipsAudio !== false };
}

const pad = (n) => String(n).padStart(2, "0");
const clipName = (d = new Date()) =>
  `RITE-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.mp4`;

class Clips {
  constructor({ BrowserWindow, ipcMain, session, getSettings, dir, notify }) {
    this.BrowserWindow = BrowserWindow;
    this.getSettings = getSettings;
    this.dir = dir;
    this.notify = notify;
    this.win = null;
    this.source = null;
    this.status = { state: "off" };
    this.pending = new Map();
    this.nextId = 1;
    // Whether Kirka is in a match (/games/…): with clipsOnlyMatch it only films then.
    this.inMatch = false;
    this.leaveTimer = null;

    // The recorder's own session: it only ever gets to film (the game window
    // and, with clipsAudio, the PC's sound), nothing else.
    const ses = session.fromPartition(PARTITION);
    ses.setPermissionRequestHandler((wc, permission, done) => done(this.isRecorder(wc) && permission === "media"));
    ses.setPermissionCheckHandler((wc, permission) => this.isRecorder(wc) && permission === "media");

    const from = (event) => this.isRecorder(event.sender);
    ipcMain.on("clips:ready", (event) => from(event) && this.begin());
    ipcMain.on("clips:status", (event, state) => {
      if (!from(event) || !state || typeof state !== "object") return;
      this.status = state;
      if (state.state === "error") this.notify?.(`Clips: ${String(state.message || "error").slice(0, 160)}`, "error");
      // No video encoder on this PC: the processor does the work, once said.
      if (state.state === "recording" && state.hardware === false && !this.warned) {
        this.warned = true;
        this.notify?.("Clips: esta PC no tiene codificador de video, así que graba con el procesador y puede bajar tus FPS. Prueba 720p a 30 FPS en «Clips», o apágalos.", "info");
      }
    });
    ipcMain.on("clips:saved", (event, id, result) => {
      if (!from(event)) return;
      const done = this.pending.get(id);
      if (done) {
        this.pending.delete(id);
        done(result);
      }
    });
  }

  isRecorder(wc) {
    return Boolean(this.win && !this.win.isDestroyed() && wc === this.win.webContents);
  }

  get running() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  // Follows the game window: films it while it's open and clips are on.
  setSource(win) {
    this.source = win && !win.isDestroyed() ? win : null;
    if (!this.source) {
      clearTimeout(this.leaveTimer);
      this.inMatch = false;
    }
    this.apply();
  }

  // The game window's address changed. Entering a match starts filming at once;
  // leaving it pauses a few seconds later (a quick hop between pages is not leaving).
  setUrl(url) {
    let match = false;
    try {
      match = /^\/games\//.test(new URL(url).pathname);
    } catch {}
    if (match) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
      if (!this.inMatch) {
        this.inMatch = true;
        if (this.getSettings().clipsOnlyMatch) this.apply();
      }
    } else if (this.inMatch && !this.leaveTimer) {
      this.leaveTimer = setTimeout(() => {
        this.leaveTimer = null;
        this.inMatch = false;
        if (this.getSettings().clipsOnlyMatch) this.apply();
      }, LEAVE_DELAY);
    }
  }

  // Films now? Always, or only in a match with clipsOnlyMatch.
  get wanted() {
    return !this.getSettings().clipsOnlyMatch || this.inMatch;
  }

  apply() {
    const on = Boolean(this.getSettings().clipsEnabled) && Boolean(this.source);
    if (!on) return this.stop();
    if (this.running) return this.begin();
    this.win = new this.BrowserWindow({
      show: false,
      width: 320,
      height: 200,
      skipTaskbar: true,
      webPreferences: {
        preload: PRELOAD,
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Hidden, but it has to keep up with every frame.
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    const wc = this.win.webContents;
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (event) => event.preventDefault());
    wc.on("render-process-gone", () => this.stop());
    this.win.on("closed", () => {
      this.win = null;
      this.status = { state: "off" };
      for (const done of this.pending.values()) done(null);
      this.pending.clear();
    });
    this.win.loadFile(PAGE);
  }

  // (Re)starts filming with the current settings once the recorder page is ready.
  begin() {
    if (!this.running || !this.source || this.source.isDestroyed()) return;
    // Out of a match the recorder stays open (ready to start at once) but paused.
    if (!this.wanted) return this.win.webContents.send("clips:pause");
    this.win.webContents.send("clips:start", { sourceId: this.source.getMediaSourceId(), ...clipOptions(this.getSettings()) });
  }

  stop() {
    if (this.running) this.win.destroy();
    this.win = null;
  }

  // Saves the buffer as an .mp4. Returns the file's path, or null.
  // `reason`: set for automatic clips ("triple kill"); they never complain.
  async save(reason) {
    const ready = this.status.state === "recording" || (this.status.state === "paused" && this.status.saved);
    if (!this.running || !ready) {
      if (reason) return null;
      const s = this.getSettings();
      this.notify?.(!s.clipsEnabled ? "Clips apagados: actívalos en el menú, en «Clips»." : this.status.state === "paused" ? "Clips: solo graba durante la partida." : "Clips: todavía no hay nada grabado.", "info");
      return null;
    }
    const id = this.nextId++;
    const result = await new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.win.webContents.send("clips:save", id);
      setTimeout(() => {
        if (this.pending.delete(id)) resolve(null);
      }, SAVE_TIMEOUT);
    });
    if (!result || result.error || !result.buffer) {
      this.notify?.(`Clips: no se pudo guardar${result?.error ? ` (${String(result.error).slice(0, 120)})` : ""}.`, "error");
      return null;
    }
    const file = path.join(this.dir, clipName());
    try {
      await fs.promises.mkdir(this.dir, { recursive: true });
      await fs.promises.writeFile(file, Buffer.from(result.buffer));
    } catch (e) {
      this.notify?.(`Clips: no se pudo escribir el archivo (${e.code || e.message}).`, "error");
      return null;
    }
    this.notify?.(`${reason ? `Clip automático (${reason})` : "Clip guardado"}: ${result.seconds} s${result.audio ? "" : ", sin sonido"} (${path.basename(file)})`, "success");
    return file;
  }
}

module.exports = { Clips, clipOptions, clipName };
