"use strict";

// Floating block-texture picker: shows up in a match when the game is paused
// (ESC) and swaps the textures right away (see live-texture.js). It drags and
// minimizes like the other RITE panels, and remembers where it was.
//
// Options: Kirka's own, RITE Dark, the custom URL from the menu (when there is
// one) and every image in Documentos/RITEClient/texturas.

const PANEL_KEY = "rite-texture-panel";

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { --void: #07060b; --gold: #e0b34a; --gold-2: #f3d48a; --cream: #f4efe4; --mist: #a39886; --line: #3a3324; --red: #d4553f;
    font: 14px/1.4 "Outfit", ui-sans-serif, system-ui, sans-serif; color: var(--cream); }
  .panel[hidden] { display: none; }
  /* Over the game: no blur, it costs frames on every redraw. */
  .panel { position: fixed; z-index: 2147483640; width: 236px; background: rgba(16, 14, 22, .95); border: 1px solid var(--line); border-top: 2px solid var(--gold); border-radius: 2px; box-shadow: 0 18px 40px rgba(0, 0, 0, .45); user-select: none; }
  .panel.min { width: auto; min-width: 150px; }
  .head { display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 12px; cursor: move; }
  .head .t { flex: 1; font: 500 12px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
  .ico { all: unset; cursor: pointer; width: 22px; height: 22px; display: grid; place-items: center; color: var(--mist); font: 15px/1 ui-sans-serif, system-ui, sans-serif; border-radius: 2px; }
  .ico:hover { color: var(--cream); background: rgba(255, 255, 255, .06); }
  .body { padding: 2px 8px 8px; }
  .panel.min .body { display: none; }
  .list { max-height: 46vh; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .opt { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 6px; margin-bottom: 3px; cursor: pointer; background: rgba(7, 6, 11, .45); border: 1px solid transparent; border-left: 2px solid var(--line); border-radius: 2px; }
  .opt:hover { border-color: var(--line); }
  .opt.on { border-color: var(--line); border-left-color: var(--gold); background: rgba(224, 179, 74, .1); }
  .opt img, .opt .sw { width: 30px; height: 30px; flex: none; border-radius: 2px; image-rendering: pixelated; object-fit: cover; background: #222; }
  .opt .sw { display: grid; place-items: center; font: 500 10px "Oswald", sans-serif; color: var(--mist); border: 1px dashed var(--line); }
  .opt span { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .opt.on span { color: var(--gold-2); }
  .foot { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11.5px; color: var(--mist); }
  .foot span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .foot span.err { color: #f0a48f; }
  button.s { all: unset; cursor: pointer; padding: 4px 8px; border: 1px solid var(--gold); border-radius: 2px; color: var(--gold-2); font: 500 10.5px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .14em; text-transform: uppercase; }
  button.s:hover { background: var(--gold); color: var(--void); }
`;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

// Which option the settings point at.
function currentId(settings) {
  if (settings.blockTexture === "file") return settings.blockTextureFile ? `file:${settings.blockTextureFile}` : "kirka";
  if (settings.blockTexture === "custom") return settings.customTextureUrl ? "custom" : "kirka";
  return settings.blockTexture || "kirka";
}

function createTexturePanel({ api, toast, settings: initial, riteDarkThumb }) {
  let settings = initial;
  let files = [];
  let listedAt = 0;
  let status = { text: "", err: false };

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style>`;
  // In English, keeps the panel translated as it changes (src/main/i18n.js).
  require("../../main/i18n").watch(root);
  const panel = el("div", { className: "panel", hidden: true });
  root.append(el("div", { className: "wrap" }, panel));
  document.documentElement.append(host);
  // Clicks must not reach the game (it would grab the pointer back).
  for (const type of ["mousedown", "mouseup", "click", "keydown", "keyup", "keypress", "wheel"]) panel.addEventListener(type, (e) => e.stopPropagation());

  let place = { x: 24, y: 120, min: false };
  try {
    place = { ...place, ...JSON.parse(localStorage.getItem(PANEL_KEY) || "{}") };
  } catch {}
  const savePlace = () => {
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify(place));
    } catch {}
  };
  const clampPlace = () => {
    const w = panel.offsetWidth || 236;
    place.x = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), place.x));
    place.y = Math.max(0, Math.min(window.innerHeight - 36, place.y));
    panel.style.left = `${place.x}px`;
    panel.style.top = `${place.y}px`;
  };
  window.addEventListener("resize", clampPlace);
  panel.addEventListener("mousedown", (e) => {
    if (!e.target.closest?.(".head") || e.target.closest?.("button")) return;
    const start = { mx: e.clientX, my: e.clientY, x: place.x, y: place.y };
    const move = (ev) => {
      place.x = start.x + ev.clientX - start.mx;
      place.y = start.y + ev.clientY - start.my;
      clampPlace();
    };
    const up = () => {
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", up, true);
      savePlace();
    };
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", up, true);
  });

  const options = () => [
    { id: "kirka", label: "Kirka", sw: "KIR" },
    { id: "rite-dark", label: "RITE Dark", thumb: riteDarkThumb },
    settings.customTextureUrl ? { id: "custom", label: "URL del menú", thumb: settings.customTextureUrl } : null,
    ...files.map((f) => ({ id: `file:${f.name}`, label: f.label, thumb: f.thumb, sw: "IMG" })),
  ].filter(Boolean);

  async function pick(id) {
    if (id === currentId(settings)) return;
    status = { text: "Cargando…", err: false };
    draw();
    try {
      if (id.startsWith("file:")) {
        await api.setSetting("blockTextureFile", id.slice(5));
        await api.setSetting("blockTexture", "file");
      } else {
        await api.setSetting("blockTexture", id);
      }
    } catch {
      status = { text: "No se pudo guardar", err: true };
      draw();
    }
  }

  function draw() {
    const on = currentId(settings);
    const list = el("div", { className: "list" });
    for (const o of options()) {
      const thumb = o.thumb ? el("img", { src: o.thumb, alt: "", draggable: false }) : el("div", { className: "sw", textContent: o.sw || "" });
      list.append(el("button", { className: `opt${o.id === on ? " on" : ""}`, title: o.label, onclick: () => pick(o.id) }, thumb, el("span", { textContent: o.label })));
    }
    const head = el(
      "div",
      { className: "head" },
      el("span", { className: "t", textContent: "Texturas" }),
      el("button", { className: "ico", title: place.min ? "Abrir" : "Minimizar", textContent: place.min ? "▢" : "–", onclick: () => ((place.min = !place.min), savePlace(), draw()) }),
      el("button", { className: "ico", title: "Ocultar (vuelve a activarlo en el menú del cliente)", textContent: "✕", onclick: () => api.setSetting("texturePanel", false).then(() => toast.show("Panel de texturas oculto. Actívalo en Tema y texturas.")) }),
    );
    const foot = el(
      "div",
      { className: "foot" },
      el("span", { className: status.err ? "err" : "", textContent: status.text || `${files.length} en tu carpeta` }),
      el("button", { className: "s", title: "Documentos/RITEClient/texturas", textContent: "Carpeta", onclick: () => api.openFolder("textures") }),
      el("button", { className: "s", title: "Volver a leer la carpeta", textContent: "↻", onclick: () => refresh(true) }),
    );
    panel.classList.toggle("min", Boolean(place.min));
    panel.replaceChildren(head, el("div", { className: "body" }, list, foot));
    clampPlace();
  }

  async function refresh(force) {
    if (!force && Date.now() - listedAt < 15000) return;
    listedAt = Date.now();
    try {
      files = (await api.texturesList()) || [];
    } catch {
      files = [];
    }
    if (force) status = { text: "", err: false };
    if (!panel.hidden) draw();
  }

  const inMatch = () => /^\/games\//.test(location.pathname) || Boolean(document.querySelector("#app > .game-interface"));
  function visibility() {
    const show = Boolean(settings.texturePanel) && !document.pointerLockElement && inMatch();
    if (show === !panel.hidden) return;
    panel.hidden = !show;
    if (show) {
      draw();
      refresh(false);
    }
  }
  document.addEventListener("pointerlockchange", visibility);
  setInterval(() => !document.pointerLockElement && visibility(), 1000);

  return {
    update(next) {
      settings = next;
      if (!panel.hidden) draw();
      visibility();
    },
    // Swapped in the match: count of GPU textures, 0 = none yet, -1 = failed.
    applied(count) {
      if (count < 0) status = { text: "No se pudo cargar la imagen", err: true };
      else if (count === 0) status = { text: "Se verá al cargar el mapa", err: false };
      else status = { text: "Aplicada", err: false };
      if (!panel.hidden) draw();
    },
  };
}

module.exports = { createTexturePanel, currentId };
