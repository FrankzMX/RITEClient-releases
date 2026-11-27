"use strict";

// The Trade Helper's "ear": a second Kirka window, hidden and muted, that stays
// on the Servers screen with its chat open so the trade lines keep coming while
// the player is in a match (Kirka only sends that chat while Servers is open).
// It uses the player's own session, never writes anything and draws at about
// two frames a second. The lines go to the game window, which shows the ones
// that matter as notices (src/preload/features/trade.js).

const { installTradePage } = require("../preload/features/trade");

const POLL_MS = 2000;

// Slows the hidden page down to ~2 frames a second: it only has to keep the chat.
const SLOW_FRAMES = `(() => {
  if (window.__riteEarSlow) return;
  window.__riteEarSlow = true;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 500);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
})(); true`;

// Opens the Servers screen if a button with that name is on the page. Kirka's
// menu changes, so this is a best try; "Mostrar oído" lets the player open it.
const OPEN_SERVERS = `(() => {
  const want = /^(servers|servidores|server list|servers list)$/i;
  const all = document.querySelectorAll("button, a, div, span");
  for (const el of all) {
    const text = (el.childElementCount === 0 ? el.textContent : "").trim();
    if (want.test(text)) { (el.closest("button, a, [role=button]") || el).click(); return true; }
  }
  return false;
})()`;

class TradeEar {
  constructor({ BrowserWindow, getUrl, isAllowed, onLines, onState = () => {} }) {
    this.BrowserWindow = BrowserWindow;
    this.getUrl = getUrl;
    this.isAllowed = isAllowed;
    this.onLines = onLines;
    this.onState = onState;
    this.win = null;
    this.timer = null;
    this.state = { on: false, listening: false, visible: false };
    this.tries = 0;
  }

  alive() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  setState(next) {
    this.state = { ...this.state, ...next };
    this.onState(this.state);
  }

  start() {
    if (this.alive()) return;
    const win = new this.BrowserWindow({
      title: "RITE · Oído del Trade Helper",
      width: 1100,
      height: 700,
      show: false,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: "#0b0b10",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Hidden, it must keep its timers running to keep reading the chat.
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    this.win = win;
    win.removeMenu();
    const wc = win.webContents;
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (event, url) => {
      if (!this.isAllowed(url)) event.preventDefault();
    });
    wc.on("dom-ready", () => {
      this.tries = 0;
      wc.executeJavaScript(SLOW_FRAMES).catch(() => {});
      wc.executeJavaScript(`(${installTradePage.toString()})(window); true`).catch(() => {});
    });
    // Closing it with the X only hides it.
    win.on("close", (event) => {
      if (this.state.on) {
        event.preventDefault();
        this.hide();
      }
    });
    win.on("closed", () => {
      this.win = null;
      clearInterval(this.timer);
      this.timer = null;
      this.setState({ on: false, listening: false, visible: false });
    });
    win.loadURL(this.getUrl());
    this.setState({ on: true, listening: false, visible: false });
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  async poll() {
    if (!this.alive()) return;
    const wc = this.win.webContents;
    try {
      const r = await wc.executeJavaScript("window.__riteTrade ? window.__riteTrade.poll() : { ok: false }");
      const ok = Boolean(r && r.ok);
      if (ok && r.lines.length) this.onLines(r.lines.slice(0, 100));
      // No chat yet: try to open Servers a few times after each load.
      if (!ok && this.tries < 10) {
        this.tries++;
        wc.executeJavaScript(OPEN_SERVERS).catch(() => {});
      }
      if (ok !== this.state.listening) this.setState({ listening: ok });
    } catch {}
  }

  show() {
    if (!this.alive()) this.start();
    this.win.show();
    this.win.focus();
    this.setState({ visible: true });
  }

  hide() {
    if (!this.alive()) return;
    this.win.hide();
    this.setState({ visible: false });
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    const win = this.win;
    this.state.on = false;
    if (win && !win.isDestroyed()) win.destroy();
    this.win = null;
    this.setState({ on: false, listening: false, visible: false });
  }
}

module.exports = { TradeEar };
