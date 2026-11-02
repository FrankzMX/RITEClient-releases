"use strict";

// RITE WEB and Discord buttons in Kirka's lobby. They live in their own shadow
// root, so Kirka re-rendering its UI never removes them, and they hide in game.

const { dataUrl } = require("./assets");

function createLinks({ api, links }) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .bar { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 2147483640; display: none; gap: 6px; align-items: center; }
    .bar.show { display: flex; }
    img { width: 26px; height: 26px; margin-right: 4px; }
    button { all: unset; cursor: pointer; padding: 7px 14px; background: rgba(7, 6, 11, 0.7); border: 1px solid #e0b34a; border-radius: 2px; color: #f3d48a; font: 500 12px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .16em; text-transform: uppercase; transition: background .15s, color .15s; }
    button:hover { background: #e0b34a; color: #07060b; }
  </style><div class="bar"></div>`;
  const bar = root.querySelector(".bar");
  const logo = document.createElement("img");
  logo.src = dataUrl("logo-small.png");
  logo.alt = "RITE";
  bar.append(logo);
  for (const { name, url } of links) {
    const button = document.createElement("button");
    button.textContent = name;
    button.addEventListener("click", () => api.openLink(url));
    bar.append(button);
  }
  document.documentElement.append(host);

  let enabled = false;
  // In the lobby Kirka shows .interface; in a match it shows .game-interface.
  const tick = () => {
    const lobby = !document.pointerLockElement && document.querySelector("#app > .interface") && !document.querySelector("#app > .game-interface");
    bar.classList.toggle("show", Boolean(enabled && lobby));
  };
  // While aiming nothing can change: the bar only shows in the lobby.
  setInterval(() => !document.pointerLockElement && tick(), 1000);
  document.addEventListener("pointerlockchange", tick);

  return {
    update(on) {
      enabled = on;
      tick();
    },
  };
}

module.exports = { createLinks };
