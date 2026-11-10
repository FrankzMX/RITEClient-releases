"use strict";

const { SECTIONS } = require("./menu-schema");
const { dataUrl } = require("./assets");
const { label: scrimLabel } = require("./scrims");
const { scriptKey } = require("./script-options");
const credits = require("../../main/credits");
const i18n = require("../../main/i18n");
const { effectiveSettings } = require("../../main/perf-mode");
const kirkaLight = require("./kirka-light");
const profiles = require("../../main/profiles");
const { kirkaSettings } = require("./perf");
const { KIRKA_SETTINGS, kirkaStorageKey } = require("../../main/perf-stats");

// Choosing a profile also moves the FPS limit to the one that goes with it
// (the player can still change it after): no vsync means no limit.
const { PROFILE_FPS } = profiles;
const BASE_NAMES = { competitive: "Competitivo", pure: "Puro", balanced: "Equilibrado", quality: "Calidad" };
const FPS_NAMES = { 0: "sin límite", auto: "automático (Hz del monitor)" };
// What "modo rendimiento" decides while it is on: the menu shows that, not the
// choice it keeps for later.
const MODE_KEYS = ["performanceProfile", "fpsLimit"];
const { drawCrosshair } = require("./overlay");

// The RITE logo, flat: gold in RITE Client, silver in RITE Light.
const LOGO_FLAT = dataUrl("logo-flat-small.png");
const LOGO_LIGHT = dataUrl("logo-light-small.png");

// One line icon per section (24×24, stroke only). A section without one shows no icon.
const ICONS = {
  performance: '<path d="M3 13a9 9 0 0 1 18 0"/><path d="M12 13l4-5"/>',
  look: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h8"/>',
  clips: '<rect x="3" y="6" width="13" height="12"/><path d="M16 10l5-3v10l-5-3"/>',
  health: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  customization: '<path d="M4 20l6-6M14 4l6 6-8 8-6-6z"/>',
  modules: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  scrims: '<path d="M5 19L19 5M9 5H5v4M15 19h4v-4M5 5l5 5M19 19l-5-5"/>',
  trade: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  client: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
};
// Plain settings rows go together in a box; the rest bring their own layout.
const BOXED = new Set(["toggle", "select", "range", "color", "text", "textarea", "keybind", "buttons", "note", "profiles"]);
// "ShiftRight" → "Shift der." for the close hint in the top bar.
function keyName(code = "") {
  const side = /Right$/.test(code) ? ` ${i18n.tr("der.")}` : /Left$/.test(code) ? ` ${i18n.tr("izq.")}` : "";
  return code.replace(/(Right|Left)$/, "").replace(/^(Key|Digit)/, "").replace("Control", "Ctrl") + side;
}

const CSS = `
  :host { all: initial; }
  .backdrop, select, textarea, input { color-scheme: dark; }
  .backdrop {
    --void: #07060b; --ink: #100e16; --panel: #16131c; --gold: #e0b34a; --gold-2: #f3d48a;
    --cream: #f4efe4; --mist: #a39886; --line: #3a3324; --line-rgb: 58, 51, 36;
    --sans: "Outfit", ui-sans-serif, system-ui, sans-serif; --display: "Oswald", "Arial Narrow", sans-serif;
    position: fixed; inset: 0; z-index: 2147483647; background: rgba(7, 6, 11, .9);
    display: flex; align-items: center; justify-content: center; font: 15px/1.5 var(--sans); color: var(--cream);
    user-select: none; cursor: default;
  }
  input[type="text"], textarea { user-select: text; cursor: text; }
  .backdrop[hidden] { display: none; }
  .panel { position: relative; width: min(900px, 94vw); height: min(620px, 90vh); display: grid; grid-template-columns: 196px 1fr; grid-template-rows: 52px minmax(0, 1fr); background: var(--ink); border: 1px solid var(--line); overflow: hidden; box-shadow: 0 30px 80px #000c; clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%); }
  .panel::after { content: ""; position: absolute; top: 0; right: 0; width: 22px; height: 22px; background: linear-gradient(to bottom left, transparent calc(50% - 1px), var(--gold) calc(50% - 1px), var(--gold) calc(50% + 1px), transparent calc(50% + 1px)); }
  /* Both clients: Koulen for titles, a little relief, sunken inputs, a light top edge. */
  .backdrop { --display: "Koulen", "Oswald", "Arial Narrow", sans-serif; font-synthesis: none; --accent: 224, 179, 74; }
  .backdrop h2 { font-weight: 400; font-size: 34px; letter-spacing: .06em; text-shadow: 0 1px 0 #000, 0 0 18px rgba(var(--accent), .18); }
  .backdrop .bar .name { font-size: 20px; letter-spacing: .3em; text-shadow: 0 1px 0 #000; }
  .backdrop .bar .ver { font: 500 11px/1 var(--sans); letter-spacing: .04em; font-variant-numeric: tabular-nums; }
  .backdrop nav .items button { font-size: 15px; letter-spacing: .15em; text-shadow: 0 1px 0 #000; }
  .backdrop details.group > summary, .backdrop button.btn, .backdrop .foot .links button { font-size: 13px; letter-spacing: .15em; }
  .backdrop .box { border-top-color: rgba(var(--accent), .22); box-shadow: inset 0 1px 0 rgba(var(--accent), .05); }
  .backdrop select, .backdrop input[type="text"], .backdrop textarea { box-shadow: inset 0 2px 4px rgba(0, 0, 0, .5); }
  .backdrop .value { font: 500 14px var(--sans); font-variant-numeric: tabular-nums; }
  /* RITE Light is silver (RITE Client gold, RITE Rust bronze), on the same black. */
  .light { --gold: #b9bec7; --gold-2: #e4e7ec; --mist: #9a9ca3; --line: #34363d; --accent: 200, 206, 214; --void: #070709; --ink: #0e0f12; --panel: #15161a; --cream: #eef0f3; --line-rgb: 52, 54, 61; }
  .light .pop { background: #1a1b20; }
  .light details.group > summary:hover { background: rgba(var(--accent), .05); }
  .light .switch input:checked + span { background: rgba(var(--accent), .14); }
  .light .panel { clip-path: none; }
  .light .panel::after { content: none; }
  .bar { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 0 22px 0 18px; border-bottom: 1px solid var(--line); background: var(--void); }
  .bar img { width: 28px; height: 28px; }
  .bar .name { font: 500 17px/1 var(--display); letter-spacing: .34em; color: var(--cream); text-transform: uppercase; }
  .bar .name b { font-weight: 500; color: var(--gold); }
  .bar .ver { font: 400 11px/1 var(--display); letter-spacing: .14em; color: var(--mist); border: 1px solid var(--line); padding: 4px 7px; }
  .bar .ver:empty { display: none; }
  .bar .close { margin-left: auto; display: flex; align-items: center; gap: 8px; color: var(--mist); font: 400 11px/1 var(--display); letter-spacing: .16em; text-transform: uppercase; }
  .bar .close kbd { font-size: 11px; border-bottom-width: 2px; letter-spacing: 0; text-transform: none; }
  nav { background: rgba(7, 6, 11, .5); border-right: 1px solid var(--line); padding: 10px 0 0; display: flex; flex-direction: column; min-height: 0; }
  nav .items { display: flex; flex-direction: column; gap: 2px; padding: 0 10px; overflow-y: auto; }
  nav .items button { all: unset; position: relative; z-index: 0; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 9px 12px; font: 400 13px/1 var(--display); letter-spacing: .14em; text-transform: uppercase; color: var(--mist); transition: color .12s; }
  nav .items button svg { width: 15px; height: 15px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.6; }
  nav .items button:hover { color: var(--cream); }
  nav .items button[aria-current="true"] { color: var(--void); }
  nav .items button[aria-current="true"]::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--gold); transform: skewX(-10deg); }
  .light nav .items button[aria-current="true"] { color: var(--gold-2); }
  .light nav .items button[aria-current="true"]::before { transform: none; background: rgba(var(--accent), .1); box-shadow: inset 3px 0 0 var(--gold); }
  .foot { margin-top: auto; padding: 12px 16px 14px; border-top: 1px solid var(--line); display: grid; gap: 8px; font-size: 12px; color: var(--mist); position: relative; }
  .foot .by a { color: var(--cream); font-weight: 500; letter-spacing: .08em; cursor: pointer; }
  .foot .links { display: flex; flex-wrap: wrap; gap: 6px 12px; }
  .foot .links button { all: unset; cursor: pointer; white-space: nowrap; color: var(--gold-2); font: 400 11px/1 var(--display); letter-spacing: .14em; text-transform: uppercase; }
  .foot .links button:hover { color: var(--cream); }
  .pop { position: absolute; left: 12px; bottom: calc(100% + 8px); width: 340px; background: #1d1924; border: 1px solid var(--line); border-top: 2px solid var(--gold); padding: 12px 14px; box-shadow: 0 20px 40px #000b; z-index: 5; }
  .pop[hidden] { display: none; }
  .pop h4 { margin: 0 0 8px; font: 400 11px/1 var(--display); letter-spacing: .2em; text-transform: uppercase; color: var(--gold-2); }
  .pop ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }
  .pop li { font-size: 12.5px; color: var(--cream); line-height: 1.35; }
  .pop li a { color: var(--cream); cursor: pointer; }
  .pop li a:hover { color: var(--gold-2); }
  .pop li small { display: block; color: var(--mist); font-size: 11.5px; }
  .pop .lic { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(var(--line-rgb), .6); font-size: 11.5px; color: var(--mist); line-height: 1.5; }
  .pop .lic kbd { font-size: 10.5px; padding: 0 4px; }
  main { overflow-y: auto; padding: 22px 26px; }
  main::-webkit-scrollbar { width: 6px; }
  main::-webkit-scrollbar-thumb { background: var(--line); }
  h2 { margin: 0 0 14px; font: 600 28px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
  h2::before { content: "/ "; color: var(--gold); font-weight: 400; }
  .light h2::before { content: none; }
  .block { margin-bottom: 12px; padding: 0 14px; border: 1px solid rgba(var(--line-rgb), .55); background: rgba(7, 6, 11, .3); }
  .block > .row:last-child { border-bottom: 0; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid rgba(var(--line-rgb), .6); }
  .row label { flex: 1; }
  .hint { display: block; color: var(--mist); font-size: 12.5px; }
  .hint[hidden] { display: none; }
  button.more { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 16px; height: 16px; margin-left: 8px; vertical-align: 1px; border: 1px solid var(--line); border-radius: 50%; color: var(--mist); font: 600 10px/1 var(--sans); transition: color .15s, border-color .15s; }
  button.more:hover, button.more[aria-expanded="true"] { color: var(--gold-2); border-color: var(--gold); }
  details.group { margin: 0 0 12px; border: 1px solid rgba(var(--line-rgb), .55); background: rgba(7, 6, 11, .3); }
  details.group > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; padding: 11px 14px; font: 400 12px/1.2 var(--display); letter-spacing: .2em; text-transform: uppercase; color: var(--gold-2); user-select: none; }
  details.group > summary::-webkit-details-marker { display: none; }
  details.group > summary::before { content: ""; flex: none; width: 6px; height: 6px; border-right: 1.5px solid var(--gold); border-bottom: 1.5px solid var(--gold); transform: rotate(-45deg); transition: transform .15s; }
  details.group[open] > summary::before { transform: rotate(45deg); }
  details.group > summary:hover { background: rgba(224, 179, 74, .05); }
  details.group > summary small { margin-left: auto; font: 12px var(--sans); letter-spacing: 0; text-transform: none; color: var(--mist); }
  .group-body { padding: 0 14px 4px; border-top: 1px solid rgba(var(--line-rgb), .6); }
  .group-body > .row:last-child { border-bottom: 0; }
  .restart { color: var(--gold); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; margin-left: 8px; }
  select, input[type="text"], textarea { background: rgba(7, 6, 11, .6); color: inherit; border: 1px solid var(--line); border-radius: 2px; padding: 7px 10px; font: inherit; font-size: 14px; outline: none; }
  select:focus, input[type="text"]:focus, textarea:focus { border-color: var(--gold); }
  select { max-width: 330px; }
  select:disabled { opacity: .6; cursor: not-allowed; }
  .profiles { flex-wrap: wrap; }
  .profile-list { display: flex; flex-direction: column; gap: 6px; min-width: 300px; }
  .profile { display: flex; align-items: center; gap: 8px; }
  .profile b { flex: 1; font-weight: 500; }
  .profile.on b { color: var(--gold-2); }
  .profile.on b::after { content: " ●"; color: var(--gold); font-size: 10px; }
  .profile.new input { flex: 1; }
  input[type="text"] { width: 100%; box-sizing: border-box; }
  textarea { width: 100%; min-height: 140px; box-sizing: border-box; font: 12px/1.4 ui-monospace, monospace; resize: vertical; }
  input[type="range"] { width: 180px; accent-color: var(--gold); }
  input[type="color"] { width: 44px; height: 28px; border: 1px solid var(--line); border-radius: 2px; background: none; padding: 0; }
  .switch { position: relative; width: 40px; height: 20px; flex: none; }
  .switch input { opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; position: absolute; z-index: 1; }
  .switch span { position: absolute; inset: 0; background: rgba(7, 6, 11, .8); border: 1px solid var(--line); transition: background .15s, border-color .15s; }
  .switch span::after { content: ""; position: absolute; left: 3px; top: 3px; width: 12px; height: 12px; background: var(--mist); transition: transform .2s cubic-bezier(.19, 1, .22, 1), background .15s; }
  .switch input:checked + span { background: rgba(224, 179, 74, .14); border-color: var(--gold); }
  .switch input:checked + span::after { transform: translateX(20px); background: var(--gold-2); }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 0; }
  button.btn { all: unset; cursor: pointer; padding: 8px 14px; border: 1px solid var(--gold); border-radius: 2px; color: var(--gold-2); font: 400 12px/1.2 var(--display); letter-spacing: .14em; text-transform: uppercase; transition: background .15s, color .15s; }
  button.btn:hover { background: var(--gold); color: var(--void); }
  button.btn.danger { border-color: #b4543c; color: #f0a48f; }
  button.btn.danger:hover { background: #b4543c; color: var(--cream); }
  .xh { position: sticky; top: -22px; z-index: 1; margin: 8px -26px 4px; padding: 12px 26px; background: linear-gradient(180deg, var(--panel), rgba(22, 19, 28, .96)); border-bottom: 1px solid var(--line); display: flex; gap: 14px; align-items: stretch; }
  .xh figure { margin: 0; display: grid; gap: 6px; }
  .xh figcaption { font: 400 10.5px/1 var(--display); letter-spacing: .16em; text-transform: uppercase; color: var(--mist); }
  .xh .view { position: relative; width: 220px; height: 120px; border: 1px solid var(--line); border-radius: 2px; overflow: hidden; }
  .xh .view.zoom { width: 120px; }
  .xh canvas { position: absolute; image-rendering: pixelated; }
  .xh .bgs { display: grid; gap: 6px; align-content: start; margin-left: auto; }
  .xh .bgs button { all: unset; cursor: pointer; width: 22px; height: 22px; border: 1px solid var(--line); border-radius: 2px; }
  .xh .bgs button[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
  .value { min-width: 30px; text-align: right; color: var(--gold-2); font: 15px var(--display); }
  .list h3, .credits h3 { font: 400 12px/1 var(--display); color: var(--gold-2); letter-spacing: .28em; text-transform: uppercase; margin: 18px 0 4px; }
  .empty { color: var(--mist); font-size: 13px; padding: 6px 0; }
  .credit { padding: 12px 0; border-bottom: 1px solid rgba(var(--line-rgb), .6); }
  .credit a { color: var(--gold-2); cursor: pointer; text-decoration: none; }
  .credit a:hover { text-decoration: underline; }
  .keys { color: var(--mist); font-size: 13px; margin-top: 18px; line-height: 2; }
  kbd { background: rgba(7, 6, 11, .7); border: 1px solid var(--line); border-radius: 2px; padding: 1px 6px; font: 12px ui-monospace, monospace; color: var(--cream); }
  p { color: var(--cream); }
  .code { font: 500 34px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .3em; color: var(--gold-2); padding: 10px 16px; border: 1px dashed var(--gold); display: inline-block; margin: 6px 0 10px; user-select: all; }
  .scrim-list { margin: 8px 0; padding: 0; list-style: none; }
  .scrim-list li { padding: 6px 10px; border-left: 2px solid var(--gold); background: rgba(7, 6, 11, .45); margin: 4px 0; font-size: 13px; }
  .scrim-list small { color: var(--mist); }
  table.bench { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 6px 0; }
  table.bench th { text-align: left; font: 400 10.5px/1.2 var(--display); letter-spacing: .14em; text-transform: uppercase; color: var(--mist); padding: 6px 6px; border-bottom: 1px solid var(--line); }
  table.bench td { padding: 6px; border-bottom: 1px solid rgba(var(--line-rgb), .6); color: var(--cream); }
  table.bench td.n, table.bench th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.bench tr.best td:first-child { box-shadow: inset 2px 0 0 var(--gold); }
  table.bench tr.best td { color: var(--gold-2); }
`;


// Every text the menu shows goes through i18n.tr(): the Spanish texts of
// this file and of menu-schema.js are also the keys of their English ones.
const TRANSLATED_ATTRS = new Set(["title", "placeholder", "aria-label"]);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "className") el.className = value;
    else if (TRANSLATED_ATTRS.has(key) && typeof value === "string") el.setAttribute(key, i18n.tr(value));
    else if (value !== undefined && value !== false) el.setAttribute(key, value === true ? "" : value);
  }
  setChildren(el, children, false);
  return el;
}

// Replaces the children of `el`. Accepts nested arrays, strings and nodes.
function setChildren(el, children, clear = true) {
  if (clear) el.replaceChildren();
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(i18n.tr(String(child))));
  }
}

// `sections` and `brand`: RITE Light shows a shorter menu (src/main/edition.js).
function createMenu({ api, settings: initial, toast, scrims, scriptsOptions = null, moduleOptions = new Map(), sections = SECTIONS, brand = "Client" }) {
  let settings = initial;
  const setLanguage = () => i18n.setLanguage(i18n.resolveLanguage(settings.language, navigator.language));
  setLanguage();
  let current = sections[0].id;
  let capturingKey = false;
  // What the person opened, so a re-render (a setting changed) keeps it open.
  const openGroups = new Map();
  const openHints = new Set();
  // Crosshair preview: `draft` follows the sliders while they move, before
  // the value is saved.
  let draft = { ...initial };
  const previews = new Set();
  const preview = (key, value) => {
    if (draft[key] === value) return;
    draft = { ...draft, [key]: value };
    for (const redraw of previews) redraw();
  };

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.append(h("style", {}, CSS));
  const light = brand === "Light";
  // The menu's type: Koulen (OFL, assets/fonts), bundled. A font in a
  // shadow root's styles doesn't load, so its @font-face goes in the page.
  if (!document.getElementById("rite-light-font")) {
    const face = document.createElement("style");
    face.id = "rite-light-font";
    // Outfit (the menu's text) too: otherwise it only comes with the RITE
    // theme, which may be off (and is, in Light).
    face.textContent = `@font-face { font-family: "Koulen"; src: url("${dataUrl("fonts/koulen.woff2")}") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "Outfit"; src: url("${dataUrl("fonts/outfit.woff2")}") format("woff2"); font-weight: 200 700; font-style: normal; font-display: swap; }`;
    (document.head || document.documentElement).append(face);
  }
  const navItems = h("div", { className: "items" });
  const version = h("span", { className: "ver" });
  const closeKey = h("kbd");
  const closeText = document.createTextNode("");
  const bar = h(
    "div",
    { className: "bar" },
    h("img", { src: light ? LOGO_LIGHT : LOGO_FLAT, alt: "" }),
    h("div", { className: "name" }, "RITE ", h("b", {}, brand)),
    version,
    h("div", { className: "close" }, closeKey, h("kbd", {}, "Esc"), closeText)
  );
  // «Acerca de» no longer takes a whole page: the author's credit stays in
  // sight (LICENSE, section 7(b)) and the projects open in a small window.
  const creditsButton = h("button", { "aria-expanded": "false" });
  const pop = h("div", { className: "pop", hidden: true });
  const byLine = h("div", { className: "by" });
  const links = h("div", { className: "links" });
  const foot = h("div", { className: "foot" }, byLine, links, pop);
  // The texts of the frame, again on each render so a language change shows at once.
  function fillFrame() {
    closeKey.textContent = keyName(settings.menuKey);
    closeText.textContent = i18n.tr("cerrar");
    creditsButton.textContent = i18n.tr("Créditos");
    setChildren(byLine, ["Creado por ", h("a", { onclick: () => api.openLink(credits.author.url) }, credits.author.name)]);
    setChildren(links, [creditsButton, credits.community.map((c) => h("button", { onclick: () => api.openLink(c.url) }, c.name.replace(/ de RITE$/, "")))]);
    setChildren(pop, [
      h("h4", {}, "Créditos"),
      h(
        "ul",
        {},
        credits.projects.map((p) => h("li", {}, h("a", { onclick: () => api.openLink(p.url) }, p.name), " · ", p.author, h("small", {}, p.note)))
      ),
      h(
        "div",
        { className: "lic" },
        "Software libre bajo licencia GPL-3.0. Toda copia o derivado debe conservar el crédito de ",
        credits.author.name,
        ".",
        h("br"),
        h("kbd", {}, "F2"), " captura · ",
        light ? null : [h("kbd", {}, "F8"), " clip · ", h("kbd", {}, "F9"), " mis clips · "],
        h("kbd", {}, "F4"), " inicio · ", h("kbd", {}, "F5"), " recargar · ",
        h("kbd", {}, "F6"), " abrir enlace del portapapeles · ", h("kbd", {}, "F7"), " copiar enlace · ",
        h("kbd", {}, "F11"), " pantalla completa"
      ),
    ]);
  }
  const showCredits = (open) => {
    pop.hidden = !open;
    creditsButton.setAttribute("aria-expanded", String(open));
  };
  creditsButton.addEventListener("click", () => showCredits(pop.hidden));
  const nav = h("nav", {}, navItems, foot);
  const main = h("main");
  const backdrop = h("div", { className: `backdrop${light ? " light" : ""}`, hidden: true }, h("div", { className: "panel" }, bar, nav, main));
  backdrop.addEventListener("mousedown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== creditsButton) showCredits(false);
  });
  api.getInfo?.().then((info) => (version.textContent = info?.version ? `v${info.version}` : ""), () => {});
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) toggle(false);
  });
  root.append(backdrop);
  document.documentElement.append(host);
  // Lives in the page (scripts look it up by id) and shows inside the menu.
  if (scriptsOptions) {
    scriptsOptions.slot = "scripts";
    scriptsOptions.style.cssText = "display:block;color:#f4efe4;font:13px/1.5 Outfit, ui-sans-serif, system-ui, sans-serif;";
    host.append(scriptsOptions);
  }
  for (const [id, box] of moduleOptions) {
    box.slot = `mod-${id}`;
    box.style.cssText = "display:block;color:#f4efe4;font:13px/1.5 Outfit, ui-sans-serif, system-ui, sans-serif;";
    host.append(box);
  }

  // Keep keystrokes typed in the menu away from the game.
  for (const type of ["keydown", "keyup", "keypress"]) {
    backdrop.addEventListener(type, (e) => e.stopPropagation());
  }

  async function save(key, value, restart, reload) {
    preview(key, value);
    const result = await api.setSetting(key, value);
    if (!result.ok) {
      toast.show("Valor no válido", "error");
      render();
      return;
    }
    settings = { ...settings, [key]: value };
    if (key === "performanceProfile" && PROFILE_FPS[value] && settings.fpsLimit !== PROFILE_FPS[value]) {
      const fps = PROFILE_FPS[value];
      if ((await api.setSetting("fpsLimit", fps)).ok) settings = { ...settings, fpsLimit: fps };
      render();
      toast.show(`Límite de FPS: ${FPS_NAMES[fps] || fps}. Se aplicará al reiniciar el cliente`);
      return;
    }
    if (key === "performanceMode") {
      const changed = value ? kirkaLight.applyLight(localStorage) : kirkaLight.restore(localStorage);
      render();
      if (changed) {
        toast.show(value ? "Modo rendimiento: Kirka sin sombras, marcas de bala ni casquillos y a 100 %. Recarga con F5; el perfil y los FPS, al reiniciar" : "Te regresé tus ajustes de Kirka (recarga con F5). El perfil y los FPS vuelven al reiniciar");
        return;
      }
    }
    if (key === "language") {
      settings = { ...settings, [key]: value };
      render();
      return;
    }
    if (result.restart || restart) toast.show("Se aplicará al reiniciar el cliente");
    else if (reload) toast.show("Se aplicará al recargar (F5)");
    // Show or hide the options that depend on this one right away.
    const before = visibility();
    settings = { ...settings, [key]: value };
    if (visibility() !== before) render();
  }

  const shown = (item) => !item.when || item.when(settings);
  // Which items of the current section are showing, as a string to compare.
  function visibility() {
    const walk = (items) => items.map((item) => (shown(item) ? `1${item.items ? walk(item.items) : ""}` : "0")).join("");
    return walk(sections.find((s) => s.id === current).items);
  }
  // What a script put in #scripts-options, sorted per script (script-options.js).
  // `key` null = the loose nodes no script could be matched to.
  const scriptBox = (key) =>
    scriptsOptions ? [...scriptsOptions.children].find((c) => (key ? c.dataset.riteScript === key : !c.dataset.riteScript)) : null;
  const hasScriptOptions = (key) =>
    scriptsOptions ? (key ? Boolean(scriptBox(key)?.childElementCount) : [...scriptsOptions.children].some((c) => !c.dataset.riteScript)) : false;
  // Shows only that script's options inside the «scripts» slot.
  function scriptOptionsSlot(key) {
    for (const child of scriptsOptions.children) child.hidden = key ? child.dataset.riteScript !== key : Boolean(child.dataset.riteScript);
    return h("slot", { name: "scripts" });
  }
  const optionsButton = (onclick) => h("button", { className: "btn", style: "margin-right:12px", onclick }, "Opciones");
  const renderItems = (items) => items.filter(shown).map((item) => renderers[item.type](item));
  // Like renderItems, with each run of plain rows inside one box.
  function boxed(items) {
    const out = [];
    let box = null;
    for (const item of items.filter(shown)) {
      if (!BOXED.has(item.type)) {
        box = null;
        out.push(renderers[item.type](item));
        continue;
      }
      if (!box) out.push((box = h("div", { className: "block" })));
      box.append(renderers[item.type](item));
    }
    return out;
  }

  const actions = {
    "open-swapper": () => api.openFolder("swapper"),
    "open-textures": () => api.openFolder("textures"),
    "open-scripts": () => api.openFolder("scripts"),
    "open-styles": () => api.openFolder("styles"),
    "open-screenshots": () => api.openFolder("screenshots"),
    "open-clips": () => api.openFolder("clips"),
    "clips-viewer": () => api.openClips(),
    "open-maps": () => api.openFolder("maps"),
    "open-editor-backups": () => api.openFolder("editorBackups"),
    "reload-swapper": async () => toast.show(`Swapper: ${await api.reloadSwapper()} archivo(s) activos`),
    export: async () => (await api.exportSettings()) && toast.show("Ajustes exportados"),
    import: async () => {
      try {
        if (await api.importSettings()) toast.show("Ajustes importados");
      } catch {
        toast.show("El archivo no es válido", "error");
      }
    },
    restart: () => api.restart(),
    hub: () => api.hub(),
    // RITE Light only (src/main/light-import.js).
    "import-full": async () => {
      const { taken, found } = (await api.importFull?.()) || {};
      if (!found) return toast.show("No encontré RITE Client en esta PC", "error");
      toast.show(taken ? `Traje ${taken} ajuste(s) de RITE Client. Los que piden reinicio, al reiniciar` : "Ya tienes los mismos ajustes que en RITE Client");
    },
    reset: () => {
      if (confirm(i18n.tr("¿Restablecer todos los ajustes de RITE Client? El cliente se reiniciará."))) api.resetSettings();
    },
  };

  // Short hints show under the label; long ones open with the "?" next to it.
  const LONG_HINT = 80;
  function label(item) {
    const id = item.key || item.label;
    const long = item.hint && item.hint.length > LONG_HINT;
    const hint = item.hint ? h("span", { className: "hint", hidden: long && !openHints.has(id) }, item.hint) : null;
    const more = long
      ? h(
          "button",
          {
            className: "more",
            title: "Más información",
            "aria-expanded": String(openHints.has(id)),
            onclick: (e) => {
              e.preventDefault();
              if (openHints.has(id)) openHints.delete(id);
              else openHints.add(id);
              hint.hidden = !openHints.has(id);
              more.setAttribute("aria-expanded", String(openHints.has(id)));
            },
          },
          "?"
        )
      : null;
    return h(
      "label",
      {},
      item.label,
      more,
      item.restart ? h("span", { className: "restart" }, "requiere reinicio") : null,
      item.reload ? h("span", { className: "restart" }, "recarga con F5") : null,
      hint
    );
  }

  const renderers = {
    // A block that starts closed; its items are built only once it is opened.
    group: (item) => {
      const id = `${current}:${item.title}`;
      const open = openGroups.has(id) ? openGroups.get(id) : Boolean(item.open);
      const body = h("div", { className: "group-body" });
      const fill = () => setChildren(body, renderItems(item.items));
      const details = h("details", { className: "group", open }, h("summary", {}, item.title, item.summary ? h("small", {}, item.summary) : null), body);
      if (open) fill();
      details.addEventListener("toggle", () => {
        openGroups.set(id, details.open);
        if (details.open && !body.childElementCount) fill();
      });
      return details;
    },
    toggle: (item) =>
      h(
        "div",
        { className: "row" },
        label(item),
        h(
          "div",
          { className: "switch" },
          h("input", {
            type: "checkbox",
            checked: settings[item.key],
            onchange: (e) => save(item.key, e.target.checked, item.restart, item.reload),
          }),
          h("span")
        )
      ),
    select: (item) => {
      const locked = settings.performanceMode && MODE_KEYS.includes(item.key);
      const shown = locked ? effectiveSettings(settings)[item.key] : settings[item.key];
      const select = h(
        "select",
        { disabled: locked, title: locked ? "Lo decide el modo rendimiento mientras está prendido" : undefined, onchange: (e) => save(item.key, e.target.value, item.restart, item.reload) },
        item.options.map(([value, text]) => h("option", { value, selected: shown === value }, text))
      );
      return h("div", { className: "row" }, label(locked ? { ...item, hint: `${item.hint ? `${item.hint} ` : ""}Ahora lo decide el modo rendimiento.` } : item), select);
    },
    range: (item) => {
      const value = h("span", { className: "value" }, settings[item.key]);
      const input = h("input", {
        type: "range",
        min: item.min,
        max: item.max,
        value: settings[item.key],
        oninput: (e) => {
          value.textContent = e.target.value;
          preview(item.key, Number(e.target.value));
        },
        onchange: (e) => save(item.key, Number(e.target.value)),
      });
      return h("div", { className: "row" }, label(item), input, value);
    },
    color: (item) =>
      h(
        "div",
        { className: "row" },
        label(item),
        h("input", {
          type: "color",
          value: settings[item.key],
          oninput: (e) => preview(item.key, e.target.value),
          onchange: (e) => save(item.key, e.target.value),
        })
      ),
    crosshairPreview: () => crosshairPreview(),
    text: (item) => {
      const input = h("input", { type: "text", spellcheck: "false", placeholder: item.placeholder });
      input.value = settings[item.key];
      const apply = h("button", { className: "btn", onclick: () => save(item.key, input.value.trim(), item.restart, item.reload) }, "Aplicar");
      return h("div", { className: "row" }, h("div", { style: "flex: 1; display: grid; gap: 8px" }, label(item), input), apply);
    },
    textarea: (item) => {
      const area = h("textarea", { spellcheck: "false" });
      area.value = settings[item.key];
      const apply = h("button", { className: "btn", onclick: () => save(item.key, area.value) }, "Aplicar");
      return h("div", {}, h("div", { className: "row" }, label(item), apply), area);
    },
    keybind: (item) => {
      const button = h("button", { className: "btn" }, keyName(settings[item.key]));
      button.addEventListener("click", () => {
        capturingKey = true;
        button.textContent = "Pulsa una tecla…";
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener("keydown", onKey, true);
          capturingKey = false;
          if (e.code !== "Escape") save(item.key, e.code);
          button.textContent = keyName(e.code === "Escape" ? settings[item.key] : e.code);
        };
        window.addEventListener("keydown", onKey, true);
      });
      return h("div", { className: "row" }, label(item), button);
    },
    buttons: (item) =>
      h(
        "div",
        { className: "buttons" },
        item.buttons.map(([text, action]) =>
          h("button", { className: `btn ${action === "reset" ? "danger" : ""}`, onclick: actions[action] }, text)
        )
      ),
    note: (item) => h("p", { className: "hint" }, item.text),
    // "Mis perfiles": save everything as it is under a name, put it back in one click.
    profiles: () => {
      const list = profiles.parseProfiles(settings.savedProfiles);
      const active = profiles.activeName(settings, kirkaSettings(), list, BASE_NAMES);
      const apply = async (p) => {
        for (const [key, value] of Object.entries(p.settings)) {
          const r = await api.setSetting(key, value);
          if (r.ok) settings = { ...settings, [key]: value };
        }
        for (const [name, value] of Object.entries(p.kirka || {})) {
          try {
            localStorage.setItem(kirkaStorageKey(KIRKA_SETTINGS[name]), JSON.stringify(value));
          } catch {}
        }
        // The profile says what Kirka has: an old backup of the mode no longer applies.
        try {
          localStorage.removeItem(kirkaLight.BACKUP_KEY);
        } catch {}
        render();
        toast.show(`Perfil «${p.name}» puesto. Lo de Kirka con F5; el perfil de GPU y los FPS al reiniciar`);
      };
      const store = async (text, message) => {
        const r = await api.setSetting("savedProfiles", text);
        if (!r.ok) return toast.show("No se pudo guardar", "error");
        settings = { ...settings, savedProfiles: text };
        render();
        if (message) toast.show(message);
      };
      const name = h("input", { type: "text", placeholder: "Nombre (ej. Torneo, Escuela)", maxlength: profiles.cleanName("x".repeat(99)).length });
      const saveBtn = h("button", { className: "btn", onclick: () => {
        const n = profiles.cleanName(name.value);
        if (!n) return toast.show("Ponle un nombre", "error");
        const p = profiles.snapshot(n, settings, kirkaSettings());
        if (!p) return toast.show("No se pudo guardar", "error");
        store(profiles.save(settings.savedProfiles, p), `Guardado «${n}»: perfil, backend, FPS, prioridad, modo rendimiento y gráficos de Kirka`);
      } }, "Guardar");
      return h(
        "div",
        { className: "row profiles" },
        h("label", {}, "Mis perfiles", h("span", { className: "restart" }, `ahora: ${active}`), h("span", { className: "hint" }, "Guarda todo como lo tienes (perfil, backend, límite de FPS, prioridad, modo rendimiento y los gráficos de Kirka) y regrésalo con un clic. Si cambias algo, queda como «Personalizado».")),
        h(
          "div",
          { className: "profile-list" },
          list.map((p) =>
            h(
              "div",
              { className: `profile${p.name === active ? " on" : ""}` },
              h("b", {}, p.name),
              h("button", { className: "btn", onclick: () => apply(p) }, "Poner"),
              h("button", { className: "btn danger", title: "Borrar", onclick: () => confirm(i18n.tr("¿Borrar el perfil «{name}»?", { name: p.name })) && store(profiles.remove(settings.savedProfiles, p.name)) }, "✕")
            )
          ),
          list.length < profiles.MAX_PROFILES ? h("div", { className: "profile new" }, name, saveBtn) : h("p", { className: "hint" }, `Máximo ${profiles.MAX_PROFILES} perfiles.`)
        )
      );
    },
    modules: () => {
      const box = h("div", { className: "list" }, h("div", { className: "empty" }, "Cargando…"));
      const TYPES = { visual: "visual", utilidad: "utilidad", info: "info de partida" };
      // Only the module's own box (riteModule.options()): the options of other
      // scripts stay in Personalización and never show up here.
      const optionsOf = (id) => moduleOptions.get(id)?.childElementCount || hasScriptOptions(scriptKey({ module: id }));
      let last = null;
      const showOptions = (m) =>
        setChildren(box, [
          h("div", { className: "buttons" }, h("button", { className: "btn", onclick: () => fill(last) }, "← Volver a los módulos")),
          h("h3", {}, `Opciones de ${m.name}`),
          optionsOf(m.id)
            ? [
                moduleOptions.get(m.id)?.childElementCount ? h("slot", { name: `mod-${m.id}` }) : null,
                hasScriptOptions(scriptKey({ module: m.id })) ? scriptOptionsSlot(scriptKey({ module: m.id })) : null,
              ]
            : h("div", { className: "empty" }, "Este módulo no tiene opciones."),
        ]);
      const fill = (data) => {
        last = data;
        const { modules, status } = data;
        const toggle = (id, on) => {
          const list = new Set(settings.remoteModulesOff);
          if (on) list.delete(id);
          else list.add(id);
          save("remoteModulesOff", [...list], false, true);
        };
        const when = status.checkedAt ? new Date(status.checkedAt).toLocaleTimeString() : "todavía no";
        const rows = modules.length
          ? modules.map((m) =>
              h(
                "div",
                { className: "row" },
                h(
                  "label",
                  {},
                  `${m.name} ${m.version}`,
                  h(
                    "span",
                    { className: "hint" },
                    [
                      m.privado && i18n.tr("con tu licencia"),
                      m.description,
                      TYPES[m.type] && i18n.tr(TYPES[m.type]),
                      m.author && i18n.tr("por {name}", { name: m.author }),
                      !m.compatible && i18n.tr("necesita una versión más nueva del cliente"),
                      m.compatible && !m.ready && i18n.tr("descargando…"),
                      m.changes && i18n.tr("Cambios: {changes}", { changes: m.changes }),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  )
                ),
                m.enabled && optionsOf(m.id) ? optionsButton(() => showOptions(m)) : null,
                h("div", { className: "switch" }, h("input", { type: "checkbox", checked: m.enabled, onchange: (e) => toggle(m.id, e.target.checked) }), h("span"))
              )
            )
          : h("div", { className: "empty" }, status.available ? "No hay módulos publicados ahora." : "Esta versión del cliente no trae módulos RITE.");
        // The license of this PC: private modules RITE hands out to whom it wants.
        const lic = status.licencia;
        const license = () => {
          if (!lic || !lic.available) return null;
          if (lic.activa) {
            const count = modules.filter((m) => m.privado).length;
            return [
              h("h3", {}, "Licencia"),
              h(
                "p",
                { className: "hint" },
                `${i18n.tr("Activa en esta PC")}${lic.nombre ? i18n.tr(" como «{name}»", { name: lic.nombre }) : ""} · ${i18n.tr("{n} módulo(s) con licencia", { n: count })}${lic.enGracia ? ` · ${i18n.tr("sin contacto con el servidor desde hace más de un día: los módulos con licencia están en pausa")}` : lic.message ? ` · ${lic.message}` : ""}. `,
                h(
                  "button",
                  { className: "btn danger", onclick: async () => confirm(i18n.tr("¿Quitar la licencia de esta PC? Para volver a usarla, RITE tiene que liberarla.")) && (await api.licenseRemove(), fill(await api.modulesList())) },
                  "Quitar licencia"
                )
              ),
            ];
          }
          const input = h("input", { type: "text", spellcheck: "false", placeholder: "RITE-XXXX-XXXX-XXXX", style: "max-width:260px" });
          const activate = async () => {
            const r = await api.licenseActivate(input.value);
            if (r.ok) {
              toast.show(`Licencia activada${r.nombre ? ` como ${r.nombre}` : ""}. Recarga (F5) para cargar tus módulos`);
              fill(await api.modulesList());
            } else toast.show(r.message || "No se pudo activar la licencia", "error");
          };
          input.addEventListener("keydown", (e) => e.key === "Enter" && activate());
          return [
            h("h3", {}, "Licencia"),
            h("p", { className: "hint" }, `${i18n.tr("Si RITE te dio una licencia, pégala aquí: queda ligada a esta PC y te trae sus módulos.")}${lic.message ? ` (${lic.message})` : ""}`),
            h("div", { className: "row" }, input, h("button", { className: "btn", onclick: activate }, "Activar")),
          ];
        };
        setChildren(box, [
          rows,
          status.available
            ? h(
                "p",
                { className: "hint" },
                `Última revisión: ${when}${status.error ? ` (${status.error})` : ""}. `,
                h("button", { className: "btn", onclick: async () => (fill(await api.modulesCheck()), toast.show("Lista de módulos revisada")) }, "Buscar ahora")
              )
            : null,
          license(),
        ]);
      };
      api.modulesList().then(fill).catch(() => setChildren(box, [h("div", { className: "empty" }, "No se pudo leer la lista de módulos.")]));
      return box;
    },
    customizations: () => {
      const box = h("div", { className: "list" }, h("div", { className: "empty" }, "Cargando…"));
      let last = null;
      const showOptions = (name, key) =>
        setChildren(box, [
          h("div", { className: "buttons" }, h("button", { className: "btn", onclick: () => fill(last) }, "← Volver a los scripts")),
          h("h3", {}, `Opciones de ${name}`),
          scriptOptionsSlot(key),
        ]);
      const fill = (data) => {
        last = data;
        const { scripts, styles } = data;
        const toggleIn = (key, name, on) => {
          const list = new Set(settings[key]);
          if (on) list.add(name);
          else list.delete(name);
          save(key, [...list], true);
        };
        const rows = (items, key) =>
          items.length
            ? items.map((item) =>
                h(
                  "div",
                  { className: "row" },
                  h(
                    "label",
                    {},
                    item.name,
                    item.description || item.author
                      ? h("span", { className: "hint" }, [item.description, item.author && i18n.tr("por {name}", { name: item.author })].filter(Boolean).join(" · "))
                      : null
                  ),
                  key === "enabledScripts" && item.enabled && hasScriptOptions(scriptKey({ name: item.file }))
                    ? optionsButton(() => showOptions(item.name, scriptKey({ name: item.file })))
                    : null,
                  h(
                    "div",
                    { className: "switch" },
                    h("input", { type: "checkbox", checked: item.enabled, onchange: (e) => toggleIn(key, item.file, e.target.checked) }),
                    h("span")
                  )
                )
              )
            : h("div", { className: "empty" }, "No hay archivos en la carpeta.");
        setChildren(box, [
          h("h3", {}, "Scripts"),
          rows(scripts, "enabledScripts"),
          h("h3", {}, "Estilos"),
          rows(styles, "enabledStyles"),
          // Options no script could be matched to (added from code the script injected).
          hasScriptOptions(null)
            ? h("div", { className: "row" }, h("label", {}, "Otras opciones de scripts"), optionsButton(() => showOptions("otros scripts", null)))
            : null,
        ]);
      };
      api.listCustomizations().then(fill);
      return box;
    },
    scrims: () => {
      const s = scrims?.state || { status: "off" };
      const pair = async () => {
        try {
          await api.scrimsPair();
        } catch {
          toast.show("No se pudo conectar con RITE WEB", "error");
        }
        render();
      };
      const discord = () => api.openLink(credits.community.find((c) => /discord/i.test(c.url)).url);
      const box = (...children) => h("div", { className: "credits" }, ...children);
      if (!settings.scrimsEnabled || s.status === "off") return box(h("p", {}, "Activa Scrims RITE para ver las colas y tu partida."));
      if (s.status === "unlinked")
        return box(
          h("p", {}, "Liga el cliente con tu Discord para ver las colas de RITE en vivo, confirmar ¡Listo! desde aquí y entrar a la sala de tu partida con un clic."),
          h("div", { className: "buttons" }, h("button", { className: "btn", onclick: pair }, "Vincular con Discord"))
        );
      if (!s.linked) {
        const mins = s.expiresAt ? Math.max(1, Math.round((new Date(s.expiresAt).getTime() - Date.now()) / 60000)) : null;
        return box(
          h("p", {}, "En el Discord de RITE escribe este comando:"),
          h("div", { className: "code" }, s.code || "······"),
          h("p", {}, h("kbd", {}, `/cliente vincular codigo:${s.code || ""}`), mins ? ` · vence en ${mins} min` : ""),
          h(
            "div",
            { className: "buttons" },
            h("button", { className: "btn", onclick: discord }, "Abrir Discord de RITE"),
            h("button", { className: "btn danger", onclick: async () => (await api.scrimsUnlink(), render()) }, "Cancelar")
          )
        );
      }
      const m = s.me?.match;
      return box(
        h("p", {}, s.player ? `Ligado como ${s.player.name}.` : "Ligado. Regístrate desde el panel de colas (o con /registro en Discord) para entrar a las colas."),
        s.offline ? h("p", { className: "hint" }, "Sin conexión con RITE WEB, reintentando…") : null,
        m ? h("h3", {}, `Tu partida #${m.id}`) : null,
        m ? h("ul", { className: "scrim-list" }, h("li", {}, `${scrimLabel(m.game, m.mode)}${m.map ? ` · ${m.map}` : ""} · `, h("small", {}, m.roomUrl ? "sala lista" : "esperando la sala"))) : null,
        h("h3", {}, "Colas en vivo"),
        s.queues?.length
          ? h("ul", { className: "scrim-list" }, s.queues.map((q) => h("li", {}, `${scrimLabel(q.game, q.mode)} · ${Math.min(q.players.length, q.need)}/${q.need} `, h("small", {}, q.players.join(", ")))))
          : h("p", { className: "hint" }, "No hay nadie en cola ahora. Entra desde #rite-cola en Discord."),
        h(
          "div",
          { className: "buttons" },
          h("button", { className: "btn", onclick: discord }, "Abrir Discord de RITE"),
          h("button", { className: "btn danger", onclick: async () => (await api.scrimsUnlink(), render()) }, "Desvincular")
        )
      );
    },
    // RITE Bench (src/main/perf-stats.js): the matches measured, by configuration.
    perf: () => {
      const box = h("div", { className: "credits" }, h("div", { className: "empty" }, "Cargando mediciones…"));
      const KIND = { Tab: "Páginas (juego, hub)", GPU: "GPU", Browser: "Principal", Utility: "Red y audio" };
      const num = (v, unit = "") => (v === null || v === undefined ? "–" : `${v}${unit}`);
      const fill = async () => {
        let data;
        try {
          data = await api.perfList();
        } catch {
          setChildren(box, h("div", { className: "empty" }, "No se pudieron leer las mediciones."));
          return;
        }
        const { compare, sessions, running, metrics } = data;
        const types = Object.entries(metrics?.byType || {})
          .sort((a, b) => b[1].ramMB - a[1].ramMB)
          .map(([type, t]) => `${KIND[type] || type} ${t.ramMB} MB`)
          .join(" · ");
        const head = (...cols) => h("tr", {}, cols.map(([text, n]) => h("th", { className: n ? "n" : "" }, text)));
        setChildren(box, [
          h("h3", {}, "Ahora"),
          h("p", { className: "hint" }, `Corriendo con: ${running}. Cliente: ${num(metrics?.ramMB, " MB")} de RAM, ${num(metrics?.cpu, " %")} de CPU (100 % = un núcleo).`),
          types ? h("p", { className: "hint" }, types) : null,
          h("h3", {}, "Comparación por ajustes"),
          compare.length
            ? h(
                "table",
                { className: "bench" },
                head(["Ajustes"], ["Partidas", 1], ["FPS", 1], ["1 % lento", 1], ["0,1 % lento", 1], ["Tirones/min", 1], ["RAM", 1]),
                compare.map((row, i) =>
                  h(
                    "tr",
                    { className: i === 0 && compare.length > 1 && row.matches >= 2 ? "best" : "" },
                    h("td", {}, row.label),
                    h("td", { className: "n" }, `${row.matches} · ${Math.round(row.minutes)} min`),
                    h("td", { className: "n" }, num(row.fps)),
                    h("td", { className: "n" }, num(row.low1)),
                    h("td", { className: "n" }, num(row.low01)),
                    h("td", { className: "n" }, num(row.hitchesPerMin)),
                    h("td", { className: "n" }, num(row.ramMB, " MB"))
                  )
                )
              )
            : h("div", { className: "empty" }, settings.perfStats ? "Todavía no hay partidas medidas. Juega una de al menos 30 s y aparece aquí." : "RITE Bench está apagado."),
          compare.length
            ? h("p", { className: "hint" }, "Juega 2 o 3 partidas con cada perfil, backend o límite de FPS y compara. Arriba queda la que menos tirones da (el 1 % más lento más alto).")
            : null,
          sessions.length ? h("h3", {}, "Últimas partidas") : null,
          sessions.length
            ? h(
                "table",
                { className: "bench" },
                head(["Cuándo"], ["Duración", 1], ["FPS", 1], ["1 % lento", 1], ["Tirones", 1], ["Peor cuadro", 1]),
                sessions.slice(0, 5).map((s) =>
                  h(
                    "tr",
                    {},
                    h("td", {}, new Date(s.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })),
                    h("td", { className: "n" }, `${Math.round(s.result.seconds / 60)} min`),
                    h("td", { className: "n" }, num(s.result.fps)),
                    h("td", { className: "n" }, num(s.result.low1)),
                    h("td", { className: "n" }, num(s.result.hitches)),
                    h("td", { className: "n" }, num(s.result.worstMs, " ms"))
                  )
                )
              )
            : null,
          h(
            "div",
            { className: "buttons" },
            h("button", { className: "btn", onclick: () => api.openFolder("performance") }, "Abrir carpeta"),
            h("button", { className: "btn", onclick: fill }, "Actualizar"),
            h(
              "button",
              {
                className: "btn danger",
                onclick: async () => {
                  if (!confirm(i18n.tr("¿Borrar todas las mediciones de RITE Bench?"))) return;
                  await api.perfClear();
                  fill();
                },
              },
              "Borrar mediciones"
            )
          ),
        ]);
      };
      fill();
      return box;
    },
    about: () => {
      const box = h("div", { className: "credits" }, h("div", { className: "empty" }, "Cargando…"));
      api.getInfo().then(({ version, credits, light }) => {
        setChildren(box, [
          h("p", {}, light
            ? `RITE Light v${version}. La versión ligera de RITE Client: solo lo necesario para competir en Kirka.io. Software libre bajo licencia GPL-3.0.`
            : `RITE Client v${version}. Cliente de Kirka.io para la comunidad competitiva de RITE. Software libre bajo licencia GPL-3.0.`),
          h("p", {}, "Creado por ", h("a", { onclick: () => api.openLink(credits.author.url) }, credits.author.name), ". Toda copia o derivado debe conservar este crédito."),
          h("h3", {}, "Comunidad RITE"),
          h("div", { className: "buttons" }, credits.community.map((c) => h("button", { className: "btn", onclick: () => api.openLink(c.url) }, c.name))),
          h("h3", {}, "Créditos"),
          credits.projects.map((p) =>
            h(
              "div",
              { className: "credit" },
              h("a", { onclick: () => api.openLink(p.url) }, p.name),
              ` · ${p.author}`,
              h("span", { className: "hint" }, p.note)
            )
          ),
          h(
            "div",
            { className: "keys" },
            h("kbd", {}, "F2"), " captura · ",
            light ? null : [h("kbd", {}, "F8"), " clip · ", h("kbd", {}, "F9"), " mis clips · "],
            h("kbd", {}, "F4"), " inicio · ",
            h("kbd", {}, "F5"), " recargar · ",
            h("kbd", {}, "F6"), " abrir enlace del portapapeles · ",
            h("kbd", {}, "F7"), " copiar enlace · ",
            h("kbd", {}, "F11"), " pantalla completa"
          ),
        ]);
      });
      return box;
    },
  };

  // Backgrounds to try the crosshair on: Kirka's dark maps, sky and snow.
  const PREVIEW_BGS = [
    ["Oscuro", "linear-gradient(180deg, #2a2f38, #15171c)"],
    ["Cielo", "linear-gradient(180deg, #8fc6ef, #4f8fc4 70%, #5d7a3a 70%)"],
    ["Claro", "linear-gradient(180deg, #f2f2ee, #c9ccc4)"],
  ];
  let previewBg = 0;

  // Same drawing as in game: "Tamaño real" in screen pixels, "Zoom" with the
  // pixels enlarged so a 1 px dot can be seen.
  function crosshairPreview() {
    const real = h("div", { className: "view" });
    const zoom = h("div", { className: "view zoom" });
    const source = document.createElement("canvas");
    const realCanvas = h("canvas");
    const zoomCanvas = h("canvas");
    real.append(realCanvas);
    zoom.append(zoomCanvas);
    const paintBg = () => {
      for (const view of [real, zoom]) view.style.background = PREVIEW_BGS[previewBg][1];
    };
    const bgButtons = PREVIEW_BGS.map(([name, bg], i) =>
      h("button", {
        title: name,
        "aria-label": `Fondo ${name.toLowerCase()}`,
        "aria-pressed": i === previewBg ? "true" : "false",
        style: `background: ${bg}`,
        onclick: () => {
          previewBg = i;
          bgButtons.forEach((b, j) => b.setAttribute("aria-pressed", j === i ? "true" : "false"));
          paintBg();
        },
      })
    );
    paintBg();

    const redraw = () => {
      if (!real.isConnected) {
        previews.delete(redraw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      drawCrosshair(source.getContext("2d"), draft, dpr);
      // Real size, centered on a whole screen pixel so it is not resampled.
      realCanvas.width = source.width;
      realCanvas.height = source.height;
      realCanvas.getContext("2d").drawImage(source, 0, 0);
      realCanvas.style.width = `${source.width / dpr}px`;
      realCanvas.style.height = `${source.height / dpr}px`;
      const box = real.getBoundingClientRect();
      const left = Math.round(box.left * dpr + 1 + (real.clientWidth * dpr - source.width) / 2) / dpr - box.left - 1;
      const top = Math.round(box.top * dpr + 1 + (real.clientHeight * dpr - source.height) / 2) / dpr - box.top - 1;
      realCanvas.style.left = `${left}px`;
      realCanvas.style.top = `${top}px`;
      // Zoom: each screen pixel becomes a z×z block, with a faint grid.
      const w = Math.round(zoom.clientWidth * dpr);
      const hgt = Math.round(zoom.clientHeight * dpr);
      const z = Math.max(2, Math.min(12, Math.floor(Math.min(w, hgt) / source.width)));
      zoomCanvas.width = w;
      zoomCanvas.height = hgt;
      zoomCanvas.style.width = `${w / dpr}px`;
      zoomCanvas.style.height = `${hgt / dpr}px`;
      zoomCanvas.style.left = "0";
      zoomCanvas.style.top = "0";
      const zc = zoomCanvas.getContext("2d");
      zc.imageSmoothingEnabled = false;
      const dx = Math.round(w / 2 - (source.width / 2) * z);
      const dy = Math.round(hgt / 2 - (source.height / 2) * z);
      zc.drawImage(source, dx, dy, source.width * z, source.height * z);
      if (z >= 6) {
        zc.fillStyle = "rgba(255, 255, 255, .07)";
        for (let x = dx % z; x < w; x += z) zc.fillRect(x, 0, 1, hgt);
        for (let y = dy % z; y < hgt; y += z) zc.fillRect(0, y, w, 1);
      }
      zoomCaption.textContent = `Zoom ×${z}`;
    };
    const zoomCaption = h("figcaption", {}, "Zoom");
    previews.add(redraw);
    requestAnimationFrame(redraw);
    return h(
      "div",
      { className: "xh" },
      h("figure", {}, real, h("figcaption", {}, "Tamaño real")),
      h("figure", {}, zoom, zoomCaption),
      h("div", { className: "bgs" }, bgButtons)
    );
  }

  function render() {
    draft = { ...settings };
    previews.clear();
    setLanguage();
    fillFrame();
    setChildren(
      navItems,
      sections
        .filter((section) => section.id !== "about")
        .map((section) => {
          const button = h(
            "button",
            {
              "aria-current": section.id === current ? "true" : "false",
              onclick: () => {
                current = section.id;
                render();
              },
            },
            section.title
          );
          if (ICONS[section.id]) {
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.innerHTML = ICONS[section.id];
            button.prepend(icon);
          }
          return button;
        })
    );
    const section = sections.find((s) => s.id === current);
    const keep = main.dataset.section === current ? main.scrollTop : 0;
    main.dataset.section = current;
    setChildren(main, [h("h2", {}, section.title), boxed(section.items)]);
    main.scrollTop = keep;
  }

  function toggle(open = backdrop.hidden) {
    if (open) {
      render();
      document.exitPointerLock?.();
    } else showCredits(false);
    backdrop.hidden = !open;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (capturingKey) return;
      if (e.code === settings.menuKey) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      } else if (e.code === "Escape" && !backdrop.hidden && !document.querySelector("[data-rite-encima-del-menu]")) {
        // A script window open over the menu (e.g. the Grabador's «Mis
        // partidas») closes itself first, leaving you in the menu.
        toggle(false);
      }
    },
    true
  );

  scrims?.onChange(() => {
    if (!backdrop.hidden && current === "scrims") render();
  });

  return {
    update(next) {
      settings = next;
      draft = { ...draft, ...next };
      if (!backdrop.hidden && !root.activeElement) render();
    },
  };
}

module.exports = { createMenu };
