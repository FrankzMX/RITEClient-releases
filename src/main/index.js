"use strict";

const path = require("node:path");
const { app, protocol, session, net, nativeImage, BrowserWindow } = require("electron");
const { SettingsStore } = require("./settings");
const { applySwitches, raiseProcessPriority, backgroundThrottling } = require("./performance");
const { effectiveSettings } = require("./perf-mode");
const { getPaths } = require("./paths");
const { ResourceSwapper, registerSwapScheme } = require("./swapper");
const { RitePack, logPath: packLog } = require("./rite-pack");
const { DiscordPresence } = require("./discord");
const { Scrims } = require("./scrims");
const { Badges } = require("./badges");
const { Updates } = require("./updates");
const { registerIpc } = require("./ipc");
const { createGameWindow } = require("./windows/game");
const { createVoxWindow } = require("./windows/vox");
const { createHubWindow } = require("./windows/hub");
const { startTarget } = require("./hub");
const pkg = require("../../package.json");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start() {
  const settings = new SettingsStore(app.getPath("userData"));
  // What actually runs: the player's settings, lightened by performance mode.
  const live = () => effectiveSettings(settings.getAll());
  applySwitches(app, live());
  registerSwapScheme(protocol);

  // Three windows: the hub (always there, hidden while a game is open), the
  // Kirka window and the VOXARENA window. One game at a time: going back to the
  // hub closes the game, so neither game ever costs the other anything.
  let hubWindow = null;
  let gameWindow = null; // Kirka
  let voxWindow = null; // VOXARENA
  const alive = (win) => Boolean(win && !win.isDestroyed());
  const getWindow = () => gameWindow;
  const getHub = () => hubWindow;
  const getVox = () => voxWindow;
  const front = () => [gameWindow, voxWindow, hubWindow].find((win) => alive(win) && win.isVisible()) || null;
  const restart = () => {
    app.relaunch();
    app.exit(0);
  };

  app.on("second-instance", () => {
    const win = front();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    const paths = getPaths(app);
    const pack = new RitePack({
      net,
      nativeImage,
      logFile: packLog(paths.root),
      cacheDir: path.join(app.getPath("userData"), "rite-pack"),
      // The texture list (texturas-kirka.txt) only with the DevTools shortcut on.
      debug: settings.get("devToolsShortcut"),
      send: (channel, payload) => {
        if (!alive(gameWindow)) return false;
        gameWindow.webContents.send(channel, payload);
        return true;
      },
    });
    // The swapper only touches the default session, where Kirka lives. VOXARENA
    // runs in its own partition (windows/vox.js) and never sees it.
    const swapper = new ResourceSwapper({ session: session.defaultSession, protocol, net, dir: paths.swapper, pack });
    const applySwaps = () => {
      const s = live();
      pack.setMode(s.tournamentMode ? "off" : s.ritePack);
      pack.debug = s.devToolsShortcut;
      swapper.setEnabled(s.swapperEnabled && !s.tournamentMode);
    };
    applySwaps();

    // Sends to the Kirka page and the hub (both show the RITE scrims state).
    const broadcast = (channel, payload) => {
      for (const win of [gameWindow, hubWindow]) if (alive(win)) win.webContents.send(channel, payload);
    };

    const scrims = new Scrims({
      dir: app.getPath("userData"),
      fetch: (url, init) => net.fetch(url, init),
      onState: (state) => broadcast("rite:scrims", state),
      isFocused: () => Boolean(front()?.isFocused()),
    });
    scrims.setEnabled(settings.get("scrimsEnabled"));

    const badges = new Badges({
      fetch: (url) => net.fetch(url),
      onList: (list) => alive(gameWindow) && gameWindow.webContents.send("rite:badges", list),
    });
    const badgesOn = () => live().riteBadges && !settings.get("tournamentMode");
    const applyBadges = () => badges.setEnabled(badgesOn());
    applyBadges();

    const discord = new DiscordPresence({ clientId: pkg.rite?.discordClientId, version: app.getVersion() });
    if (settings.get("discordRpc")) discord.start();

    settings.onChange((key) => {
      const perf = key === "performanceMode" || key === "performanceModeSwapper";
      if (key === null || perf || key === "swapperEnabled" || key === "tournamentMode" || key === "ritePack" || key === "devToolsShortcut") applySwaps();
      if (key === null || key === "scrimsEnabled") scrims.setEnabled(settings.get("scrimsEnabled"));
      if (key === null || perf || key === "riteBadges" || key === "tournamentMode") applyBadges();
      if ((key === null || perf) && alive(gameWindow)) gameWindow.webContents.setBackgroundThrottling(backgroundThrottling(live()));
      if (key === null || key === "discordRpc") {
        if (settings.get("discordRpc")) discord.start();
        else discord.stop();
      }
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("rite:settings-changed", settings.getAll());
      }
    });

    // Only packaged builds update; in development the card never shows.
    const updates = app.isPackaged
      ? new Updates({ updater: require("electron-updater").autoUpdater, send: (state) => broadcast("rite:update", state) })
      : { state: { status: "idle" }, install() {} };

    // Shows the hub again once a game window is gone (closed by the player, by
    // "Volver al hub" or by a crash of the window itself).
    const showHub = () => {
      if (!alive(hubWindow)) return;
      hubWindow.show();
      hubWindow.focus();
      discord.setGame("hub");
    };

    const openKirka = (url) => {
      if (alive(gameWindow)) {
        if (url) gameWindow.loadURL(url);
        return gameWindow.focus();
      }
      gameWindow = createGameWindow({ settings, paths, url, onUrlChange: (url) => discord.setUrl(url) });
      discord.setGame("kirka");
      gameWindow.on("focus", () => scrims.wake());
      gameWindow.on("closed", () => {
        gameWindow = null;
        showHub();
      });
      if (live().highPriority) {
        gameWindow.webContents.once("did-finish-load", () => raiseProcessPriority(app));
      }
    };

    const openVox = (url) => {
      if (alive(voxWindow)) {
        if (url) voxWindow.loadURL(url);
        return voxWindow.focus();
      }
      voxWindow = createVoxWindow({ settings, version: app.getVersion(), url });
      discord.setGame("voxarena");
      voxWindow.on("focus", () => scrims.wake());
      voxWindow.on("closed", () => {
        voxWindow = null;
        showHub();
      });
    };

    // From the hub: opens one game (on `url` when the hub sends a match room)
    // and hides the hub. If the other game is still open (it closes on its own
    // way back to the hub), it is closed first.
    const play = (game, url) => {
      if (game === "kirka") {
        if (alive(voxWindow)) voxWindow.close();
        openKirka(url);
      } else if (game === "voxarena") {
        if (alive(gameWindow)) gameWindow.close();
        openVox(url);
      } else {
        return false;
      }
      if (alive(hubWindow)) hubWindow.hide();
      return true;
    };

    // "Volver al hub" from a game: closes that game's window, which shows the hub.
    const backToHub = (which) => {
      const win = which === "voxarena" ? voxWindow : gameWindow;
      if (alive(win)) win.close();
      else showHub();
      return true;
    };

    registerIpc({
      getWindow,
      getHub,
      getVox,
      settings,
      paths,
      swapper,
      scrims,
      pack,
      restart,
      updates,
      badges: () => (badgesOn() ? badges.list : []),
      hub: { play, back: backToHub },
    });

    hubWindow = createHubWindow({ version: app.getVersion() });
    hubWindow.on("focus", () => scrims.wake());
    hubWindow.on("closed", () => {
      hubWindow = null;
    });
    const target = startTarget(settings.getAll());
    if (target === "hub") {
      hubWindow.once("ready-to-show", () => showHub());
    } else {
      play(target);
    }

    if (app.isPackaged && settings.get("autoUpdate")) updates.check({ beta: settings.get("betaUpdates") });
  });

  // Closing the hub (the only window the player sees with no game open) quits.
  // A game window closing shows the hub again, so the app stays open.
  app.on("window-all-closed", () => app.quit());
}
