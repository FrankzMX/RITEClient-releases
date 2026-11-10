"use strict";

// The player window (src/main/windows/player.js). Runs the licensed RITE
// Repetición module, and nothing else, in the Kirka page, with
// `window.__ritePlayer` set so it starts as the player, and gives it the
// title bar buttons as `window.ritePlayer`. Without the module, the page only
// says so: Kirka's lobby is never usable here.

const { contextBridge, ipcRenderer, webFrame } = require("electron");
const { isGameOrigin } = require("../main/navigation");
const i18n = require("../main/i18n");

// The client's language, given by the window (src/main/windows/player.js).
i18n.setLanguage((process.argv.find((arg) => arg.startsWith("--rite-lang=")) || "").slice("--rite-lang=".length));
const { tr } = i18n;

if (window.top === window && isGameOrigin(location.href)) {
  const control = (action) => () => ipcRenderer.invoke("player:control", action);
  contextBridge.exposeInMainWorld(
    "ritePlayer",
    Object.freeze({
      minimize: control("minimize"),
      maximize: control("maximize"),
      fullscreen: control("fullscreen"),
      close: control("close"),
      open: (hash = "") => ipcRenderer.invoke("player:open", String(hash)),
    })
  );
  const mod = ipcRenderer.sendSync("player:module-sync");
  if (mod?.code) {
    const source = `window.__ritePlayer = true;\n((riteModule) => { try {\n${mod.code}\n} catch (error) { console.error("[RITE] reproductor:", error); } })(Object.freeze({ id: "repeticion", player: true, lang: ${JSON.stringify(i18n.getLanguage())} }));\n//# sourceURL=rite-module/reproductor`;
    webFrame.executeJavaScript(source).catch((error) => console.error("[RITE] reproductor:", error));
  } else {
    // A cover over the lobby, with a way out.
    const cover = () => {
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#0b0b10;color:#e9d9a6;font:15px system-ui,sans-serif;text-align:center;-webkit-app-region:drag";
      const inner = document.createElement("div");
      inner.style.cssText = "display:grid;gap:12px;max-width:460px";
      const title = document.createElement("b");
      title.textContent = "RITE Reproductor";
      title.style.cssText = "color:#c8a24a;font-size:20px";
      const text = document.createElement("div");
      text.textContent = tr("Para ver repeticiones necesitas el módulo RITE Repetición (con licencia). Actívalo en el menú del cliente, en Módulos RITE.");
      const close = document.createElement("button");
      close.textContent = tr("Cerrar");
      close.style.cssText = "-webkit-app-region:no-drag;justify-self:center;cursor:pointer;padding:6px 16px;border:1px solid #c8a24a;background:transparent;color:#e9d9a6;border-radius:2px";
      close.onclick = control("close");
      inner.append(title, text, close);
      box.append(inner);
      document.body.append(box);
    };
    if (document.body) cover();
    else addEventListener("DOMContentLoaded", cover, { once: true });
  }
}
