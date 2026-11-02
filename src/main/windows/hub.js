"use strict";

const path = require("node:path");
const { BrowserWindow, shell } = require("electron");

const PAGE = path.join(__dirname, "../../hub/index.html");

// The hub: the first window of the client, where the player picks Kirka or
// VOXARENA. It is the client's own page (src/hub), not a game, so it runs
// sandboxed with a preload that only exposes what the hub needs.
function createHubWindow({ version }) {
  const win = new BrowserWindow({
    title: "RITE Client",
    icon: path.join(__dirname, "../../assets/icon.png"),
    width: 1100,
    height: 680,
    minWidth: 820,
    minHeight: 540,
    show: false,
    backgroundColor: "#07060b",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/hub.js"),
      additionalArguments: [`--rite-version=${version}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.removeMenu();
  win.on("page-title-updated", (event) => event.preventDefault());

  const { webContents } = win;
  // The hub never navigates: links go to the system browser, anything else is dropped.
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (url !== webContents.getURL()) event.preventDefault();
  });

  win.loadFile(PAGE);
  return win;
}

const isHubPage = (url) => typeof url === "string" && url.startsWith("file://") && decodeURIComponent(url.replace(/^file:\/\/\/?/, "")).replace(/\\/g, "/").endsWith("hub/index.html");

module.exports = { createHubWindow, isHubPage };
