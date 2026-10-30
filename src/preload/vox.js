"use strict";

// Preload of the VOXARENA window (sandboxed, one file). The only thing the
// game gets is `window.riteClient`: it tells the game it runs inside RITE
// Client, so it can switch on the RITE theme and offer "Volver al hub", and it
// hands the game the Scrims RITE queues so the game draws its own panel. The
// game page gets no settings beyond the scrims ones, no Node and no access to
// anything of Kirka's.

const { contextBridge, ipcRenderer } = require("electron");

const version = (process.argv.find((arg) => arg.startsWith("--rite-version=")) || "").slice("--rite-version=".length);
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("riteClient", {
  name: "RITE Client",
  version,
  // Closes this window and shows the hub again.
  hub: () => call("vox:hub"),
  // Scrims RITE, the same the Kirka panel and the hub use. `get()` and
  // `onChange(fn)` give the state ({ linked, status, code, player, queues,
  // me: { queue, match }, notices }); everything else asks the bot and the
  // answer comes back in the next state. `onChange` returns a function that
  // stops listening.
  scrims: {
    apiVersion: 1,
    get: () => call("vox:scrims-get"),
    settings: () => call("vox:settings-get"),
    onChange(fn) {
      if (typeof fn !== "function") return () => {};
      const listener = (_event, state) => fn(state);
      ipcRenderer.on("rite:scrims", listener);
      return () => ipcRenderer.removeListener("rite:scrims", listener);
    },
    onSettings(fn) {
      if (typeof fn !== "function") return () => {};
      const listener = (_event, all) => fn(scrimsSettings(all));
      ipcRenderer.on("rite:settings-changed", listener);
      return () => ipcRenderer.removeListener("rite:settings-changed", listener);
    },
    pair: () => call("vox:scrims-pair"),
    unlink: () => call("vox:scrims-unlink"),
    register: (form) => call("vox:scrims-register", form),
    join: (game, mode) => call("vox:scrims-queue", "join", game, mode),
    leave: () => call("vox:scrims-queue", "leave"),
    ready: (checkId, ok) => call("vox:scrims-ready", checkId, ok),
    vote: (matchId, pick) => call("vox:scrims-vote", matchId, pick),
    // The match thread on Discord, and RITE's own links (Discord, RITE WEB).
    openThread: (url) => call("vox:scrims-open", url),
    openLink: (url) => call("vox:open-link", url),
    // Opens a game of the match: "kirka" (closes this window) or "voxarena"
    // (loads the room here). `url` is the match's roomUrl, or "" for the game's
    // home (a Kirka match without a room is made from Kirka).
    go: (game, url) => call("vox:scrims-switch", game, url || ""),
  },
});

// What of the client's settings the game sees: only the scrims ones.
function scrimsSettings(all) {
  const s = all || {};
  return { enabled: s.scrimsEnabled !== false, panel: s.scrimsPanel !== false, sound: s.scrimsSound !== false, queueAlert: s.scrimsQueueAlert !== false };
}
