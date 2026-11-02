"use strict";

// Auto-update: electron-updater looks for a new release on open and downloads it
// in the background. Its progress goes to the page, which shows it as a RITE
// card (src/preload/features/update.js) instead of a Windows dialog.

class Updates {
  constructor({ updater, send }) {
    this.updater = updater;
    this.send = send;
    this.state = { status: "idle" };
    updater.autoInstallOnAppQuit = true;
    updater.on("update-available", ({ version }) => this.set({ status: "downloading", version, percent: 0 }));
    updater.on("download-progress", ({ percent }) => this.set({ ...this.state, status: "downloading", percent: Math.max(0, Math.min(100, Math.round(percent || 0))) }));
    updater.on("update-downloaded", ({ version }) => this.set({ status: "ready", version, percent: 100 }));
    // A failed check or download is not the player's problem: the next open retries.
    updater.on("error", () => this.state.status === "downloading" && this.set({ status: "idle" }));
  }

  set(state) {
    this.state = state;
    this.send(state);
  }

  check({ beta }) {
    // A beta build already follows prereleases on its own; the setting opts a stable build in.
    if (beta) this.updater.allowPrerelease = true;
    this.updater.checkForUpdates().catch(() => {});
  }

  install() {
    if (this.state.status === "ready") this.updater.quitAndInstall();
  }
}

module.exports = { Updates };
