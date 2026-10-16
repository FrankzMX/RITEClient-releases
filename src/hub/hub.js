"use strict";

// The hub page. Everything it needs comes through window.rite (src/preload/hub.js).

(() => {
  const rite = window.rite;
  const $ = (sel) => document.querySelector(sel);
  const remember = $("#remember");
  let settings = {};
  let lastGame = "kirka";

  function applySettings(next) {
    settings = next || {};
    remember.checked = settings.startGame === "kirka" || settings.startGame === "voxarena";
    if (remember.checked) lastGame = settings.startGame;
  }

  for (const button of document.querySelectorAll(".game")) {
    button.addEventListener("click", async () => {
      const game = button.dataset.game;
      lastGame = game;
      if (remember.checked && settings.startGame !== game) rite.setSetting("startGame", game).catch(() => {});
      button.classList.add("busy");
      try {
        await rite.play(game);
      } finally {
        setTimeout(() => button.classList.remove("busy"), 1500);
      }
    });
  }

  remember.addEventListener("change", () => {
    rite.setSetting("startGame", remember.checked ? lastGame : "hub").catch(() => {});
  });

  let toastTimer = null;
  function toast(message, type) {
    const box = $("#toast");
    box.textContent = message;
    box.className = `toast${type === "error" ? " error" : ""}`;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (box.hidden = true), type === "error" ? 7000 : 4500);
  }

  function drawUpdate(state) {
    const box = $("#update");
    box.replaceChildren();
    if (!state || (state.status !== "downloading" && state.status !== "ready")) return (box.hidden = true);
    box.hidden = false;
    if (state.status === "downloading") {
      box.append(`Descargando la versión ${state.version}… ${state.percent || 0}%`);
    } else {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Reiniciar y actualizar";
      btn.addEventListener("click", () => rite.installUpdate());
      box.append(`Versión ${state.version} lista.`, btn);
    }
  }

  let scrims = null;
  let chat = null;
  let scrimsState = { linked: false };
  rite.info().then(({ version, settings: initial, links, update, scrims: initialScrims }) => {
    $("#version").textContent = `RITE Client v${version}`;
    applySettings(initial);
    const nav = $("#links");
    for (const { name, url } of links) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = name;
      btn.addEventListener("click", () => rite.openLink(url));
      nav.append(btn);
    }
    drawUpdate(update);
    const discordUrl = (links.find((l) => /discord/i.test(l.url)) || {}).url || "";
    scrims = window.riteScrims.create({ api: rite.scrims, root: $("#scrims"), dot: $("#scrims-dot"), toast, discordUrl, getSettings: () => settings });
    chat = window.riteChat.create({
      api: rite.chat,
      log: $("#chat-log"),
      form: $("#chat-form"),
      input: $("#chat-text"),
      hint: $("#chat-hint"),
      toast,
      isLinked: () => Boolean(scrimsState.linked && settings.scrimsEnabled),
      hasPlayer: () => Boolean(scrimsState.player),
    });
    applyScrims(initialScrims);
  });
  function applyScrims(state) {
    scrimsState = state || scrimsState;
    scrims?.apply(scrimsState);
    chat?.update();
  }
  rite.onSettings((next) => {
    applySettings(next);
    scrims?.draw();
    chat?.update();
  });
  rite.onUpdate(drawUpdate);
  rite.onScrims(applyScrims);
})();
