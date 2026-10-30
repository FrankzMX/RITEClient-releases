"use strict";

const fs = require("node:fs");
const { ipcMain, shell, dialog, app, screen } = require("electron");
const { RESTART_REQUIRED } = require("./defaults");
const { isGameOrigin, isVoxOrigin } = require("./navigation");
const { isHubPage } = require("./windows/hub");
const { isGame } = require("./hub");
const { listCustomizations, loadEnabled } = require("./userscripts");
const credits = require("./credits");
const { listMaps, mapCode } = require("./maps");
const { isRoomUrl, isLobbyUrl, isDiscordUrl } = require("./scrims");

// Only the top frame of the game window, while it shows a Kirka page, may talk
// to the main process.
function trusted(getWindow, event) {
  const win = getWindow();
  return (
    !!win &&
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    isGameOrigin(event.senderFrame.url)
  );
}

// The hub page (the client's own file) and the top frame of the VOXARENA window
// each get their own, smaller set of channels.
function trustedHub(getHub, event) {
  const win = getHub();
  return !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && isHubPage(event.senderFrame.url);
}

function trustedVox(getVox, event) {
  const win = getVox();
  return !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && isVoxOrigin(event.senderFrame.url);
}

function registerIpc({ getWindow, getHub = () => null, getVox = () => null, settings, paths, swapper, scrims, pack, restart, updates, badges, hub }) {
  const handle = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(getWindow, event)) throw new Error("Untrusted sender");
      return fn(...args);
    });
  const handleHub = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!trustedHub(getHub, event)) throw new Error("Untrusted sender");
      return fn(...args);
    });

  // Hub (src/hub): pick a game, remember the choice, open RITE's links.
  handleHub("hub:info", () => ({ version: app.getVersion(), settings: settings.getAll(), links: credits.community, update: updates.state, scrims: scrims.state }));
  handleHub("hub:play", (game) => {
    if (!isGame(game)) throw new Error("Juego inválido");
    return hub.play(game);
  });
  handleHub("hub:set", (key, value) => {
    // The hub only touches its own settings.
    if (!["startGame", "hubLayout", "hubFolded"].includes(key)) throw new Error("Ajuste inválido");
    return settings.set(key, value);
  });
  handleHub("hub:open-link", (url) => {
    const link = credits.links.find((item) => item.url === url);
    if (link) shell.openExternal(link.url);
  });
  handleHub("hub:update-install", () => updates.install());

  // VOXARENA: the game's "Volver al hub" button.
  ipcMain.handle("vox:hub", (event) => {
    if (!trustedVox(getVox, event)) throw new Error("Untrusted sender");
    return hub.back("voxarena");
  });
  // Kirka: "Volver al hub" in the client menu.
  handle("app:hub", () => hub.back("kirka"));

  handle("settings:get", () => settings.getAll());

  // Synchronous variant for the preload, which needs settings before the page's
  // own scripts run (e.g. to set the block texture before Kirka reads it).
  // Refresh rate of the monitor the game is on (for the "auto" FPS limit).
  ipcMain.on("display:hz-sync", (event) => {
    const win = getWindow();
    const hz = win && trusted(getWindow, event) ? screen.getDisplayMatching(win.getBounds()).displayFrequency : 0;
    event.returnValue = hz >= 30 && hz <= 1000 ? Math.round(hz) : 60;
  });

  ipcMain.on("settings:get-sync", (event) => {
    event.returnValue = trusted(getWindow, event) ? settings.getAll() : null;
  });

  handle("settings:set", (key, value) => {
    const ok = settings.set(String(key), value);
    return { ok, restart: ok && RESTART_REQUIRED.includes(key) };
  });

  handle("settings:reset", () => {
    settings.reset();
    restart();
  });

  handle("settings:export", async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: "Exportar ajustes de RITE Client",
      defaultPath: "rite-settings.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) return false;
    await fs.promises.writeFile(filePath, settings.export(), "utf8");
    return true;
  });

  handle("settings:import", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: "Importar ajustes de RITE Client",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return false;
    settings.import(await fs.promises.readFile(filePaths[0], "utf8"));
    return true;
  });

  handle("custom:list", () => listCustomizations(paths, settings.getAll()));

  // Userscripts are read before the page runs, so they can hook the game early
  // and still see DOMContentLoaded, like in other clients.
  ipcMain.on("custom:scripts-sync", (event) => {
    const all = settings.getAll();
    event.returnValue = trusted(getWindow, event) && !all.tournamentMode ? loadEnabled(paths, all).scripts : [];
  });

  handle("custom:load", () => {
    const all = settings.getAll();
    if (all.tournamentMode) return { scripts: [], styles: [] };
    return loadEnabled(paths, all);
  });

  handle("swapper:reload", () => swapper.reload());
  handle("pack:note", (entries) => pack?.note(entries));
  handle("pack:decoded", (out) => pack?.decoded(out));

  handle("folder:open", (name) => {
    const folders = { swapper: paths.swapper, scripts: paths.scripts, styles: paths.styles, screenshots: paths.screenshots, maps: paths.maps };
    if (folders[name]) shell.openPath(folders[name]);
  });

  handle("app:info", () => ({ version: app.getVersion(), credits }));

  handle("app:restart", () => restart());

  // RITE scrims, validated once and offered to both the Kirka page and the hub.
  const scrimsApi = {
    get: () => scrims.state,
    pair: () => scrims.pair(),
    ready: (checkId, ok) => scrims.ready(checkId, ok),
    unlink: () => scrims.unlink(),
    queue: (action, game, mode) => {
      if (action === "leave") return scrims.queue({ action });
      if (action === "join" && typeof game === "string" && typeof mode === "string" && game.length < 20 && mode.length < 20)
        return scrims.queue({ action, game, mode });
      throw new Error("Acción inválida");
    },
    // A vote in the map vote of the player's match; the bot counts it with the thread's.
    vote: (matchId, pick) => {
      if (!Number.isInteger(matchId) || matchId < 1 || !Number.isInteger(pick) || pick < 0 || pick > 9) throw new Error("Voto inválido");
      return scrims.queue({ action: "vote", matchId, pick });
    },
    register: (form) => {
      const pick = (key, max) => (typeof form?.[key] === "string" ? form[key].trim().slice(0, max) : "");
      const data = { name: pick("name", 24), region: pick("region", 2), kirka: pick("kirka", 48) };
      if (data.name.length < 2) throw new Error("Escribe tu gamer tag (mínimo 2 caracteres)");
      if (!["EU", "NA", "SA"].includes(data.region)) throw new Error("Elige tu región");
      return scrims.register(data);
    },
    open: (url) => {
      if (isDiscordUrl(url)) shell.openExternal(url);
    },
    // The game of the player's match, from the other game's panel: opens that
    // game (on the match's room when there is one), which closes this window.
    switch: (game, url) => {
      const link = typeof url === "string" && url.length <= 300 ? url : "";
      if (game === "kirka" && (!link || isRoomUrl(link) || isLobbyUrl(link))) return hub.play("kirka", link || undefined);
      if (game === "voxarena" && (!link || isVoxOrigin(link))) return hub.play("voxarena", link || undefined);
      throw new Error("Juego o sala inválidos");
    },
  };
  handle("scrims:switch", scrimsApi.switch);
  // VOXARENA draws its own queue panel with these (window.riteClient.scrims):
  // the same scrims, and only the scrims settings, read-only.
  const handleVox = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!trustedVox(getVox, event)) throw new Error("Untrusted sender");
      return fn(...args);
    });
  handleVox("vox:settings-get", () => {
    const s = settings.getAll();
    return { enabled: s.scrimsEnabled !== false, panel: s.scrimsPanel !== false, sound: s.scrimsSound !== false, queueAlert: s.scrimsQueueAlert !== false };
  });
  handleVox("vox:scrims-get", scrimsApi.get);
  handleVox("vox:scrims-pair", scrimsApi.pair);
  handleVox("vox:scrims-ready", scrimsApi.ready);
  handleVox("vox:scrims-unlink", scrimsApi.unlink);
  handleVox("vox:scrims-queue", scrimsApi.queue);
  handleVox("vox:scrims-vote", scrimsApi.vote);
  handleVox("vox:scrims-register", scrimsApi.register);
  handleVox("vox:scrims-open", scrimsApi.open);
  handleVox("vox:scrims-switch", scrimsApi.switch);
  handleVox("vox:open-link", (url) => {
    const link = credits.links.find((item) => item.url === url);
    if (link) shell.openExternal(link.url);
  });
  handle("scrims:get", scrimsApi.get);
  handle("scrims:pair", scrimsApi.pair);
  handle("scrims:ready", scrimsApi.ready);
  handle("scrims:unlink", scrimsApi.unlink);
  handle("scrims:queue", scrimsApi.queue);
  handle("scrims:vote", scrimsApi.vote);
  handleHub("hub:scrims-get", scrimsApi.get);
  handleHub("hub:scrims-pair", scrimsApi.pair);
  handleHub("hub:scrims-ready", scrimsApi.ready);
  handleHub("hub:scrims-unlink", scrimsApi.unlink);
  handleHub("hub:scrims-queue", scrimsApi.queue);
  handleHub("hub:scrims-vote", scrimsApi.vote);
  handleHub("hub:scrims-register", scrimsApi.register);
  handleHub("hub:scrims-open", scrimsApi.open);
  // Community chat, only from the hub.
  handleHub("hub:chat-get", (after) => scrims.chat(Number.isInteger(after) && after >= 0 ? after : 0));
  handleHub("hub:chat-say", (text) => {
    const clean = typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    if (!clean) throw new Error("Escribe algo");
    return scrims.say(clean);
  });
  // "Entrar a la sala" from the hub: opens the game of the match on that room.
  // Only Kirka room links and VOXARENA links are followed, each in its own window.
  handleHub("hub:scrims-join", (url) => {
    if (isRoomUrl(url)) return hub.play("kirka", url);
    if (isVoxOrigin(url) && typeof url === "string" && url.length <= 300) return hub.play("voxarena", url);
    return false;
  });
  handle("update:get", () => updates.state);
  handle("update:install", () => updates.install());

  // The page asks once it is ready; later changes arrive as "rite:badges".
  handle("badges:get", () => badges());

  // Shares the Kirka room this window is in with the player's open match.
  handle("scrims:share-room", () => {
    const url = getWindow()?.webContents.getURL();
    if (!isRoomUrl(url)) throw new Error("Primero entra a tu sala de Kirka");
    return scrims.queue({ action: "room", url });
  });
  // The party lobby the RITE lobby set up for the player's match.
  handle("maps:list", () => listMaps(paths.maps));
  handle("maps:code", (name) => mapCode(paths.maps, String(name || "").slice(0, 80)));

  handle("scrims:share-lobby", (url) => {
    if (!isLobbyUrl(url)) throw new Error("Ese no es un link de lobby de Kirka");
    return scrims.queue({ action: "room", url });
  });
  // The final score the page read, with a picture of the end screen as evidence.
  handle("scrims:result", async (result) => {
    const score = (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? v : null);
    const text = (v) => (typeof v === "string" ? v.slice(0, 600) : "");
    const red = score(result?.red);
    const blue = score(result?.blue);
    if (red === null || blue === null || red === blue) throw new Error("Marcador inválido");
    let image = "";
    try {
      const shot = await getWindow()?.webContents.capturePage();
      if (shot && !shot.isEmpty()) {
        const { width } = shot.getSize();
        image = (width > 960 ? shot.resize({ width: 960 }) : shot).toJPEG(60).toString("base64");
      }
    } catch {}
    const mine = ["red", "blue"].includes(result?.mine) ? result.mine : "";
    return scrims.result({ red, blue, mine, redText: text(result?.redText), blueText: text(result?.blueText), image });
  });
  // Only Kirka room links (from RITE WEB) and Discord channels are followed.
  handle("scrims:join", (url) => {
    if (!isRoomUrl(url)) return false;
    getWindow()?.loadURL(url);
    return true;
  });
  handle("scrims:open", scrimsApi.open);

  handle("app:open-link", (url) => {
    const link = credits.links.find((item) => item.url === url);
    if (link) shell.openExternal(link.url);
  });
}

module.exports = { registerIpc };
