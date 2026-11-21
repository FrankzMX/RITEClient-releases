"use strict";

// Preload of "Mis clips" (src/clips/viewer.*, sandboxed, one file).

const { contextBridge, ipcRenderer } = require("electron");

const lang = (process.argv.find((arg) => arg.startsWith("--rite-lang=")) || "").slice("--rite-lang=".length);

contextBridge.exposeInMainWorld("riteViewer", {
  lang,
  list: () => ipcRenderer.invoke("viewer:list"),
  read: (name) => ipcRenderer.invoke("viewer:read", name),
  saveShare: (name, bytes) => ipcRenderer.invoke("viewer:save-share", name, bytes),
  reveal: (name, shared) => ipcRenderer.invoke("viewer:reveal", name, Boolean(shared)),
  remove: (name) => ipcRenderer.invoke("viewer:delete", name),
  onRefresh: (fn) => ipcRenderer.on("viewer:refresh", () => fn()),
});
