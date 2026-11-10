"use strict";

// Runs in an isolated world: it can touch the page's DOM, but the page's own
// scripts cannot see anything defined here.

const { contextBridge, ipcRenderer, webFrame } = require("electron");
const { isGameOrigin } = require("../main/navigation");
const i18n = require("../main/i18n");
const { sourceUrl: scriptSourceUrl } = require("./features/script-options");

if (window.top === window && isGameOrigin(location.href)) {
  // For the licensed RITE Repetición module: opens the player window (only
  // when the player has that module), on a recording: "rite-rep=<id>&t=<s>".
  contextBridge.exposeInMainWorld("riteReproductor", Object.freeze({ open: (hash = "") => ipcRenderer.invoke("player:open", String(hash)) }));
  if (require("../main/edition").isLight()) initLight();
  else init();
}

// RITE Light (src/main/edition.js): the frame hook, block textures, userscripts,
// the crosshair and FPS counter, RITE Bench (off until the player turns it on),
// the menu and the update card. Nothing else is loaded, so no observer or
// timer of the full client runs in the page.
function initLight() {
  const { createOverlay } = require("./features/overlay");
  const { createPerfStats } = require("./features/perf");
  const { createStyles } = require("./features/styles");
  const { createMenu } = require("./features/menu");
  const { SECTIONS } = require("./features/menu-schema");
  const { lightSections } = require("../main/edition");
  const { createToast } = require("./features/toast");
  const { createUpdateCard } = require("./features/update");
  const { applyBlockTexture, KEY: TEXTURE_KEY } = require("./features/texture");
  const { hookLiveBlocks, setLiveBlocks } = require("./features/live-texture");
  const { dataUrl } = require("./features/assets");
  const { effectiveSettings: live } = require("../main/perf-mode");

  const early = live(ipcRenderer.sendSync("settings:get-sync"));
  if (!early) return;
  // Now, for the RITE modules that start below (riteModule.lang).
  i18n.setLanguage(i18n.resolveLanguage(early.language, navigator.language));
  const cap = ipcRenderer.sendSync("display:frame-cap-sync") || {};
  hookFrames(cap.limit || 0, early.frameHook);
  // Before userscripts: only texture uploads are hooked, nothing per frame.
  hookLiveBlocks(webFrame);
  // Userscripts only when the player turned them on (off by default).
  const scriptsOptions = document.createElement("div");
  scriptsOptions.id = "scripts-options";
  const scripts = early.userscriptsEnabled ? ipcRenderer.sendSync("custom:scripts-sync") || [] : [];
  if (scripts.length) {
    const { PAGE_SOURCE } = require("./features/script-options");
    webFrame.executeJavaScript(PAGE_SOURCE).catch((error) => console.error("[RITE] script options:", error));
    for (const script of scripts) runUserscript(script);
  }

  const textureFiles = new Map();
  const fileUrl = (name) => {
    if (!textureFiles.has(name)) textureFiles.set(name, ipcRenderer.sendSync("textures:data-sync", name));
    return textureFiles.get(name);
  };
  const ownTexture = () => {
    try {
      return JSON.parse(localStorage.getItem(TEXTURE_KEY) || '""') || "";
    } catch {
      return "";
    }
  };
  let liveTexture = "";
  try {
    applyBlockTexture(localStorage, early, dataUrl, fileUrl);
    liveTexture = ownTexture();
  } catch (error) {
    console.error("[RITE] block texture:", error);
  }

  const api = {
    getSettings: () => ipcRenderer.invoke("settings:get"),
    setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
    resetSettings: () => ipcRenderer.invoke("settings:reset"),
    exportSettings: () => ipcRenderer.invoke("settings:export"),
    importSettings: () => ipcRenderer.invoke("settings:import"),
    listCustomizations: () => ipcRenderer.invoke("custom:list"),
    loadCustomizations: () => ipcRenderer.invoke("custom:load"),
    reloadSwapper: () => ipcRenderer.invoke("swapper:reload"),
    texturesList: () => ipcRenderer.invoke("textures:list"),
    openFolder: (name) => ipcRenderer.invoke("folder:open", name),
    getInfo: () => ipcRenderer.invoke("app:info"),
    openLink: (url) => ipcRenderer.invoke("app:open-link", url),
    restart: () => ipcRenderer.invoke("app:restart"),
    importFull: () => ipcRenderer.invoke("light:import-full"),
    installUpdate: () => ipcRenderer.invoke("update:install"),
    perfList: () => ipcRenderer.invoke("perf:list"),
    perfClear: () => ipcRenderer.invoke("perf:clear"),
    perfMetrics: () => ipcRenderer.invoke("perf:metrics"),
  };

  const ready = new Promise((resolve) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", resolve, { once: true });
    else resolve();
  });

  Promise.all([api.getSettings(), ready]).then(async ([initial]) => {
    let settings = initial;
    // Before any panel is made: they translate themselves when it is English.
    i18n.setLanguage(i18n.resolveLanguage(settings.language, navigator.language));
    const toast = createToast();
    const styles = createStyles();
    const overlay = createOverlay(settings);
    const perf = createPerfStats({ ipc: ipcRenderer, overlay, getSettings: () => settings });
    const menu = createMenu({ api, settings, toast, scrims: null, scriptsOptions: scripts.length ? scriptsOptions : null, sections: lightSections(SECTIONS), brand: "Light" });
    const applyLook = (s) => {
      styles.setPerf(Boolean(s.performanceMode));
      styles.setCustomCss(s.tournamentMode ? "" : s.customCss);
    };
    applyLook(settings);
    const { styles: userStyles } = await api.loadCustomizations();
    styles.setUserStyles(userStyles);

    ipcRenderer.on("rite:settings-changed", (_event, next) => {
      overlay.update(next);
      perf.update(next);
      menu.update(next);
      try {
        applyBlockTexture(localStorage, next, dataUrl, fileUrl);
        const now = ownTexture();
        if (now !== liveTexture) setLiveBlocks(webFrame, (liveTexture = now));
      } catch {}
      applyLook(next);
      settings = next;
    });
    const updateCard = createUpdateCard({ api });
    ipcRenderer.on("rite:update", (_event, state) => updateCard.apply(state));
    ipcRenderer.invoke("update:get").then((state) => updateCard.apply(state)).catch(() => {});
    ipcRenderer.on("rite:toast", (_event, { message, type }) => toast.show(message, type));
  }).catch((error) => console.error("[RITE] init failed:", error));
}

function init() {
  const { createOverlay } = require("./features/overlay");
  const { createPerfStats } = require("./features/perf");
  const { createPcCheck } = require("./features/pc-check");
  const { createAutoClip } = require("./features/autoclip");
  const { createStyles } = require("./features/styles");
  const { createMenu } = require("./features/menu");
  const { createToast } = require("./features/toast");
  const { createHealthColors } = require("./features/health");
  const { createMatchStats } = require("./features/stats");
  const { createRecolor } = require("./features/recolor");
  const { createLinks } = require("./features/links");
  const { createScrims } = require("./features/scrims");
  const { createAutoResult } = require("./features/result");
  const { createAutoLobby } = require("./features/lobby");
  const { createBadges } = require("./features/badges");
  const { createTradeHelper } = require("./features/trade");
  const { createUpdateCard } = require("./features/update");
  const { applyBlockTexture, KEY: TEXTURE_KEY } = require("./features/texture");
  const { hookLiveBlocks, setLiveBlocks } = require("./features/live-texture");
  const { createTexturePanel } = require("./features/texture-panel");
  const { dataUrl } = require("./features/assets");
  const { PAGE_SOURCE: SCRIPT_OPTIONS_SOURCE } = require("./features/script-options");

  // Kirka reads its block texture setting on load, so set it before any page
  // script runs.
  const { effectiveSettings: live } = require("../main/perf-mode");
  const early = live(ipcRenderer.sendSync("settings:get-sync"));
  if (!early) return;
  // Now, for the RITE modules that start below (riteModule.lang).
  i18n.setLanguage(i18n.resolveLanguage(early.language, navigator.language));
  listenPackDecode();
  // Scripts made for other Kirka clients (Juice, BKC) put their settings in a
  // #scripts-options element; the client menu adds it to the page (there is no
  // document yet here) and shows it under Personalización.
  const scriptsOptions = document.createElement("div");
  scriptsOptions.id = "scripts-options";
  // The cap the client was started with: the profile (vsync or not) only changes on restart.
  const cap = ipcRenderer.sendSync("display:frame-cap-sync") || {};
  hookFrames(cap.limit || 0, early.frameHook);
  // Before userscripts: only texture uploads are hooked, nothing per frame.
  hookLiveBlocks(webFrame);
  // Each RITE module gets its own options box, #rite-opciones-<id>, which the
  // menu shows behind that module's «Opciones» button (scripts that only know
  // #scripts-options still work: their options show there).
  const moduleOptions = new Map();
  // Sorts what each script puts in #scripts-options into its own box (script-options.js).
  webFrame.executeJavaScript(SCRIPT_OPTIONS_SOURCE).catch((error) => console.error("[RITE] script options:", error));
  for (const script of ipcRenderer.sendSync("custom:scripts-sync") || []) {
    if (script.module && /^[a-z0-9-]{1,40}$/.test(script.module) && !moduleOptions.has(script.module)) {
      const box = document.createElement("div");
      box.id = `rite-opciones-${script.module}`;
      moduleOptions.set(script.module, box);
    }
    runUserscript(script);
  }
  // Textures from Documentos/RITEClient/texturas, kept until the panel rereads the folder.
  const textureFiles = new Map();
  const fileUrl = (name) => {
    if (!textureFiles.has(name)) textureFiles.set(name, ipcRenderer.sendSync("textures:data-sync", name));
    return textureFiles.get(name);
  };
  // The block texture the game shows: the client's, else the one set in Kirka's own settings.
  const ownTexture = () => {
    try {
      return JSON.parse(localStorage.getItem(TEXTURE_KEY) || '""') || "";
    } catch {
      return "";
    }
  };
  let liveTexture = "";
  try {
    applyBlockTexture(localStorage, early, dataUrl, fileUrl);
    liveTexture = ownTexture();
  } catch (error) {
    console.error("[RITE] block texture:", error);
  }

  const api = {
    getSettings: () => ipcRenderer.invoke("settings:get"),
    setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
    resetSettings: () => ipcRenderer.invoke("settings:reset"),
    exportSettings: () => ipcRenderer.invoke("settings:export"),
    importSettings: () => ipcRenderer.invoke("settings:import"),
    listCustomizations: () => ipcRenderer.invoke("custom:list"),
    loadCustomizations: () => ipcRenderer.invoke("custom:load"),
    reloadSwapper: () => ipcRenderer.invoke("swapper:reload"),
    texturesList: () => ipcRenderer.invoke("textures:list"),
    modulesList: () => ipcRenderer.invoke("modules:list"),
    modulesCheck: () => ipcRenderer.invoke("modules:check"),
    licenseActivate: (code) => ipcRenderer.invoke("licencia:activar", code),
    licenseRemove: () => ipcRenderer.invoke("licencia:quitar"),
    openFolder: (name) => ipcRenderer.invoke("folder:open", name),
    openClips: () => ipcRenderer.invoke("clips:viewer"),
    getInfo: () => ipcRenderer.invoke("app:info"),
    openLink: (url) => ipcRenderer.invoke("app:open-link", url),
    restart: () => ipcRenderer.invoke("app:restart"),
    hub: () => ipcRenderer.invoke("app:hub"),
    scrimsGet: () => ipcRenderer.invoke("scrims:get"),
    scrimsPair: () => ipcRenderer.invoke("scrims:pair"),
    scrimsReady: (checkId, ok) => ipcRenderer.invoke("scrims:ready", checkId, ok),
    scrimsUnlink: () => ipcRenderer.invoke("scrims:unlink"),
    scrimsQueue: (action, game, mode) => ipcRenderer.invoke("scrims:queue", action, game, mode),
    scrimsVote: (matchId, pick) => ipcRenderer.invoke("scrims:vote", matchId, pick),
    scrimsRegister: (form) => ipcRenderer.invoke("scrims:register", form),
    installUpdate: () => ipcRenderer.invoke("update:install"),
    scrimsShareRoom: () => ipcRenderer.invoke("scrims:share-room"),
    scrimsShareLobby: (url) => ipcRenderer.invoke("scrims:share-lobby", url),
    scrimsJoin: (url) => ipcRenderer.invoke("scrims:join", url),
    scrimsSwitch: (game, url) => ipcRenderer.invoke("scrims:switch", game, url),
    mapsList: () => ipcRenderer.invoke("maps:list"),
    mapCode: (name) => ipcRenderer.invoke("maps:code", name),
    scrimsOpen: (url) => ipcRenderer.invoke("scrims:open", url),
    scrimsResult: (result) => ipcRenderer.invoke("scrims:result", result),
    perfList: () => ipcRenderer.invoke("perf:list"),
    perfClear: () => ipcRenderer.invoke("perf:clear"),
    perfMetrics: () => ipcRenderer.invoke("perf:metrics"),
  };

  const ready = new Promise((resolve) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", resolve, { once: true });
    else resolve();
  });

  Promise.all([api.getSettings(), ready]).then(async ([initial]) => {
    let settings = initial;
    // Before any panel is made: they translate themselves when it is English.
    i18n.setLanguage(i18n.resolveLanguage(settings.language, navigator.language));
    const toast = createToast();
    const styles = createStyles();
    const overlay = createOverlay(settings);
    const health = createHealthColors({ overlay });
    const perf = createPerfStats({ ipc: ipcRenderer, overlay, getSettings: () => settings });
    createPcCheck({ ipc: ipcRenderer, toast });
    createAutoClip({ ipc: ipcRenderer, getSettings: () => settings });
    // Performance mode turns features off without touching the saved choices.
    const perfOn = (s) => Boolean(s.performanceMode);
    const stats = createMatchStats();
    let lobby = null;
    const scrims = createScrims({ api, toast, settings, createRoom: (options) => lobby.createRoom(options), roomOptions: () => lobby.options(), joinRoom: (url) => lobby.join(url) });
    createAutoResult({ api, toast, getState: () => scrims.state, getSettings: () => settings });
    // The theme recolor waits while the client takes the player into a match.
    lobby = createAutoLobby({ api, toast, webFrame, getState: () => scrims.state, getSettings: () => settings, onJoining: (on) => recolor.pause(on) });
    const menu = createMenu({ api, settings, toast, scrims, scriptsOptions, moduleOptions });
    const recolor = createRecolor();
    const trade = createTradeHelper({ webFrame, toast, getSettings: () => settings, getPrices: () => ipcRenderer.invoke("trade:prices"), getHistory: () => ipcRenderer.invoke("trade:history"),
      ear: {
        set: (on) => ipcRenderer.invoke("settings:set", "tradeEar", Boolean(on)),
        window: (action) => ipcRenderer.invoke("trade:ear", action),
        onLines: (fn) => ipcRenderer.on("rite:trade-ear-lines", (_e, lines) => fn(Array.isArray(lines) ? lines : [])),
        onState: (fn) => ipcRenderer.on("rite:trade-ear-state", (_e, state) => fn(state || {})),
      },
    });
    const texturePanel = createTexturePanel({ api: { ...api, texturesList: () => (textureFiles.clear(), api.texturesList()) }, toast, settings, riteDarkThumb: dataUrl("textures/rite-dark.png") });
    window.addEventListener("rite-blocks-state", (e) => texturePanel.applied(Number(e.detail)));
    const badges = createBadges();
    let badgeList = [];
    const badgesOn = (s) => live(s).riteBadges && !s.tournamentMode;
    const { credits } = await api.getInfo();
    const links = createLinks({ api, links: credits.community });
    const applyLook = (s) => {
      styles.setTheme(s.riteTheme && !s.tournamentMode);
      recolor.update(s.riteTheme && !s.tournamentMode && !perfOn(s));
      links.update(!s.tournamentMode && !perfOn(s));
      styles.setPerf(perfOn(s));
      styles.setCustomCss(s.tournamentMode ? "" : s.customCss);
    };

    applyLook(settings);
    ipcRenderer.on("rite:modules-changed", () => toast.show("Módulos RITE actualizados: refresca (F5) para aplicarlos"));
    health.update(live(settings));
    stats.update(settings);
    ipcRenderer.on("rite:badges", (_event, list) => {
      badgeList = Array.isArray(list) ? list : [];
      badges.update(badgeList, badgesOn(settings));
    });
    ipcRenderer.invoke("badges:get").then((list) => {
      badgeList = Array.isArray(list) ? list : [];
      badges.update(badgeList, badgesOn(settings));
    }).catch(() => {});

    const { styles: userStyles } = await api.loadCustomizations();
    styles.setUserStyles(userStyles);

    ipcRenderer.on("rite:settings-changed", (_event, next) => {
      overlay.update(next);
      perf.update(next);
      health.update(live(next));
      stats.update(next);
      menu.update(next);
      scrims.update(next);
      trade.update(next);
      texturePanel.update(next);
      try {
        applyBlockTexture(localStorage, next, dataUrl, fileUrl);
        // Swapped in the match right away (src/preload/features/live-texture.js).
        const now = ownTexture();
        if (now !== liveTexture) setLiveBlocks(webFrame, (liveTexture = now));
      } catch {}
      applyLook(next);
      if (badgesOn(next) !== badgesOn(settings)) badges.update(badgeList, badgesOn(next));
      settings = next;
    });
    // RITE pack: tell the client what the game downloaded, to find where Kirka
    // keeps its weapon and character textures (Documentos/RITEClient/texturas-kirka.txt).
    let packMode = live(settings).ritePack;
    ipcRenderer.on("rite:settings-changed", (_event, next) => (packMode = live(next).ritePack));
    let packQueue = [];
    let packTimer = null;
    const sendPack = () => {
      packTimer = null;
      const batch = packQueue.splice(0, 200);
      if (batch.length) ipcRenderer.invoke("pack:note", batch).catch(() => {});
      if (packQueue.length) packTimer = setTimeout(sendPack, 3000);
    };
    new PerformanceObserver((list) => {
      if (!packMode || packMode === "off") return;
      for (const e of list.getEntries()) packQueue.push({ name: e.name, type: e.initiatorType, size: e.decodedBodySize || e.encodedBodySize || 0 });
      // Sent a few seconds after something loads, not on a timer that runs all match.
      if (packQueue.length && !packTimer) packTimer = setTimeout(sendPack, 3000);
    }).observe({ type: "resource", buffered: true });
    ipcRenderer.on("rite:scrims", (_event, state) => scrims.apply(state));
    const updateCard = createUpdateCard({ api });
    ipcRenderer.on("rite:update", (_event, state) => updateCard.apply(state));
    ipcRenderer.invoke("update:get").then((state) => updateCard.apply(state)).catch(() => {});
    ipcRenderer.on("rite:toast", (_event, { message, type }) => toast.show(message, type));
    watchEditorBackup(toast);
  }).catch((error) => console.error("[RITE] init failed:", error));
}

// Kirka keeps the whole editor map in localStorage before TEST MODE and loads it
// back from there on Back to Editor. A copy goes to Documentos/RITEClient/
// respaldos-editor whenever it changes, in case the editor autosaves a map that
// had only half loaded (see src/main/editor-backups.js).
function watchEditorBackup(toast) {
  let last = null;
  const check = () => {
    // The map can be hundreds of KB: reading it every 5 s while playing made
    // garbage for nothing (it only changes in the editor, mouse free).
    if (document.pointerLockElement || document.hidden) return;
    let text = null;
    try {
      text = localStorage.getItem("editorTestMapJson");
    } catch {
      return;
    }
    if (!text || text === last) return;
    last = text;
    ipcRenderer
      .invoke("editor:backup", text)
      .then((saved) => saved && toast.show("Respaldo del mapa guardado (respaldos-editor)"))
      .catch(() => {});
  };
  check();
  setInterval(check, 5000);
}

// Userscripts run in the page's own world, like in a browser extension. They get
// no Node.js access, so scripts written for clients that expose `require` will
// not work unchanged.
// A RITE module also gets `riteModule` in its scope: its id and its own options
// box (riteModule.options()), so it never has to guess the box's id.
// A licensed module also gets `riteModule.boleto`: the license server's signed
// pass (48 h) that rite.lat accepts as «this license opens this module».
// `riteModule.lang` is the client's language ("es" or "en"), for modules with
// their own English.
function runUserscript({ name, code, module, boleto }) {
  const id = module && /^[a-z0-9-]{1,40}$/.test(module) ? module : null;
  const pass = id && typeof boleto === "string" && /^[A-Za-z0-9_.-]{1,8100}$/.test(boleto) ? boleto : "";
  const arg = id
    ? `Object.freeze({ id: ${JSON.stringify(id)}, optionsId: ${JSON.stringify(`rite-opciones-${id}`)}, options: () => document.getElementById(${JSON.stringify(`rite-opciones-${id}`)}), boleto: ${JSON.stringify(pass)}, lang: ${JSON.stringify(i18n.getLanguage())} })`
    : "undefined";
  const source = `((riteModule) => { try {\n${code}\n} catch (error) { console.error(${JSON.stringify(`[RITE] ${name}:`)}, error); } })(${arg});\n//# sourceURL=${scriptSourceUrl({ name, module })}`;
  webFrame.executeJavaScript(source).catch((error) => console.error(`[RITE] ${name}:`, error));
}

// The game's frame hook (counter, cap and the hop for the server's messages):
// see features/frame-hook.js.
function hookFrames(limit, mode) {
  const source = require("./features/frame-hook").frameHookSource(limit, mode);
  if (source) webFrame.executeJavaScript(source).catch((error) => console.error("[RITE] fps:", error));
}

// RITE pack: the client can't read WebP in the main process, so it hands those
// textures here to decode and recolor with a canvas (src/main/rite-pack.js).
function listenPackDecode() {
  const { classify, recolor } = require("../main/rite-pack");
  ipcRenderer.on("pack:decode", async (_event, { id, bytes, type, pathname, mode }) => {
    let out = { id };
    try {
      const bitmap = await createImageBitmap(new Blob([bytes], { type }));
      const { width, height } = bitmap;
      const kind = classify(pathname, width, height, mode);
      out = { id, width, height, kind };
      if (kind) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        const pixels = ctx.getImageData(0, 0, width, height);
        recolor(pixels.data, kind, "rgba");
        ctx.putImageData(pixels, 0, 0);
        // WebP: smaller than PNG and quicker to write and to read back.
        out.type = "image/webp";
        out.image = new Uint8Array(await (await canvas.convertToBlob({ type: "image/webp", quality: 0.92 })).arrayBuffer());
      }
      bitmap.close();
    } catch {}
    ipcRenderer.invoke("pack:decoded", out).catch(() => {});
  });
}
