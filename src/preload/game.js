"use strict";

// Runs in an isolated world: it can touch the page's DOM, but the page's own
// scripts cannot see anything defined here.

const { ipcRenderer, webFrame } = require("electron");
const { isGameOrigin } = require("../main/navigation");

if (window.top === window && isGameOrigin(location.href)) {
  init();
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

  // Kirka reads its block texture setting on load, so set it before any page
  // script runs.
  const { effectiveSettings: live } = require("../main/perf-mode");
  const early = live(ipcRenderer.sendSync("settings:get-sync"));
  if (!early) return;
  listenPackDecode();
  // Scripts made for other Kirka clients (Juice, BKC) put their settings in a
  // #scripts-options element; the client menu adds it to the page (there is no
  // document yet here) and shows it under Personalización.
  const scriptsOptions = document.createElement("div");
  scriptsOptions.id = "scripts-options";
  hookFrames(require("../main/performance").frameCap(early, ipcRenderer.sendSync("display:hz-sync")));
  // Before userscripts, so ones that also hook WebGL (CustomSkinLink) wrap this one.
  hookLiveBlocks(webFrame);
  // Each RITE module gets its own options box, #rite-opciones-<id>, which the
  // menu shows behind that module's «Opciones» button (scripts that only know
  // #scripts-options still work: their options show there).
  const moduleOptions = new Map();
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
        if (now !== liveTexture) setLiveBlocks((liveTexture = now));
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
function runUserscript({ name, code, module }) {
  const id = module && /^[a-z0-9-]{1,40}$/.test(module) ? module : null;
  const arg = id
    ? `Object.freeze({ id: ${JSON.stringify(id)}, optionsId: ${JSON.stringify(`rite-opciones-${id}`)}, options: () => document.getElementById(${JSON.stringify(`rite-opciones-${id}`)}) })`
    : "undefined";
  const source = `((riteModule) => { try {\n${code}\n} catch (error) { console.error(${JSON.stringify(`[RITE] ${name}:`)}, error); } })(${arg});\n//# sourceURL=rite-userscript/${encodeURIComponent(name)}`;
  webFrame.executeJavaScript(source).catch((error) => console.error(`[RITE] ${name}:`, error));
}

// Counts the game's real frames and caps them. Kirka draws on
// requestAnimationFrame, so frames that come sooner than the limit are skipped
// (all callbacks of an allowed frame still run together). An early frame waits
// on a timer instead of asking for frame after frame: with the frame rate
// uncapped Chromium would otherwise spin through empty frames (more than 1000
// a second), using CPU for nothing. Every half second it tells the FPS counter
// (which lives in the preload, where requestAnimationFrame isn't the game's)
// how many frames the game drew.
function hookFrames(limit) {
  webFrame.executeJavaScript(`(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    const step = ${limit > 0 ? 1000 / limit : 0};
    // How early a frame may come and still count: frame times wobble a little,
    // and skipping a frame for being 1 ms early is a visible hitch.
    const slack = step ? Math.max(1, Math.min(2, step * 0.15)) : 0;
    const ids = new Map();
    let seq = 0, last = -Infinity, open = -1, frames = 0, since = performance.now();
    // The time between drawn frames, for RITE Bench (preload/features/perf.js):
    // sent once a second as text (an array would not cross into the preload's world).
    let prev = -1, times = [], sent = since;
    const count = (t) => {
      frames++;
      if (prev >= 0 && times.length < 4000) times.push(Math.round((t - prev) * 100) / 100);
      prev = t;
      if (t - since >= 500) {
        window.dispatchEvent(new CustomEvent("rite-fps", { detail: Math.round((frames * 1000) / (t - since)) }));
        frames = 0;
        since = t;
      }
      if (t - sent >= 1000) {
        window.dispatchEvent(new CustomEvent("rite-frames", { detail: times.join(",") }));
        times = [];
        sent = t;
      }
    };
    window.requestAnimationFrame = (cb) => {
      const id = ++seq;
      const run = (t) => {
        if (t !== open) {
          if (step && t - last < step - slack) {
            const wait = step - slack - (t - last);
            const again = () => ids.has(id) && ids.set(id, raf(run));
            if (wait > 2) ids.set(id, -setTimeout(again, wait - 1));
            else ids.set(id, raf(run));
            return;
          }
          last = step && t - last < step * 2 ? last + step : t;
          open = t;
          count(t);
        }
        ids.delete(id);
        cb(t);
      };
      ids.set(id, raf(run));
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      const inner = ids.get(id);
      if (inner < 0) clearTimeout(-inner);
      else if (inner !== undefined) caf(inner);
      ids.delete(id);
    };
  })();`).catch((error) => console.error("[RITE] fps:", error));
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
