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
    if (!editor.dragging()) editor.load(settings.hubLayout);
  }

  const editor = window.riteHubEditor.create({
    grid: $("#grid"),
    cells: $("#cells"),
    ghost: $("#ghost"),
    save: (text) => rite.setSetting("hubLayout", text).catch(() => {}),
  });
  const editbar = $("#editbar");
  const editButton = $("#edit");
  function setEditing(on) {
    document.body.classList.toggle("editing", on);
    editbar.hidden = !on;
    editButton.setAttribute("aria-pressed", String(on));
  }
  editButton.addEventListener("click", () => setEditing(!document.body.classList.contains("editing")));
  $("#edit-done").addEventListener("click", () => setEditing(false));
  $("#edit-reset").addEventListener("click", () => editor.preset(window.riteLayout.DEFAULT));
  for (const chip of document.querySelectorAll("[data-preset]")) chip.addEventListener("click", () => editor.preset(chip.dataset.preset));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("editing")) setEditing(false);
  });

  async function play(panel) {
    if (document.body.classList.contains("editing")) return;
    const game = panel.dataset.game;
    lastGame = game;
    if (remember.checked && settings.startGame !== game) rite.setSetting("startGame", game).catch(() => {});
    panel.classList.add("busy");
    try {
      await rite.play(game);
    } finally {
      setTimeout(() => panel.classList.remove("busy"), 1500);
    }
  }

  for (const panel of document.querySelectorAll(".game")) {
    panel.addEventListener("click", () => play(panel));
    panel.addEventListener("keydown", (event) => {
      if (event.target === panel && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        play(panel);
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
    scrims = window.riteScrims.create({
      api: rite.scrims,
      root: $("#scrims"),
      dot: $("#scrims-dot"),
      toast,
      discordUrl,
      getSettings: () => settings,
      setFolded: (text) => rite.setSetting("hubFolded", text).catch(() => {}),
    });
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
