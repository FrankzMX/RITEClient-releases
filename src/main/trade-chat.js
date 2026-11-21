"use strict";

// The Trade Helper's live chat: Kirka's global chat read straight from
// wss://chat.kirka.io (the same chat as the Servers screen). It needs no
// session, no token and no second Kirka window: the socket sends the last 50
// lines when it opens and then each new one. It only reads. If it cannot
// connect, the hidden Kirka window (src/main/trade-ear.js) can take over.
//
// What comes in (seen 18-nov-2026):
//   { type: 3, messages: [...] }                 last 50, on connect
//   { type: 2, user: { name, shortId, role… }, message, msgId }   a player
//   { type: 13, user: null, message, msgId }     the server (public offers)
// The lines go out as { name, message } like the ones read from Kirka's store,
// with `old: true` for the history (so it fills the panel without notices).

const URL = "wss://chat.kirka.io";
const FIRST_WAIT_MS = 4000;
const MAX_WAIT_MS = 60 * 1000;
const OPEN_TIMEOUT_MS = 15 * 1000;
// Without any line for this long the socket is taken as dead and reopened.
const SILENT_MS = 3 * 60 * 1000;
const FLUSH_MS = 500;
// After this many failed tries in a row it says it is down (the ear may take over).
const DOWN_AFTER = 3;

// One message of the socket -> its chat line, or null.
function toLine(m, old = false) {
  if (!m || typeof m !== "object" || typeof m.message !== "string") return null;
  const message = m.message.slice(0, 300);
  if (!message.trim()) return null;
  const u = m.user && typeof m.user === "object" ? m.user : null;
  const name = u ? String(u.name || "").slice(0, 60) : "SERVER";
  const line = { name, message };
  if (u && u.shortId) line.id = String(u.shortId).slice(0, 12);
  if (u && u.role === "BOT") line.bot = true;
  if (old) line.old = true;
  return line;
}

// A frame of the socket (text) -> its chat lines.
function linesOf(data) {
  let d;
  try {
    d = JSON.parse(typeof data === "string" ? data : String(data));
  } catch {
    return [];
  }
  if (Array.isArray(d)) return d.map((m) => toLine(m, true)).filter(Boolean);
  if (!d || typeof d !== "object") return [];
  if (Array.isArray(d.messages)) return d.messages.map((m) => toLine(m, true)).filter(Boolean);
  const line = toLine(d);
  return line ? [line] : [];
}

class TradeChat {
  constructor({ WebSocket = globalThis.WebSocket, onLines, onState = () => {}, url = URL } = {}) {
    this.WebSocket = WebSocket;
    this.onLines = onLines;
    this.onState = onState;
    this.url = url;
    this.ws = null;
    this.wanted = false;
    this.fails = 0;
    this.retry = null;
    this.openTimer = null;
    this.silentTimer = null;
    this.flushTimer = null;
    this.pending = [];
    this.last = []; // the last 50 lines, for a game page that loads again
    this.state = { on: false, open: false, down: false };
  }

  // The last lines, as history (for a page that was not there when they came).
  recent() {
    return this.last.map((l) => ({ ...l, old: true }));
  }

  setState(next) {
    const before = this.state;
    this.state = { ...before, ...next };
    if (before.on !== this.state.on || before.open !== this.state.open || before.down !== this.state.down) this.onState(this.state);
  }

  start() {
    if (this.wanted) return;
    this.wanted = true;
    this.fails = 0;
    this.setState({ on: true, open: false, down: false });
    this.connect();
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.retry);
    this.retry = null;
    this.drop();
    this.pending = [];
    this.last = [];
    this.setState({ on: false, open: false, down: false });
  }

  drop() {
    clearTimeout(this.openTimer);
    clearTimeout(this.silentTimer);
    clearTimeout(this.flushTimer);
    this.openTimer = this.silentTimer = this.flushTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {}
    }
  }

  connect() {
    if (!this.wanted || this.ws) return;
    if (typeof this.WebSocket !== "function") return this.failed();
    let ws;
    try {
      ws = new this.WebSocket(this.url);
    } catch {
      return this.failed();
    }
    this.ws = ws;
    this.openTimer = setTimeout(() => this.failed(), OPEN_TIMEOUT_MS);
    ws.onopen = () => {
      clearTimeout(this.openTimer);
      this.openTimer = null;
      this.fails = 0;
      this.setState({ open: true, down: false });
      this.alive();
    };
    ws.onmessage = (event) => {
      this.alive();
      const lines = linesOf(event && event.data);
      if (!lines.length) return;
      this.pending.push(...lines);
      if (this.pending.length > 200) this.pending.splice(0, this.pending.length - 200);
      if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
    };
    ws.onerror = () => {};
    ws.onclose = () => this.failed();
  }

  // Kirka's chat is never quiet for minutes: a silent socket is a dead one.
  alive() {
    clearTimeout(this.silentTimer);
    this.silentTimer = setTimeout(() => this.failed(), SILENT_MS);
  }

  flush() {
    this.flushTimer = null;
    const lines = this.pending;
    this.pending = [];
    if (!lines.length || !this.wanted) return;
    // The history of a reconnection repeats lines already here: keep each once.
    const had = new Set(this.last.map((l) => `${l.name}|${l.message}`));
    this.last.push(...lines.filter((l) => !had.has(`${l.name}|${l.message}`)).map(({ old, ...l }) => l));
    if (this.last.length > 50) this.last.splice(0, this.last.length - 50);
    this.onLines(lines);
  }

  failed() {
    if (this.pending.length) this.flush();
    this.drop();
    if (!this.wanted) return;
    this.fails++;
    this.setState({ open: false, down: this.fails >= DOWN_AFTER });
    // 4 s like KirkaHub, then longer each time, up to a minute.
    const wait = Math.min(MAX_WAIT_MS, FIRST_WAIT_MS * 2 ** Math.max(0, this.fails - 1));
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, wait);
    this.retry.unref?.();
  }
}

module.exports = { TradeChat, linesOf, toLine };
