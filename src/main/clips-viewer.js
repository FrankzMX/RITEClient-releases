"use strict";

// "Mis clips": a window of the client (src/clips/viewer.*) that lists the
// clips of Documentos/RITEClient/clips, plays them, trims them and makes a
// copy small enough for Discord (10 MB). Only open while the player uses it.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PAGE = path.join(__dirname, "../clips/viewer.html");
const PRELOAD = path.join(__dirname, "../preload/clips-viewer.js");
const ICON = path.join(__dirname, "../assets/icon.png");
// Clip names as the client writes them (and the Discord copies, in /discord).
const NAME = /^[\w.() -]{1,120}\.mp4$/i;
const SHARE_DIR = "discord";
const MAX_READ = 1024 ** 3;

class ClipsViewer {
  constructor({ BrowserWindow, ipcMain, shell, clipboard, dir }) {
    this.BrowserWindow = BrowserWindow;
    this.shell = shell;
    this.clipboard = clipboard;
    this.dir = dir;
    this.win = null;

    const handle = (channel, fn) =>
      ipcMain.handle(channel, (event, ...args) => {
        if (!this.win || this.win.isDestroyed() || event.sender !== this.win.webContents) throw new Error("Untrusted sender");
        return fn(...args);
      });
    handle("viewer:list", () => this.list());
    handle("viewer:read", (name) => {
      const file = this.file(name);
      if (!file || fs.statSync(file).size > MAX_READ) return null;
      return fs.promises.readFile(file);
    });
    handle("viewer:save-share", (name, bytes) => this.saveShare(name, bytes));
    handle("viewer:reveal", (name, shared) => {
      const file = shared ? this.shareFile(name) : this.file(name);
      if (file && fs.existsSync(file)) this.shell.showItemInFolder(file);
      else this.shell.openPath(this.dir);
      return true;
    });
    handle("viewer:delete", async (name) => {
      const file = this.file(name);
      if (!file) return false;
      await this.shell.trashItem(file);
      return true;
    });
  }

  // A clip of the folder by name, or null (never a path outside it).
  file(name) {
    if (typeof name !== "string" || !NAME.test(name) || name.includes("..")) return null;
    const file = path.join(this.dir, name);
    return path.dirname(file) === this.dir && fs.existsSync(file) ? file : null;
  }

  shareFile(name) {
    if (typeof name !== "string" || !NAME.test(name)) return null;
    return path.join(this.dir, SHARE_DIR, name.replace(/\.mp4$/i, "-discord.mp4"));
  }

  async list() {
    let names = [];
    try {
      names = await fs.promises.readdir(this.dir);
    } catch {
      return [];
    }
    const clips = [];
    for (const name of names) {
      if (!NAME.test(name)) continue;
      const file = path.join(this.dir, name);
      try {
        const stat = await fs.promises.stat(file);
        if (stat.isFile()) clips.push({ name, size: stat.size, at: stat.mtimeMs, url: pathToFileURL(file).href });
      } catch {}
    }
    return clips.sort((a, b) => b.at - a.at);
  }

  // Writes the Discord copy next to the clips and puts it in the clipboard as
  // a file (Windows), so Ctrl+V in Discord attaches it.
  async saveShare(name, bytes) {
    const out = this.shareFile(name);
    if (!out || !this.file(name) || !(bytes instanceof Uint8Array || bytes instanceof ArrayBuffer)) return null;
    await fs.promises.mkdir(path.dirname(out), { recursive: true });
    await fs.promises.writeFile(out, Buffer.from(bytes));
    let copied = false;
    if (process.platform === "win32") {
      try {
        this.clipboard.writeBuffer("FileNameW", Buffer.concat([Buffer.from(out, "ucs2"), Buffer.alloc(2)]));
        copied = true;
      } catch {}
    }
    return { path: out, size: fs.statSync(out).size, copied };
  }

  open() {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.focus();
      this.win.webContents.send("viewer:refresh");
      return;
    }
    this.win = new this.BrowserWindow({
      title: "RITE Clips",
      icon: ICON,
      width: 1180,
      height: 720,
      minWidth: 820,
      minHeight: 520,
      backgroundColor: "#07060b",
      autoHideMenuBar: true,
      webPreferences: {
        preload: PRELOAD,
        partition: "rite-clips-viewer",
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

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.close();
  }
}

module.exports = { ClipsViewer };
