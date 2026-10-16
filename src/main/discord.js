"use strict";

// Discord Rich Presence, using RITE's Discord application
// (package.json "rite.discordClientId"). Without an ID it stays off.

const credits = require("./credits");

const STATES = [
  [/^\/games\//, "En partida"],
  [/^\/servers\//, "Buscando servidor"],
  [/^\/hub\/leaderboard/, "Viendo el leaderboard"],
  [/^\/hub\/clans/, "Viendo clanes"],
  [/^\/hub\/market/, "En el market"],
  [/^\/profile\//, "Viendo un perfil"],
  [/^\/inventory/, "En el inventario"],
  [/^\/store/, "En la tienda"],
  [/^\/friends/, "Viendo amigos"],
  [/^\/quests/, "Viendo misiones"],
];

function stateForUrl(value) {
  try {
    const { pathname } = new URL(value);
    for (const [pattern, state] of STATES) if (pattern.test(pathname)) return state;
  } catch {}
  return "En el lobby";
}

class DiscordPresence {
  constructor({ clientId, version }) {
    this.clientId = clientId;
    this.version = version;
    this.client = null;
    this.ready = false;
    this.state = "En el lobby";
    this.startTimestamp = Date.now();
    this.retryTimer = null;
  }

  start() {
    if (!this.clientId || this.client) return;
    const { Client } = require("discord-rpc");
    this.client = new Client({ transport: "ipc" });
    this.client.on("ready", () => {
      this.ready = true;
      this.update();
    });
    this.client.on("disconnected", () => {
      this.ready = false;
      this.scheduleRetry();
    });
    this.client.login({ clientId: this.clientId }).catch(() => this.scheduleRetry());
  }

  scheduleRetry() {
    if (this.retryTimer || !this.client) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.stop();
      this.start();
    }, 30_000);
  }

  stop() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.client) this.client.destroy().catch(() => {});
    this.client = null;
    this.ready = false;
  }

  setUrl(url) {
    this.setState(stateForUrl(url));
  }

  // Where the player is: the hub, Kirka (then setUrl refines it) or VOXARENA.
  setGame(game) {
    this.setState(game === "voxarena" ? "Jugando VOXARENA" : game === "hub" ? "En el hub de RITE" : "En el lobby");
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.update();
  }

  update() {
    if (!this.ready) return;
    this.client
      .setActivity({
        state: this.state,
        startTimestamp: this.startTimestamp,
        largeImageKey: "rite",
        largeImageText: `RITE Client v${this.version}`,
        instance: false,
        buttons: credits.community.map(({ name, url }) => ({ label: name, url })),
      })
      .catch(() => {});
  }
}

module.exports = { DiscordPresence, stateForUrl };
