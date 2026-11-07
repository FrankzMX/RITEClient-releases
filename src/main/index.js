"use strict";

const path = require("node:path");
const { app, protocol, session, net, nativeImage, BrowserWindow, ipcMain, shell, clipboard } = require("electron");
const { SettingsStore } = require("./settings");
const { applySwitches, raiseProcessPriority, backgroundThrottling } = require("./performance");
const { effectiveSettings } = require("./perf-mode");
const { getPaths } = require("./paths");
const { ResourceSwapper, registerSwapScheme } = require("./swapper");
const { RitePack, logPath: packLog } = require("./rite-pack");
const { DiscordPresence } = require("./discord");
const { Scrims } = require("./scrims");
const { Badges } = require("./badges");
const { Prices } = require("./prices");
const { isGameOrigin } = require("./navigation");
const { TradeEar } = require("./trade-ear");
const { Clips } = require("./clips");
const { ClipsViewer } = require("./clips-viewer");
const { Updates } = require("./updates");
const { Licencia } = require("./licencia");
const { PUBLIC_KEY } = require("./modules-key");
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
  // What this run was started with: the GPU profile, backend and FPS limit only change on restart.
  const startup = live();
  applySwitches(app, startup);
  registerSwapScheme(protocol);

  // Three windows: the hub, the Kirka window and the VOXARENA window. One at a
  // time: opening a game closes the hub (its page and renderer process, so the
  // RAM and CPU go to the game), and going back to the hub closes the game and
  // opens the hub again. Its state lives in the settings, so nothing is lost.
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

    // Sends to the Kirka page, VOXARENA and the hub (all show the RITE scrims state).
    const broadcast = (channel, payload) => {
      for (const win of [gameWindow, voxWindow, hubWindow]) if (alive(win)) win.webContents.send(channel, payload);
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

    // RITE modules (src/main/licencia.js), open or with the player's license:
    // checked on open, every 15 min, and before each page load (ipc.js). A
    // change is announced in the page so the player refreshes.
    const licencia = new Licencia({
      dir: app.getPath("userData"),
      fetch: (url, init) => net.fetch(url, init),
      publicKey: PUBLIC_KEY,
      clientVersion: app.getVersion(),
      onChange: () => alive(gameWindow) && gameWindow.webContents.send("rite:modules-changed"),
    });
    const refreshAll = () => {
      if (licencia.enabled && settings.get("remoteModules") && !settings.get("tournamentMode")) licencia.refresh().catch(() => {});
    };
    refreshAll();
    setInterval(refreshAll, 15 * 60 * 1000).unref?.();

    const discord = new DiscordPresence({ clientId: pkg.rite?.discordClientId, version: app.getVersion() });
    if (settings.get("discordRpc")) discord.start();

    settings.onChange((key) => {
      const perf = key === "performanceMode" || key === "performanceModeSwapper";
      if (key === null || perf || key === "swapperEnabled" || key === "tournamentMode" || key === "ritePack" || key === "devToolsShortcut") applySwaps();
      if (key === null || key === "scrimsEnabled") scrims.setEnabled(settings.get("scrimsEnabled"));
      if (key === null || perf || key === "riteBadges" || key === "tournamentMode") applyBadges();
      if (key === null || key === "tradeHelper" || key === "tradeEar" || key === "tournamentMode") applyEar();
      if (key === null || String(key).startsWith("clips")) clips.apply();
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
    const openHub = () => {
      if (alive(hubWindow)) return hubWindow;
      hubWindow = createHubWindow({ version: app.getVersion() });
      hubWindow.on("focus", () => scrims.wake());
      hubWindow.on("closed", () => {
        hubWindow = null;
      });
      return hubWindow;
    };
    const showHub = () => {
      const fresh = !alive(hubWindow);
      const win = openHub();
      const show = () => {
        if (!alive(win)) return;
        win.show();
        win.focus();
      };
      if (fresh) win.once("ready-to-show", show);
      else show();
      discord.setGame("hub");
    };
    // While a game is open the hub is closed. Not at once: the hub's own call
    // that opened the game still has to get its answer.
    const closeHub = () => {
      const win = hubWindow;
      if (!alive(win)) return;
      win.hide();
      setTimeout(() => {
        if (alive(win) && !win.isVisible() && (alive(gameWindow) || alive(voxWindow))) win.destroy();
      }, 1500);
    };

    // Trade Helper's ear (src/main/trade-ear.js): only while Kirka is open.
    const ear = new TradeEar({
      BrowserWindow,
      getUrl: () => settings.get("baseUrl"),
      isAllowed: (url) => isGameOrigin(url),
      onLines: (lines) => alive(gameWindow) && gameWindow.webContents.send("rite:trade-ear-lines", lines),
      onState: (state) => alive(gameWindow) && gameWindow.webContents.send("rite:trade-ear-state", state),
    });
    const earOn = () => alive(gameWindow) && settings.get("tradeHelper") && settings.get("tradeEar") && !settings.get("tournamentMode");
    const applyEar = () => (earOn() ? ear.start() : ear.stop());

    const clips = new Clips({
      BrowserWindow,
      ipcMain,
      session,
      getSettings: () => settings.getAll(),
      dir: paths.clips,
      notify: (message, type) => alive(gameWindow) && gameWindow.webContents.send("rite:toast", { message, type }),
    });

    const clipsViewer = new ClipsViewer({ BrowserWindow, ipcMain, shell, clipboard, dir: paths.clips });

    const openKirka = (url) => {
      if (alive(gameWindow)) {
        if (url) gameWindow.loadURL(url);
        return gameWindow.focus();
      }
      gameWindow = createGameWindow({ settings, paths, url, onUrlChange: (url) => discord.setUrl(url), onClip: () => clips.save(), onClips: () => clipsViewer.open() });
      clips.setSource(gameWindow);
      discord.setGame("kirka");
      gameWindow.on("focus", () => scrims.wake());
      gameWindow.webContents.once("did-finish-load", applyEar);
      gameWindow.on("closed", () => {
        gameWindow = null;
        ear.stop();
        clips.setSource(null);
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
      closeHub();
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
      prices: new Prices({ fetch: (url) => net.fetch(url) }),
      ear,
      hub: { play, back: backToHub },
      licencia,
      startup,
      clipsViewer,
      clips,
    });

    // Straight into a game (the "remember" box of the hub): no hub until the player goes back.
    const target = startTarget(settings.getAll());
    if (target === "hub" || !play(target)) showHub();

    if (app.isPackaged && settings.get("autoUpdate")) updates.check({ beta: settings.get("betaUpdates") });
  });

  // Closing the hub (the only window the player sees with no game open) quits.
  // A game window closing opens the hub again, so the app stays open: that
  // happens in the game's "closed" event, so the check waits a moment.
  app.on("window-all-closed", () => {
    setTimeout(() => {
      if (!BrowserWindow.getAllWindows().length) app.quit();
    }, 0);
  });
}
