"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, shell, clipboard } = require("electron");
const { classifyNavigation, isGameOrigin } = require("../navigation");
const { isGameUrl } = require("../settings");
const { backgroundThrottling } = require("../performance");
const { effectiveSettings } = require("../perf-mode");

// `url`: a Kirka room to open right away (from the hub), instead of the lobby.
function createGameWindow({ settings, paths, onUrlChange, url }) {
  const win = new BrowserWindow({
    title: "RITE Client",
    icon: path.join(__dirname, "../../assets/icon.png"),
    width: 1280,
    height: 720,
    show: false,
    fullscreen: settings.get("autoFullscreen"),
    backgroundColor: "#0b0b10",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/game.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload is split into several files, which a sandboxed preload
      // cannot require. The page itself never gets Node access.
      sandbox: false,
      webSecurity: true,
      // Hidden or minimized, the game may slow down (except in competitive).
      backgroundThrottling: backgroundThrottling(effectiveSettings(settings.getAll())),
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
    const action = classifyNavigation(url);
    if (action === "internal") return { action: "allow" };
    if (action === "external") shell.openExternal(url);
    return { action: "deny" };
  });

  webContents.on("will-navigate", (event, url) => {
    const action = classifyNavigation(url);
    if (action === "internal") return;
    event.preventDefault();
    if (action === "external") shell.openExternal(url);
  });

  const notifyUrl = () => onUrlChange?.(webContents.getURL());
  webContents.on("did-navigate", notifyUrl);
  webContents.on("did-navigate-in-page", notifyUrl);

  webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const handled = handleShortcut(win, input, settings, paths);
    if (handled) event.preventDefault();
  });

  webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") webContents.reload();
  });

  win.loadURL(url && classifyNavigation(url) === "internal" && isGameOrigin(url) ? url : settings.get("baseUrl"));
  return win;
}

function handleShortcut(win, input, settings, paths) {
  const { webContents } = win;
  const devtools = settings.get("devToolsShortcut");
  const ctrlShift = (input.control || input.meta) && input.shift;

  switch (input.key) {
    case "F2":
      takeScreenshot(win, paths.screenshots);
      return true;
    case "F4":
      win.loadURL(settings.get("baseUrl"));
      return true;
    case "F5":
      webContents.reload();
      return true;
    case "F6": {
      const text = clipboard.readText().trim();
      if (isGameUrl(text)) win.loadURL(text);
      return true;
    }
    case "F7":
      if (isGameOrigin(webContents.getURL())) clipboard.writeText(webContents.getURL());
      return true;
    case "F11":
      win.setFullScreen(!win.isFullScreen());
      return true;
    case "F12":
      if (!devtools) return false;
      webContents.toggleDevTools();
      return true;
    default:
      if (devtools && ctrlShift && input.key.toLowerCase() === "i") {
        webContents.toggleDevTools();
        return true;
      }
      return false;
  }
}

// Saves a screenshot in Documents/RITEClient/screenshots and copies it. When
// Windows won't let the client write there (e.g. "Controlled folder access"
// or OneDrive), it falls back to Pictures, then to the client's own folder.
async function takeScreenshot(win, dir) {
  const send = (message, type) => win.webContents.send("rite:toast", { message, type });
  let image;
  try {
    image = await win.webContents.capturePage();
    if (image.isEmpty()) throw new Error("captura vacía");
  } catch (error) {
    console.error("[RITE] screenshot:", error);
    return send(`No se pudo tomar la captura (${error.message})`, "error");
  }
  let copied = false;
  try {
    clipboard.writeImage(image);
    copied = true;
  } catch {}
  const name = `rite-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  const png = image.toPNG();
  for (const folder of [dir, path.join(app.getPath("pictures"), "RITEClient"), path.join(app.getPath("userData"), "screenshots")]) {
    try {
      await fs.promises.mkdir(folder, { recursive: true });
      await fs.promises.writeFile(path.join(folder, name), png);
      return send(folder === dir ? "Captura guardada y copiada" : `Captura guardada en ${folder}${copied ? " y copiada" : ""}`);
    } catch (error) {
      console.error("[RITE] screenshot:", folder, error);
    }
  }
  send(copied ? "No se pudo guardar la captura, pero quedó copiada: pégala con Ctrl+V" : "No se pudo guardar ni copiar la captura", copied ? undefined : "error");
}

module.exports = { createGameWindow };
