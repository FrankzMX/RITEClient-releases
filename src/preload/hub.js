"use strict";

// Preload of the hub page (sandboxed, one file): what src/hub/hub.js may ask
// the main process for.

const { contextBridge, ipcRenderer } = require("electron");

const version = (process.argv.find((arg) => arg.startsWith("--rite-version=")) || "").slice("--rite-version=".length);

contextBridge.exposeInMainWorld("rite", {
  version,
  info: () => ipcRenderer.invoke("hub:info"),
  play: (game) => ipcRenderer.invoke("hub:play", game),
  setSetting: (key, value) => ipcRenderer.invoke("hub:set", key, value),
  openLink: (url) => ipcRenderer.invoke("hub:open-link", url),
  installUpdate: () => ipcRenderer.invoke("hub:update-install"),
  scrims: {
    get: () => ipcRenderer.invoke("hub:scrims-get"),
    pair: () => ipcRenderer.invoke("hub:scrims-pair"),
    ready: (checkId, ok) => ipcRenderer.invoke("hub:scrims-ready", checkId, ok),
    unlink: () => ipcRenderer.invoke("hub:scrims-unlink"),
    queue: (action, game, mode) => ipcRenderer.invoke("hub:scrims-queue", action, game, mode),
    vote: (matchId, pick) => ipcRenderer.invoke("hub:scrims-vote", matchId, pick),
    register: (form) => ipcRenderer.invoke("hub:scrims-register", form),
    open: (url) => ipcRenderer.invoke("hub:scrims-open", url),
    join: (url) => ipcRenderer.invoke("hub:scrims-join", url),
  },
  chat: {
    get: (after) => ipcRenderer.invoke("hub:chat-get", after),
    say: (text) => ipcRenderer.invoke("hub:chat-say", text),
  },
  onScrims: (fn) => ipcRenderer.on("rite:scrims", (_event, state) => fn(state)),
  onSettings: (fn) => ipcRenderer.on("rite:settings-changed", (_event, settings) => fn(settings)),
  onUpdate: (fn) => ipcRenderer.on("rite:update", (_event, state) => fn(state)),
});
