"use strict";

const { shell } = require("electron");
const { isLoginUrl, cleanUserAgent, loginUrlPatterns } = require("../navigation");

// What a game window does with window.open(). Login providers (Kirka sends
// Discord and Facebook through Xsolla) open in a small popup that shares the
// window's session, so the cookies the login leaves behind are the game's and
// the account stays logged in. Game links load as before; anything else goes
// to the system browser.
function windowOpenHandler(classify) {
  return ({ url }) => {
    const action = classify(url);
    if (action === "internal") {
      if (!isLoginUrl(url)) return { action: "allow" };
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          center: true,
          fullscreen: false,
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          title: "RITE Client · Iniciar sesión",
        },
      };
    }
    if (action === "external") shell.openExternal(url);
    return { action: "deny" };
  };
}

// Login popups: no menu, and a fullscreen game window must not hide them.
function watchLoginPopups(win) {
  win.webContents.on("did-create-window", (child) => {
    child.removeMenu();
    if (win.isFullScreen()) child.setAlwaysOnTop(true);
    child.webContents.setUserAgent(cleanUserAgent(child.webContents.getUserAgent()));
  });
}

// Requests to login providers leave the "Electron" part out of the user agent,
// whichever window makes them (popup or a redirect in the game window itself).
const patched = new WeakSet();
function cleanLoginUserAgent(ses) {
  if (patched.has(ses)) return;
  patched.add(ses);
  ses.webRequest.onBeforeSendHeaders({ urls: loginUrlPatterns() }, (details, callback) => {
    const headers = details.requestHeaders;
    if (headers["User-Agent"]) headers["User-Agent"] = cleanUserAgent(headers["User-Agent"]);
    callback({ requestHeaders: headers });
  });
}

module.exports = { windowOpenHandler, watchLoginPopups, cleanLoginUserAgent };
