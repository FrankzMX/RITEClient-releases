"use strict";

const path = require("node:path");
const { app, protocol, session, net, nativeImage, BrowserWindow, ipcMain, shell, clipboard, screen, dialog } = require("electron");
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
const { startReplayRelay } = require("./replay-relay");
const { findLink, parseReplayLink, registerReplayLinks } = require("./replay-link");
const { Player } = require("./windows/player");
const { createHubWindow } = require("./windows/hub");
const i18n = require("./i18n");
const { startTarget, isGame } = require("./hub");
const pkg = require("../../package.json");
const edition = require("./edition");
const rust = require("./rust");

// RITE Light (src/main/edition.js) keeps its settings apart from RITE Client,
// so both can be installed and open at the same time. Its installer already
// has its own name; started with --rite-light, a copy of the code takes it.
const LIGHT = edition.isLight();
if (LIGHT) {
  app.setName(edition.NAME);
  app.setPath("userData", path.join(app.getPath("appData"), edition.NAME));
  // Windows groups taskbar buttons by this id: with Light's own (its
  // installer's appId), Light opened from RITE Client's hub shows its silver
  // window icon instead of RITE Client's gold one, and never stacks with it.
  if (process.platform === "win32") app.setAppUserModelId(edition.LIGHT_APP_ID);
}

// "Reiniciar cliente" starts the new client as the old one exits: if the old
// one still holds the lock for a moment, the new one waits for it instead of
// quitting (which left the player with no client at all).
const RELAUNCH = "--rite-relaunch";
const run = LIGHT ? () => require("./light").startLight({ relaunchArg: RELAUNCH }) : start;
if (app.requestSingleInstanceLock()) run();
else if (!process.argv.includes(RELAUNCH)) app.quit();
else {
  let tries = 0;
  const retry = setInterval(() => {
    if (app.requestSingleInstanceLock()) {
      clearInterval(retry);
      run();
    } else if (++tries >= 40) {
      clearInterval(retry);
      app.quit();
    }
  }, 150);
}

function start() {
  const settings = new SettingsStore(app.getPath("userData"));
  // What actually runs: the player's settings, lightened by performance mode.
  const live = () => effectiveSettings(settings.getAll());
  // The hub and «Mis clips» are told the language when they open (src/main/i18n.js).
  const language = () => i18n.resolveLanguage(settings.get("language"), app.getLocale());
  // What this run was started with: the GPU profile, backend and FPS limit only change on restart.
  const startup = live();
  applySwitches(app, startup);
  registerSwapScheme(protocol);

  // Two windows: the hub and the Kirka window. One at a
  // time: opening the game closes the hub (its page and renderer process, so the
  // RAM and CPU go to the game), and going back to the hub closes the game and
  // opens the hub again. Its state lives in the settings, so nothing is lost.
  let hubWindow = null;
  let gameWindow = null; // Kirka
  const alive = (win) => Boolean(win && !win.isDestroyed());
  const getWindow = () => gameWindow;
  const getHub = () => hubWindow;
  const front = () => [gameWindow, hubWindow].find((win) => alive(win) && win.isVisible()) || null;
  // Restarting from a game goes straight back to it, without the hub. While it
  // quits, closing windows no longer opens the hub.
  let quitting = false;
  const restart = () => {
    quitting = true;
    const game = alive(gameWindow) ? "kirka" : "";
    const args = process.argv.slice(1).filter((arg) => arg !== RELAUNCH && !arg.startsWith("--rite-open="));
    args.push(RELAUNCH);
    if (game) args.push(`--rite-open=${game}`);
    app.relaunch({ args });
    app.exit(0);
  };
  // «RITE Light» in the hub: this same program starts again as Light (its own
  // settings and lock) and RITE Client closes, so nothing of it runs while
  // you play. Light updates with RITE Client.
  const openLight = () => {
    quitting = true;
    app.relaunch({ args: edition.lightLaunchArgs({ isPackaged: app.isPackaged, appPath: app.getAppPath() }) });
    app.exit(0);
    return true;
  };

  // rite://repeticion links (the RITE Viewer's "Ver en Kirka"): from the
  // command line at start, from a second launch, or from macOS.
  let pendingLink = findLink(process.argv);
  let openLink = null;
  const takeLink = (link) => {
    if (openLink) openLink(link);
    else pendingLink = link;
  };
  app.on("open-url", (event, link) => {
    event.preventDefault();
    takeLink(link);
  });

  app.on("second-instance", (event, argv) => {
    const link = findLink(argv);
    if (link) return takeLink(link);
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
    // The swapper only touches the default session, where Kirka lives.
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
      hubWindow = createHubWindow({ version: app.getVersion(), lang: language() });
      hubWindow.on("focus", () => scrims.wake());
      hubWindow.on("closed", () => {
        hubWindow = null;
      });
      return hubWindow;
    };
    const showHub = () => {
      if (quitting) return;
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
        if (alive(win) && !win.isVisible() && alive(gameWindow)) win.destroy();
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

    const clipsViewer = new ClipsViewer({ BrowserWindow, ipcMain, shell, clipboard, dir: paths.clips, language });

    const openKirka = (url) => {
      if (alive(gameWindow)) {
        if (url) gameWindow.loadURL(url);
        return gameWindow.focus();
      }
      gameWindow = createGameWindow({ settings, paths, url, onUrlChange: (url) => {
          discord.setUrl(url);
          clips.setUrl(url);
        }, onClip: () => clips.save(), onClips: () => clipsViewer.open() });
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

    // From the hub: opens one game (on `url` when the hub sends a match room)
    // and hides the hub. If the other game is still open (it closes on its own
    // way back to the hub), it is closed first.
    const play = (game, url) => {
      if (game === "kirka") {
        openKirka(url);
      } else {
        return false;
      }
      closeHub();
      return true;
    };

    // "Volver al hub" from a game: closes that game's window, which shows the hub.
    const backToHub = (which) => {
      const win = gameWindow;
      if (alive(win)) win.close();
      else showHub();
      return true;
    };

    registerIpc({
      getWindow,
      getHub,
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
      openLight,
      // «RITE Rust» in the hub: its own program (src/main/rust.js); RITE Client closes.
      openRust: () =>
        rust.openRust({
          fetch: (url, options) => net.fetch(url, options),
          quit: () => {
            quitting = true;
            app.exit(0);
          },
        }),
    });

    // The player window for the licensed RITE Repetición module, with the
    // local relay it plays through (127.0.0.1 only, kirka.io pages only),
    // started the first time the window opens.
    let relay = null;
    const player = new Player({
      BrowserWindow,
      screen,
      baseUrl: () => settings.get("baseUrl"),
      stateFile: path.join(app.getPath("userData"), "reproductor.json"),
      preload: path.join(__dirname, "../preload/player.js"),
      icon: path.join(__dirname, "../assets/icon-client.png"),
      language,
      getModule: () => {
        if (!licencia.enabled || !settings.get("remoteModules") || settings.get("tournamentMode")) return null;
        const mod = licencia.scripts(settings.getAll()).scripts.find((s) => s.module === "repeticion");
        return mod ? { code: mod.code, name: mod.name } : null;
      },
    });
    const openPlayer = (hash = "") => {
      if (!player.available()) return false;
      relay ??= startReplayRelay({ log: (message) => console.log(`[RITE] ${message}`) });
      return player.open(hash);
    };
    const REPLAY_HASH = /^rite-rep=(r[a-z0-9]{10}|\d{1,16})(&t=\d{1,5}(\.\d{1,2})?)?$/;
    ipcMain.handle("player:open", (event, hash) => {
      const fromGame = alive(gameWindow) && event.sender === gameWindow.webContents && isGameOrigin(event.senderFrame?.url);
      const fromPlayer = player.alive() && event.sender === player.win.webContents;
      if (!fromGame && !fromPlayer) return false;
      return openPlayer(typeof hash === "string" && REPLAY_HASH.test(hash) ? hash : "");
    });
    ipcMain.handle("player:control", (event, action) => player.control(event, action));
    ipcMain.on("player:module-sync", (event) => {
      try {
        event.returnValue = player.codeFor(event);
      } catch {
        event.returnValue = null;
      }
    });

    // rite:// links (the RITE Viewer's "Ver en Kirka") open the player window.
    // Without the module: a notice, and the usual start if nothing is open.
    openLink = async (link) => {
      const replay = parseReplayLink(link);
      if (!replay) return false;
      if (licencia.enabled && settings.get("remoteModules")) await licencia.fresh({ maxAgeMs: 60000, waitMs: 4000 }).catch(() => {});
      if (openPlayer(`rite-rep=${replay.id}&t=${replay.t}`)) return true;
      dialog.showMessageBox({
        type: "info",
        title: "RITE Reproductor",
        message: "Para ver repeticiones necesitas el módulo RITE Repetición.",
        detail: "Es un módulo con licencia: actívalo en el menú del cliente, en Módulos RITE.",
      });
      return false;
    };
    try {
      registerReplayLinks(app, path);
    } catch (error) {
      console.log(`[RITE] rite:// links: ${error.message}`);
    }
    const startGame = () => {
      // Straight into a game (the "remember" box of the hub): no hub until the player goes back.
      const reopen = process.argv.find((arg) => arg.startsWith("--rite-open="))?.slice("--rite-open=".length);
      const target = isGame(reopen) ? reopen : startTarget(settings.getAll());
      if (target === "hub" || !play(target)) showHub();
    };
    // A rite:// link that started the app opens only the player.
    if (pendingLink && parseReplayLink(pendingLink)) {
      const link = pendingLink;
      pendingLink = null;
      openLink(link).then((opened) => opened || startGame());
    } else {
      startGame();
    }

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
