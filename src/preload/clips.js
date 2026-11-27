"use strict";

// Preload of the clips recorder (src/clips, sandboxed, one file): only the
// messages between the recorder page and src/main/clips.js.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("riteClips", {
  ready: () => ipcRenderer.send("clips:ready"),
  status: (state) => ipcRenderer.send("clips:status", state),
  saved: (id, result) => ipcRenderer.send("clips:saved", id, result),
  onStart: (fn) => ipcRenderer.on("clips:start", (_event, opts) => fn(opts)),
  onStop: (fn) => ipcRenderer.on("clips:stop", () => fn()),
  onPause: (fn) => ipcRenderer.on("clips:pause", () => fn()),
  onSave: (fn) => ipcRenderer.on("clips:save", (_event, id) => fn(id)),
});
