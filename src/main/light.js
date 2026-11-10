"use strict";

// RITE Light's main process (see src/main/edition.js): one Kirka window and
// nothing else. No hub, no Discord, no scrims, badges, modules,
// trade helper or clips, and no timers in the main process while you play.
// Closing the game window closes the client.
//
// @author FRANKZ

const { app, protocol, session, net, BrowserWindow } = require("electron");
const { SettingsStore } = require("./settings");
const { applySwitches, raiseProcessPriority, backgroundThrottling } = require("./performance");
const { effectiveSettings } = require("./perf-mode");
const { getPaths } = require("./paths");
const { ResourceSwapper, registerSwapScheme } = require("./swapper");
const { Updates } = require("./updates");
const { registerIpc } = require("./ipc");
const { createGameWindow } = require("./windows/game");
const { LIGHT_DEFAULTS, LIGHT_FORCED, isInstalledLight } = require("./edition");
const lightImport = require("./light-import");

// What the shared IPC (src/main/ipc.js) gets for the parts Light leaves out.
// The Light menu never asks for them; a call that still arrives gets nothing.
const OFF = Object.freeze({ status: "off" });
const noScrims = Object.freeze({
  state: OFF,
  pair: () => OFF,
  ready: () => OFF,
  unlink: () => OFF,
  queue: () => OFF,
  register: () => OFF,
  result: () => OFF,
  chat: () => ({ messages: [] }),
  say: () => OFF,
});

// `relaunchArg`: the switch that makes a restarted client wait for this one's
// lock (see src/main/index.js). The other switches (--rite-light) are kept, so
// "Reiniciar cliente" opens Light again.
function startLight({ relaunchArg }) {
  // The first time, RITE Client's essentials and Kirka's storage come along (light-import.js).
  const appData = app.getPath("appData");
  const first = lightImport.firstRun(appData, app.getPath("userData"));
  const settings = new SettingsStore(app.getPath("userData"), { defaults: LIGHT_DEFAULTS, forced: LIGHT_FORCED });
  if (first) lightImport.importInto(settings, appData);
  const live = () => effectiveSettings(settings.getAll());
  const startup = live();
  applySwitches(app, startup);
  registerSwapScheme(protocol);

  let gameWindow = null;
  const alive = (win) => Boolean(win && !win.isDestroyed());
  const getWindow = () => gameWindow;

  let quitting = false;
  const restart = () => {
    quitting = true;
    const args = process.argv.slice(1).filter((arg) => arg !== relaunchArg);
    args.push(relaunchArg);
    app.relaunch({ args });
    app.exit(0);
  };

  app.on("second-instance", () => {
    if (!alive(gameWindow)) return;
    if (gameWindow.isMinimized()) gameWindow.restore();
    gameWindow.focus();
  });

  app.whenReady().then(() => {
    const paths = getPaths(app);
    const swapper = new ResourceSwapper({ session: session.defaultSession, protocol, net, dir: paths.swapper });
    const applySwaps = () => swapper.setEnabled(live().swapperEnabled && !settings.get("tournamentMode"));
    applySwaps();

    // Light has its own update channel (light.yml in the same releases). Opened
    // from RITE Client's hub it's RITE Client's program: that one updates it.
    let updates = { state: { status: "idle" }, install() {}, check() {} };
    if (app.isPackaged && isInstalledLight()) {
      const updater = require("electron-updater").autoUpdater;
      updater.channel = "light";
      updates = new Updates({ updater, send: (state) => alive(gameWindow) && gameWindow.webContents.send("rite:update", state) });
    }

    settings.onChange((key) => {
      const perf = key === "performanceMode" || key === "performanceModeSwapper";
      if (key === null || perf || key === "swapperEnabled" || key === "tournamentMode") applySwaps();
      if ((key === null || perf) && alive(gameWindow)) gameWindow.webContents.setBackgroundThrottling(backgroundThrottling(live()));
      if (alive(gameWindow)) gameWindow.webContents.send("rite:settings-changed", settings.getAll());
    });

    const openKirka = () => {
      gameWindow = createGameWindow({ settings, paths, light: true });
      gameWindow.on("closed", () => {
        gameWindow = null;
        if (!quitting) app.quit();
      });
      if (live().highPriority) gameWindow.webContents.once("did-finish-load", () => raiseProcessPriority(app));
    };

    registerIpc({
      getWindow,
      settings,
      paths,
      swapper,
      scrims: noScrims,
      pack: null,
      restart,
      updates,
      badges: () => [],
      prices: null,
      ear: null,
      hub: { play: () => false, back: () => false },
      licencia: null,
      startup,
      light: true,
      importFull: () => ({ taken: lightImport.importInto(settings, appData), found: Boolean(lightImport.readFullSettings(appData)) }),
    });

    openKirka();
    if (app.isPackaged && settings.get("autoUpdate")) updates.check({ beta: settings.get("betaUpdates") });
  });

  app.on("window-all-closed", () => app.quit());
}

module.exports = { startLight };
