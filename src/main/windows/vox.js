"use strict";

const path = require("node:path");
const { BrowserWindow, shell, session } = require("electron");
const { classifyVoxNavigation, isVoxOrigin } = require("../navigation");
const { VOX_URL } = require("../defaults");

// Every VOXARENA window shares this session, which Kirka never touches: its
// cookies, cache and storage live apart from Kirka's, and the swapper protocol
// (registered on the default session only) does not exist here.
const PARTITION = "persist:voxarena";

// The VOXARENA window: the game as it is on the web, in its own session, with a
// tiny preload that only tells the game it runs inside RITE Client (so it can
// show the RITE theme and the "Volver al hub" button). No swapper, userscripts,
// styles or Kirka features ever load here.
// `url`: a VOXARENA link to open right away (a match room from the hub).
function createVoxWindow({ settings, version, url }) {
  const win = new BrowserWindow({
    title: "RITE Client · VOXARENA",
    icon: path.join(__dirname, "../../assets/icon.png"),
    width: 1280,
    height: 720,
    show: false,
    fullscreen: settings.get("autoFullscreen"),
    backgroundColor: "#07090c",
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      preload: path.join(__dirname, "../../preload/vox.js"),
      additionalArguments: [`--rite-version=${version}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.removeMenu();
  win.once("ready-to-show", () => {
    if (!settings.get("autoFullscreen")) win.maximize();
    win.show();
  });
  win.on("page-title-updated", (event) => event.preventDefault());

  const { webContents } = win;

  webContents.setWindowOpenHandler(({ url }) => {
    const action = classifyVoxNavigation(url);
    if (action === "internal") return { action: "allow" };
    if (action === "external") shell.openExternal(url);
    return { action: "deny" };
  });

  webContents.on("will-navigate", (event, url) => {
    const action = classifyVoxNavigation(url);
    if (action === "internal") return;
    event.preventDefault();
    if (action === "external") shell.openExternal(url);
  });

  webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    switch (input.key) {
      case "F5":
        webContents.reload();
        break;
      case "F11":
        win.setFullScreen(!win.isFullScreen());
        break;
      case "F12":
        if (!settings.get("devToolsShortcut")) return;
        webContents.toggleDevTools();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") webContents.reload();
  });

  win.loadURL(url && isVoxOrigin(url) ? url : VOX_URL);
  return win;
}

// Clears VOXARENA's cache without touching Kirka's (never its cookies).
function clearVoxCache() {
  return session.fromPartition(PARTITION).clearCache();
}

module.exports = { createVoxWindow, clearVoxCache, PARTITION };
