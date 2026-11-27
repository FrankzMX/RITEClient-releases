"use strict";

// Preload of «Crear swapper» (src/swapper-maker/*, sandboxed, one file).

const { contextBridge, ipcRenderer } = require("electron");

const lang = (process.argv.find((arg) => arg.startsWith("--rite-lang=")) || "").slice("--rite-lang=".length);

contextBridge.exposeInMainWorld("riteMaker", {
  lang,
  catalog: (force) => ipcRenderer.invoke("maker:catalog", Boolean(force)),
  list: () => ipcRenderer.invoke("maker:list"),
  open: (name) => ipcRenderer.invoke("maker:open", name),
  read: (name, id) => ipcRenderer.invoke("maker:read", name, id),
  original: (id) => ipcRenderer.invoke("maker:original", id),
  fetchUrl: (url) => ipcRenderer.invoke("maker:fetch-url", url),
  pickFile: (kind) => ipcRenderer.invoke("maker:pick-file", kind),
  save: (name, changes, origins) => ipcRenderer.invoke("maker:save", name, changes, origins),
  use: (name) => ipcRenderer.invoke("maker:use", name),
});
