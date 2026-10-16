"use strict";

// RITE scrims: links this client to the player's Discord through RITE WEB and
// keeps the queues, the ready check and the match room in sync. Requests go
// from the main process only; the game page never sees the token.

const fs = require("node:fs");
const path = require("node:path");
const credits = require("./credits");

const API = new URL("api/client/", credits.community.find((c) => c.name === "RITE WEB").url);
const ROOM = /^https:\/\/(?:www\.)?kirka\.io\/games\/[A-Za-z0-9~_.-]+(?:[?#][^\s<>]*)?$/i;
// A Kirka party lobby (region~id), where the RITE lobby sets up the match.
const LOBBY = /^https:\/\/(?:www\.)?kirka\.io\/___lobby___\/[A-Za-z0-9_.-]+~[A-Za-z0-9_.-]+$/i;
const DISCORD = /^https:\/\/(?:www\.)?discord\.com\/channels\/\d+\/\d+$/;

const isLobbyUrl = (url) => typeof url === "string" && url.length <= 300 && LOBBY.test(url);
const isRoomUrl = (url) => typeof url === "string" && url.length <= 300 && (ROOM.test(url) || LOBBY.test(url));
const isDiscordUrl = (url) => typeof url === "string" && DISCORD.test(url);

// How often to ask RITE WEB: fast only while the player has to act (the
// ready check, the map vote, a fresh match waiting for its room), slow while
// they play the match, and slower still with nothing going on or the window in
// the background.
const IDLE_MS = 20000;
const MATCH_MS = 15000;
function pollDelay(state, { focused = true, now = Date.now() } = {}) {
  if (!state || !state.linked) return 5000;
  if (state.me?.queue?.check && !state.me.queue.check.ready) return 2000;
  const vote = state.me?.match?.vote;
  // A map already won (3 s countdown): one ask right when it closes, for the map.
  if (vote && vote.winner !== null && vote.winner !== undefined) return Math.max(300, Math.min(5000, new Date(vote.until).getTime() - now + 300));
  if (vote) return focused ? 2000 : 5000;
  if (state.me?.match && !state.me.match.roomUrl) return focused ? 3000 : MATCH_MS;
  if (state.me?.match) return MATCH_MS;
  if (state.me?.queue) return focused ? 5000 : MATCH_MS;
  return IDLE_MS;
}

class Scrims {
  constructor({ dir, fetch, onState, isFocused = () => true }) {
    this.file = path.join(dir, "rite-scrims.json");
    this.fetch = fetch;
    this.onState = onState;
    this.isFocused = isFocused;
    this.last = ""; // the last answer sent to the page: the same one isn't sent again
    this.token = this.readToken();
    this.state = { linked: false, status: this.token ? "checking" : "unlinked" };
    this.timer = null;
    this.enabled = false;
    this.fast = 0;
  }

  readToken() {
    try {
      const { token } = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return typeof token === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
    } catch {
      return null;
    }
  }

  writeToken(token) {
    this.token = token;
    if (token) fs.writeFileSync(this.file, JSON.stringify({ token }), { mode: 0o600 });
    else fs.rmSync(this.file, { force: true });
  }

  async call(route, { method = "GET", body } = {}) {
    const res = await this.fetch(new URL(route, API).href, {
      method,
      headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  publish(state) {
    const key = JSON.stringify(state);
    this.state = state;
    if (key === this.last) return;
    this.last = key;
    this.onState(state);
  }

  // The window came back to the front: ask now instead of after the slow wait.
  wake() {
    if (this.enabled && this.token && this.timer && this.next - Date.now() > 3000) this.poll();
  }

  setEnabled(on) {
    this.enabled = on;
    clearTimeout(this.timer);
    this.timer = null;
    if (on && this.token) this.poll();
    if (!on) this.publish({ linked: false, status: "off" });
    else if (!this.token) this.publish({ linked: false, status: "unlinked" });
  }

  async poll() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.enabled || !this.token) return;
    try {
      const { status, data } = await this.call("state");
      if (status === 401) {
        // RITE WEB forgot this client (unlinked elsewhere): start over.
        this.writeToken(null);
        this.publish({ linked: false, status: "unlinked" });
        return;
      }
      if (status !== 200) throw new Error(`HTTP ${status}`);
      this.publish({ ...data, status: data.linked ? "linked" : "pairing" });
    } catch {
      this.publish({ ...this.state, status: this.state.linked ? "linked" : this.state.status, offline: true });
    }
    // Right after a queue action, check often so the bot's answer shows up quickly.
    const delay = this.fast > Date.now() ? 1500 : pollDelay(this.state, { focused: this.isFocused() });
    if (this.enabled && this.token) {
      this.next = Date.now() + delay;
      this.timer = setTimeout(() => this.poll(), delay);
    }
  }

  // Starts linking: RITE WEB hands out a token and a code for /cliente vincular.
  async pair() {
    const { status, data } = await this.call("pair", { method: "POST" });
    if (status === 404) throw new Error("RITE WEB todavía no tiene Scrims para el cliente (falta su actualización)");
    if (status !== 200 || !data.token) throw new Error(data.error || "No se pudo conectar con RITE WEB");
    this.writeToken(data.token);
    this.publish({ linked: false, status: "pairing", code: data.code, expiresAt: data.expiresAt });
    this.poll();
    return this.state;
  }

  async ready(checkId, ok) {
    const { status, data } = await this.call("ready", { method: "POST", body: { checkId: String(checkId), ok: Boolean(ok) } });
    if (status !== 200) throw new Error(data.error || "No se pudo enviar");
    this.poll();
    return true;
  }

  // Join or leave a queue, or share the match room. The bot applies it and its
  // answer comes back in the next states as a notice.
  async queue(body) {
    const { status, data } = await this.call("queue", { method: "POST", body });
    if (status === 404) throw new Error("RITE WEB todavía no tiene esta función (falta su actualización)");
    if (status !== 200) throw new Error(data.error || "No se pudo enviar");
    this.fast = Date.now() + 15000;
    setTimeout(() => this.poll(), 1500);
    return true;
  }

  // The bot's /registro, from the client. Its answer comes back as a notice.
  async register({ name, region, kirka }) {
    const { status, data } = await this.call("register", { method: "POST", body: { name, region, kirka } });
    if (status === 404) throw new Error("RITE WEB todavía no tiene el registro desde el cliente (falta su actualización)");
    if (status !== 200) throw new Error(data.error || "No se pudo enviar");
    this.fast = Date.now() + 15000;
    setTimeout(() => this.poll(), 1500);
    return true;
  }

  // The final score of the player's match; the bot reports it in the match thread.
  async result(body) {
    const { status, data } = await this.call("result", { method: "POST", body });
    if (status === 404) throw new Error("RITE WEB todavía no recibe resultados del cliente");
    if (status !== 200) throw new Error(data.error || "No se pudo enviar");
    this.fast = Date.now() + 15000;
    setTimeout(() => this.poll(), 1500);
    return true;
  }

  // Community chat (the hub's mirror of #rite-chat): messages after `after`, and a new one.
  async chat(after) {
    const { status, data } = await this.call(`chat?after=${Number(after) || 0}`);
    if (status === 404) throw new Error("RITE WEB todavía no tiene el chat (falta su actualización)");
    if (status !== 200) throw new Error(data.error || "No se pudo leer el chat");
    return Array.isArray(data.messages) ? data.messages : [];
  }

  async say(text) {
    const { status, data } = await this.call("chat", { method: "POST", body: { text } });
    if (status === 404) throw new Error("RITE WEB todavía no tiene el chat (falta su actualización)");
    if (status !== 200) throw new Error(data.error || "No se pudo enviar");
    return true;
  }

  async unlink() {
    if (this.token) await this.call("unlink", { method: "POST" }).catch(() => {});
    this.writeToken(null);
    clearTimeout(this.timer);
    this.publish({ linked: false, status: "unlinked" });
  }
}

module.exports = { Scrims, isRoomUrl, isLobbyUrl, isDiscordUrl, pollDelay, API };
