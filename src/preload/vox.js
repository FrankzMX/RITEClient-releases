"use strict";

// Preload of the VOXARENA window (sandboxed, one file). The only thing the
// game gets is `window.riteClient`: it tells the game it runs inside RITE
// Client, so it can switch on the RITE theme and offer "Volver al hub". The game
// page gets no settings, no Node and no access to anything of Kirka's.

const { contextBridge, ipcRenderer } = require("electron");

const version = (process.argv.find((arg) => arg.startsWith("--rite-version=")) || "").slice("--rite-version=".length);

contextBridge.exposeInMainWorld("riteClient", {
  name: "RITE Client",
  version,
  // Closes this window and shows the hub again.
  hub: () => ipcRenderer.invoke("vox:hub"),
});
