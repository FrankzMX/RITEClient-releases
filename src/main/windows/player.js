"use strict";

// The player window: a Kirka page of its own, apart from the game window, for
// the licensed RITE Repetición module (id "repeticion"). The client only gives
// the window (no system frame: the module draws its own title bar with the
// controls below), the local relay (replay-relay.js) and the rite:// links;
// everything that plays comes in the module, so only players with that
// module's license can use it. It shares the game's session, so it sees the
// recordings RITE Grabador keeps, and remembers where it was (another screen
// too) and its size.

const fs = require("node:fs");
const path = require("node:path");
const { isGameOrigin } = require("../navigation");

const MODULE_ID = "repeticion";
const MIN = { width: 800, height: 450 };

// { x, y, width, height, maximized } where it was, if that place is still on a screen.
function savedBounds(file, screen) {
  try {
    const b = JSON.parse(fs.readFileSync(file, "utf8"));
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null;
    const visible = screen.getAllDisplays().some(({ workArea: a }) => b.x + 100 < a.x + a.width && b.x + b.width - 100 > a.x && b.y >= a.y - 10 && b.y + 40 < a.y + a.height);
    return visible ? { ...b, width: Math.max(MIN.width, b.width), height: Math.max(MIN.height, b.height) } : null;
  } catch {
    return null;
  }
}

class Player {
  // getModule(): { code, name } of the repeticion module when it may run now, else null.
  // language(): "es" or "en", the client's language, given to the module.
  constructor({ BrowserWindow, screen, getModule, baseUrl, stateFile, preload, icon, language = () => "es" }) {
    Object.assign(this, { BrowserWindow, screen, getModule, baseUrl, stateFile, preload, icon, language });
    this.win = null;
  }

  alive() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  available() {
    return Boolean(this.getModule());
  }

  // Opens (or brings up) the window. `hash`: "rite-rep=<id>&t=<s>" to start a recording.
  open(hash = "") {
    if (!this.available()) return false;
    const url = new URL(this.baseUrl());
    url.pathname = "/";
    url.search = "";
    url.hash = hash;
    if (this.alive()) {
      if (hash) this.win.webContents.loadURL(url.toString());
      if (this.win.isMinimized()) this.win.restore();
      this.win.show();
      this.win.focus();
      return true;
    }
    const saved = savedBounds(this.stateFile, this.screen);
    const win = new this.BrowserWindow({
      title: "RITE Reproductor",
      icon: this.icon,
      ...(saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : { width: 1280, height: 720 }),
      minWidth: MIN.width,
      minHeight: MIN.height,
      frame: false,
      show: false,
      backgroundColor: "#0b0b10",
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
        // On another screen while the player plays: it must keep drawing.
        backgroundThrottling: false,
        spellcheck: false,
        additionalArguments: [`--rite-lang=${this.language()}`],
      },
    });
    this.win = win;
    win.removeMenu();
    win.once("ready-to-show", () => {
      if (saved?.maximized) win.maximize();
      win.show();
    });
    win.on("page-title-updated", (event) => event.preventDefault());
    const wc = win.webContents;
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    // Only Kirka pages: the window has nothing else to show.
    wc.on("will-navigate", (event, next) => {
      if (!isGameOrigin(next)) event.preventDefault();
    });
    const save = () => {
      if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
      const maximized = win.isMaximized();
      const b = maximized ? { ...this.lastBounds } : win.getBounds();
      try {
        fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
        fs.writeFileSync(this.stateFile, JSON.stringify({ ...b, maximized }));
      } catch {}
    };
    const remember = () => {
      if (!win.isMaximized() && !win.isFullScreen() && !win.isMinimized()) this.lastBounds = win.getBounds();
    };
    this.lastBounds = saved ?? null;
    win.on("resize", remember);
    win.on("move", remember);
    win.on("close", save);
    win.on("closed", () => {
      if (this.win === win) this.win = null;
    });
    wc.loadURL(url.toString());
    return true;
  }

  // The module's code for the window's preload, only for this window's top frame on Kirka.
  codeFor(event) {
    if (!this.alive() || event.sender !== this.win.webContents || event.senderFrame !== this.win.webContents.mainFrame) return null;
    if (!isGameOrigin(event.senderFrame.url)) return null;
    return this.getModule();
  }

  // The title bar buttons.
  control(event, action) {
    if (!this.alive() || event.sender !== this.win.webContents) return false;
    const win = this.win;
    if (action === "minimize") win.minimize();
    else if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === "fullscreen") win.setFullScreen(!win.isFullScreen());
    else if (action === "close") win.close();
    else return false;
    return true;
  }
}

module.exports = { Player, MODULE_ID, savedBounds };
