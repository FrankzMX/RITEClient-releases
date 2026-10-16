"use strict";

// RITE scrims on screen: a floating queue panel in the lobby (join, leave,
// share your room; it drags and minimizes), the ¡Listo! alert when the
// player's queue fills, and the match card with the map vote and a one-click
// room join.
// The state comes from the main process (see src/main/scrims.js).

const GAMES = { kirka: "Kirka", voxarena: "VOXARENA", protox: "Protox" };
const MODES = { "1v1": "1v1", "2v2-point": "2v2 Point", "2v2-tdm": "2v2 TDM", "3v3-point": "3v3 Point" };
const label = (game, mode) => `${GAMES[game] || game} · ${MODES[mode] || mode}`;
// Kirka queues always listed in the panel (the bot's PLAYABLE.kirka), so an empty one can be opened.
const KIRKA_MODES = ["1v1", "2v2-tdm", "2v2-point", "3v3-point"];
const perTeam = (mode) => Number(/^(\d)v/.exec(mode)?.[1] || 1);
const PANEL_KEY = "rite-scrims-panel";
const DISCORD = require("../../main/credits").community.find((c) => /discord/i.test(c.url)).url;
const { roomTarget, arrived } = require("./lobby");

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { --void: #07060b; --panel: #16131c; --gold: #e0b34a; --gold-2: #f3d48a; --cream: #f4efe4; --mist: #a39886; --line: #3a3324; --red: #d4553f;
    font: 14px/1.4 "Outfit", ui-sans-serif, system-ui, sans-serif; color: var(--cream); }
  .panel[hidden], .card[hidden] { display: none; }
  /* Performance mode: solid and still. */
  .wrap.perf .panel { backdrop-filter: none; background: #100e16; }
  .wrap.perf *, .wrap.perf *::after { animation: none !important; transition: none !important; }
  .panel { position: fixed; z-index: 2147483640; width: 280px; background: rgba(16, 14, 22, .8); backdrop-filter: blur(8px); border: 1px solid var(--line); border-top: 2px solid var(--gold); border-radius: 2px; box-shadow: 0 18px 40px rgba(0, 0, 0, .45); user-select: none; }
  .panel.min { width: auto; min-width: 170px; }
  /* Over the game: no blur or animated glow, they cost frames on every redraw. */
  .panel.game { backdrop-filter: none; background: rgba(16, 14, 22, .95); }
  .panel.ghost::after { animation: none; }
  .panel.ghost { pointer-events: none; opacity: .82; box-shadow: none; backdrop-filter: none; background: rgba(16, 14, 22, .7); animation: none; }
  /* The glow is its own layer and blinks once, only its opacity: cheap to draw over the game. */
  .panel::after { content: ""; position: absolute; inset: -1px; pointer-events: none; border-radius: 2px; box-shadow: 0 0 0 1px var(--gold-2), 0 0 22px rgba(243, 212, 138, .55); opacity: 0; }
  .panel.alert::after { animation: blink 1.1s ease-in-out 1; }
  .panel.alert .dot { background: var(--gold-2); box-shadow: 0 0 8px var(--gold-2); }
  @keyframes blink { 50% { opacity: 1; } }
  .head { display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 12px; cursor: move; }
  .head .t { flex: 1; font: 500 12px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #5b5346; }
  .dot.on { background: #6fcf7a; box-shadow: 0 0 6px #6fcf7a; }
  .badge { font: 500 11px "Oswald", sans-serif; color: var(--void); background: var(--gold); padding: 1px 6px; border-radius: 2px; }
  .ico { all: unset; cursor: pointer; width: 22px; height: 22px; display: grid; place-items: center; color: var(--mist); font: 16px/1 ui-sans-serif, system-ui, sans-serif; border-radius: 2px; }
  .ico:hover { color: var(--cream); background: rgba(255, 255, 255, .06); }
  .body { padding: 2px 10px 10px; }
  .panel.min .body { display: none; }
  .msg { color: var(--mist); font-size: 12.5px; margin: 4px 2px 8px; }
  .code { font: 500 26px/1 "Oswald", sans-serif; letter-spacing: .3em; color: var(--gold-2); text-align: center; padding: 8px 0; border: 1px dashed var(--gold); margin: 4px 0 6px; user-select: text; }
  .cmd { font: 11.5px ui-monospace, monospace; color: var(--cream); background: rgba(7, 6, 11, .6); padding: 4px 6px; border-radius: 2px; user-select: text; word-break: break-all; }
  .sec { font: 500 10.5px "Oswald", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--mist); margin: 8px 2px 4px; }
  .qrow { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 8px; margin-bottom: 4px; background: rgba(7, 6, 11, .45); border: 1px solid transparent; border-left: 2px solid var(--line); border-radius: 2px; }
  .qrow.mine { border-color: var(--line); border-left-color: var(--gold); }
  .qrow.live { border-left-color: var(--gold-2); }
  .qrow .n { flex: 1; min-width: 0; }
  .qrow .n div { font-size: 13px; color: var(--cream); white-space: nowrap; }
  .qrow .n small { display: block; font-size: 11px; color: var(--mist); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qrow .c { font: 500 13px "Oswald", sans-serif; color: var(--gold-2); min-width: 30px; text-align: right; }
  button.s { all: unset; cursor: pointer; padding: 5px 9px; border: 1px solid var(--gold); border-radius: 2px; color: var(--gold-2); font: 500 11px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .14em; text-transform: uppercase; }
  button.s:hover { background: var(--gold); color: var(--void); }
  button.s.out { border-color: var(--red); color: #f0a48f; }
  button.s.out:hover { background: var(--red); color: var(--cream); }
  button.s.main { background: linear-gradient(135deg, var(--gold-2), var(--gold) 55%, #8a6420); border-color: transparent; color: var(--void); }
  button.s[disabled] { opacity: .45; pointer-events: none; }
  .mrow { padding: 8px; margin-bottom: 6px; background: rgba(224, 179, 74, .08); border: 1px solid var(--gold); border-radius: 2px; }
  .mrow .h { font: 500 13px "Oswald", sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--cream); }
  .mrow .sub { font-size: 11.5px; }
  .btns { display: flex; gap: 6px; margin-top: 7px; flex-wrap: wrap; }
  .btns button.s { flex: 1; text-align: center; }
  .in { all: unset; display: block; width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 6px 8px; background: rgba(7, 6, 11, .6); border: 1px solid var(--line); border-radius: 2px; color: var(--cream); font: 13px "Outfit", ui-sans-serif, system-ui, sans-serif; user-select: text; }
  .in:focus { border-color: var(--gold); }
  select.in option { background: #16131c; color: #f4efe4; }
  .foot { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; color: var(--mist); }
  .foot span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .foot b { color: var(--cream); font-weight: 500; }
  .card { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 2147483646; width: min(460px, 92vw); padding: 14px 16px 16px; background: linear-gradient(160deg, var(--panel), #100e16 70%); border: 1px solid var(--line); border-top: 2px solid var(--gold); border-radius: 2px; box-shadow: 0 24px 60px rgba(0, 0, 0, .65); animation: drop .35s cubic-bezier(.19, 1, .22, 1); }
  @keyframes drop { from { opacity: 0; transform: translate(-50%, -12px); } }
  .kicker { font: 500 11px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
  h3 { margin: 4px 0 6px; font: 500 20px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--cream); }
  .sub { color: var(--mist); font-size: 13px; }
  .teams { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; margin: 10px 0 4px; font-size: 13px; }
  .teams .vs { color: var(--mist); font: 500 12px "Oswald", sans-serif; letter-spacing: .2em; }
  .teams div { padding: 6px 8px; background: rgba(7, 6, 11, .5); border: 1px solid var(--line); border-radius: 2px; }
  .teams .you { border-color: var(--gold); }
  .teams small { display: block; color: var(--mist); font: 500 10px "Oswald", sans-serif; letter-spacing: .16em; text-transform: uppercase; }
  .row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  button.b { all: unset; cursor: pointer; flex: 1; text-align: center; padding: 10px 12px; border: 1px solid var(--gold); border-radius: 2px; color: var(--gold-2); font: 500 13px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .16em; text-transform: uppercase; transition: background .15s, color .15s; }
  button.b:hover { background: var(--gold); color: var(--void); }
  button.b.main { background: linear-gradient(135deg, var(--gold-2), var(--gold) 55%, #8a6420); border: 0; color: var(--void); }
  button.b.main:hover { filter: brightness(1.08); }
  button.b.no { border-color: var(--red); color: #f0a48f; flex: 0 0 auto; }
  button.b.no:hover { background: var(--red); color: var(--cream); }
  button.b.ghost { border-color: var(--line); color: var(--mist); flex: 0 0 auto; }
  .x { all: unset; cursor: pointer; position: absolute; top: 8px; right: 10px; color: var(--mist); font-size: 16px; }
  .x:hover { color: var(--cream); }
  button.gear { flex: 0 0 auto; font-size: 15px; letter-spacing: 0; }
  .gearbox { margin-top: 8px; padding: 8px; background: rgba(7, 6, 11, .5); border: 1px solid var(--line); border-radius: 2px; }
  .gearbox label { display: block; font: 500 10.5px "Oswald", sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--mist); }
  .gearbox .in { margin-top: 3px; }
  .gearbox .msg { margin: 6px 0 0; font-size: 11.5px; }
  .vote { margin-top: 8px; }
  .vote .vh { display: flex; justify-content: space-between; font: 500 10.5px "Oswald", sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--mist); }
  .vote .vh span:last-child { color: var(--gold-2); }
  .vopts { display: grid; gap: 4px; margin-top: 4px; }
  button.vo { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: rgba(7, 6, 11, .5); border: 1px solid var(--line); border-radius: 2px; color: var(--cream); font-size: 13px; text-align: left; }
  button.vo:hover { border-color: var(--gold); }
  button.vo.on { border-color: var(--gold); background: rgba(224, 179, 74, .14); }
  button.vo span { flex: 1; }
  button.vo b { font: 500 13px "Oswald", sans-serif; color: var(--gold-2); }
  button.vo[disabled] { opacity: .6; pointer-events: none; }
  .bar { height: 3px; background: rgba(7, 6, 11, .7); margin-top: 10px; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg, #8a6420, var(--gold), var(--gold-2)); transition: width 1s linear; }
`;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "className") node.className = value;
    else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

// One audio context for every sound: opening a new one each time starts the
// audio device again, which can freeze the game for a moment on some PCs.
let audio = null;
function audioContext() {
  if (!audio || audio.state === "closed") audio = new AudioContext();
  if (audio.state === "suspended") audio.resume().catch(() => {});
  return audio;
}

// A short two-note chime, made on the fly so no sound file is needed.
function chime() {
  try {
    const ctx = audioContext();
    [880, 1318.5].forEach((freq, n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + n * 0.14;
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {}
}

// A single soft blip for "someone joined a queue" (quieter than the chime).
function blip() {
  try {
    const ctx = audioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(990, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  } catch {}
}

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function createScrims({ api, toast, settings: initial, createRoom, roomOptions, joinRoom }) {
  const enter = (url) => (joinRoom ? joinRoom(url) : api.scrimsJoin(url));
  let settings = initial;
  let state = { linked: false, status: "checking" };
  let dismissed = new Set();
  let seen = { check: null, match: null, room: null };
  let primed = false; // no chime for what was already there when the client opened
  let busy = false;
  const listeners = new Set();

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style>`;
  const panel = el("div", { className: "panel", hidden: true });
  const card = el("div", { className: "card", hidden: true });
  const wrap = el("div", { className: "wrap" }, panel, card);
  wrap.classList.toggle("perf", Boolean(initial.performanceMode));
  root.append(wrap);
  document.documentElement.append(host);
  // Clicks on the card and the panel must not reach the game (it would grab the pointer).
  for (const node of [card, panel]) for (const type of ["mousedown", "mouseup", "click", "keydown", "keyup", "keypress"]) node.addEventListener(type, (e) => e.stopPropagation());

  // Where the panel sits and whether it is minimized, remembered between sessions.
  let place = { x: 150, y: 170, min: false };
  try {
    place = { ...place, ...JSON.parse(localStorage.getItem(PANEL_KEY) || "{}") };
  } catch {}
  const savePlace = () => {
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify(place));
    } catch {}
  };
  // The lobby and matches keep their own spot: in a match it starts under the score.
  const spot = () => {
    if (inLobby()) return { x: "x", y: "y" };
    if (place.gx === undefined) place.gx = Math.round(window.innerWidth / 2 - (panel.offsetWidth || 180) / 2);
    if (place.gy === undefined) place.gy = 58;
    return { x: "gx", y: "gy" };
  };
  const clampPlace = () => {
    const w = panel.offsetWidth || 280;
    const k = spot();
    place[k.x] = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), place[k.x]));
    place[k.y] = Math.max(0, Math.min(window.innerHeight - 36, place[k.y]));
    panel.style.left = `${place[k.x]}px`;
    panel.style.top = `${place[k.y]}px`;
  };
  // Only on resize, drag or when the panel changes: reading its size forces a layout.
  window.addEventListener("resize", clampPlace);
  panel.addEventListener("mousedown", (e) => {
    if (!e.target.closest?.(".head") || e.target.closest?.("button")) return;
    const k = spot();
    const start = { mx: e.clientX, my: e.clientY, x: place[k.x], y: place[k.y] };
    const move = (ev) => {
      place[k.x] = start.x + ev.clientX - start.mx;
      place[k.y] = start.y + ev.clientY - start.my;
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

  let pending = null; // "join:game:mode" | "leave" | "room" while the bot answers
  let pendingTimer = null;
  const seenNotices = new Set();
  let counts = null; // players per queue, to notice when someone joins
  let alert = null; // { until, text } while the minimized panel blinks
  // What the panel and the card were last drawn from: they are rebuilt only
  // when it changes (a rebuild under the cursor swallows clicks).
  let stateKey = "";
  let settingsSeq = 0;
  let panelKey = "";
  let cardKey = "";
  let countdown = null; // { sub, bar, until, text } of the ready check on screen

  const inLobby = () => !document.pointerLockElement && document.querySelector("#app > .interface") && !document.querySelector("#app > .game-interface");
  const inRoom = () => /^\/games\//.test(location.pathname);
  // Already where the match is: in its room, or in its lobby or the match that lobby started.
  const atRoom = (url) => Boolean(url) && (arrived(roomTarget(url), null, location.href) || (/\/___lobby___\//.test(url) && inRoom()));

  // "Sala rápida" for a Kirka match that has no room yet: the server and length
  // saved in the gear, the mode and the voted map. The gear opens the room
  // settings (server, map, minutes) before creating it. Gone for everybody once
  // the match has a room (the first link of the thread wins). While the map is
  // still being voted, the voted map isn't known yet: pressing it waits for the
  // vote and creates the room as soon as the bot has the winner.
  const REGIONS = ["NA", "SA", "EU"];
  const MINUTES = ["4", "8", "15", "30", "60"];
  const canCreate = (m) => Boolean(createRoom) && m.game === "kirka" && !m.roomUrl && !inRoom() && settings.scrimsAutoLobby !== false;
  let gear = null; // { match, map, maps, folder } while the room settings are open
  const region = () => (REGIONS.includes(settings.scrimsRoomRegion) ? settings.scrimsRoomRegion : "NA");
  const minutes = () => (MINUTES.includes(settings.scrimsRoomMinutes) ? settings.scrimsRoomMinutes : "15");
  const create = (map) => queueAction("create", () => createRoom({ region: region(), minutes: minutes(), map }).then(() => (gear = null)));
  let armed = null; // { match } while "Sala rápida" waits for the map vote
  const voting = (m) => Boolean(m?.vote);
  const quick = (m, map = "") => {
    if (map || !voting(m)) return ((armed = null), create(map));
    armed = armed?.match === m.id ? null : { match: m.id };
    if (armed) toast.show("La sala se crea cuando termine la votación de mapa.");
    draw();
  };
  // The vote closed with a winner: the room it was waiting for, now.
  function fireArmed() {
    const m = state.me?.match;
    if (!armed) return;
    if (!m || m.id !== armed.match || m.roomUrl || !canCreate(m)) return void (armed = null);
    if (voting(m)) return;
    armed = null;
    create("");
  }
  async function openGear(m) {
    if (gear?.match === m.id) return ((gear = null), draw());
    gear = { match: m.id, map: "", maps: [], folder: [] };
    draw();
    const found = await roomOptions?.().catch(() => null);
    if (gear?.match !== m.id || !found) return;
    gear = { ...gear, maps: found.maps || [], folder: found.folder || [] };
    draw();
  }
  const createButtons = (m, cls) =>
    canCreate(m)
      ? [
          el(
            "button",
            {
              className: cls,
              disabled: pending === "create",
              title: armed?.match === m.id
                ? "Se crea al terminar la votación de mapa (otro clic la cancela)"
                : `Crea la sala en ${region()} con ${voting(m) ? "el mapa que gane la votación" : m.map || "el mapa del lobby (la partida no tiene mapa votado)"}, ${minutes()} min`,
              onclick: () => quick(m),
            },
            pending === "create" ? "Creando…" : armed?.match === m.id ? "Esperando mapa…" : `Sala rápida · ${region()}`
          ),
          el("button", { className: `${cls} gear`, title: "Ajustes de la sala: servidor, mapa y minutos", onclick: () => openGear(m) }, "⚙"),
        ]
      : [];
  function gearForm(m) {
    if (!canCreate(m) || gear?.match !== m.id) return null;
    const select = (value, options, onchange) =>
      el("select", { className: "in", onchange: (e) => onchange(e.target.value) }, options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
    const voted = voting(m) ? "El que gane la votación" : m.map ? `Votado: ${m.map}` : "El votado";
    const maps = [["", voted], ...gear.maps.map((n) => [n, n]), ...gear.folder.filter((n) => !gear.maps.includes(n)).map((n) => [n, `${n} (carpeta mapas)`])];
    const save = (key, value) => api.setSetting(key, value).catch(() => {});
    return el(
      "div",
      { className: "gearbox" },
      el("label", {}, "Servidor", select(region(), REGIONS.map((r) => [r, r]), (v) => save("scrimsRoomRegion", v))),
      el("label", {}, "Mapa", select(gear.map, maps, (v) => (gear.map = v))),
      el("label", {}, "Minutos", select(minutes(), MINUTES.map((n) => [n, `${n} min`]), (v) => save("scrimsRoomMinutes", v))),
      el(
        "div",
        { className: "btns" },
        el(
          "button",
          { className: "s main", disabled: pending === "create", onclick: () => quick(m, gear.map) },
          pending === "create" ? "Creando…" : !gear.map && armed?.match === m.id ? "Esperando mapa…" : "Crear sala"
        ),
        el("button", { className: "s", title: "Pon aquí los mapas que Kirka no trae: un .txt con el código del mapa, con el nombre del mapa", onclick: () => api.openFolder("maps") }, "Carpeta mapas")
      ),
      el("div", { className: "msg" }, "Servidor y minutos se quedan para tu próxima «Sala rápida».")
    );
  }

  // The map vote of the match, also on the client: one button per map with its
  // votes. The bot counts these with the thread's buttons.
  const clocks = new Set(); // { node, until } of the vote countdowns on screen
  function paintClocks() {
    for (const c of clocks) {
      // Gone with a rebuild (a new one is only attached right after it is made).
      if (!c.node.isConnected && Date.now() - c.born > 2000) clocks.delete(c);
      const left = c.until - Date.now();
      // A map got the votes: 3… 2… 1… ¡listo!
      if (c.fast) c.node.textContent = left > 0 ? `${Math.ceil(left / 1000)}…` : "¡listo!";
      else c.node.textContent = left > 0 ? `quedan ${mmss(left)}` : "cerrando…";
    }
  }
  function voteBox(m) {
    const v = m.vote;
    if (!v || !Array.isArray(v.maps)) return null;
    const until = new Date(v.until).getTime();
    const won = Number.isInteger(v.winner) && v.maps[v.winner] !== undefined;
    const clock = el("span");
    clocks.add({ node: clock, until, born: Date.now(), fast: won });
    paintClocks();
    const sending = typeof pending === "string" && pending.startsWith("vote:");
    const picked = won ? v.winner : sending ? Number(pending.slice(5)) : v.mine;
    const closed = won || until <= Date.now();
    return el(
      "div",
      { className: "vote" },
      el("div", { className: "vh" }, el("span", {}, won ? `Queda ${v.maps[v.winner]}` : picked === null || picked === undefined ? "Vota el mapa" : "Tu voto"), clock),
      el(
        "div",
        { className: "vopts" },
        v.maps.map((name, k) =>
          el(
            "button",
            { className: `vo${picked === k ? " on" : ""}`, disabled: sending || closed, onclick: () => queueAction(`vote:${k}`, () => api.scrimsVote(m.id, k)) },
            el("span", {}, name),
            el("b", {}, String(v.counts?.[k] || 0))
          )
        )
      )
    );
  }

  async function act(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (error) {
      toast.show(error?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "Algo falló", "error");
    } finally {
      busy = false;
      draw();
    }
  }

  function queueAction(key, fn) {
    pending = key;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => ((pending = null), draw()), 8000);
    act(fn).catch(() => {});
  }

  function queueRows() {
    const me = state.me?.queue;
    const busyMatch = Boolean(state.me?.match);
    const live = new Map((state.queues || []).map((q) => [`${q.game}:${q.mode}`, q]));
    const keys = [...KIRKA_MODES.map((m) => `kirka:${m}`), ...[...live.keys()].filter((k) => !k.startsWith("kirka:"))];
    return keys.map((key) => {
      const [game, mode] = key.split(":");
      const q = live.get(key);
      const need = q?.need || perTeam(mode) * 2;
      const players = q?.players || [];
      const mine = me && me.game === game && me.mode === mode;
      const waiting = pending === `join:${key}` || (mine && pending === "leave");
      const button = mine
        ? el("button", { className: "s out", disabled: waiting, onclick: () => queueAction("leave", () => api.scrimsQueue("leave")) }, waiting ? "…" : "Salir")
        : el(
            "button",
            {
              className: "s",
              disabled: waiting || busyMatch || Boolean(me?.check),
              title: busyMatch ? "Ya tienes una partida abierta" : me ? "Te cambia de cola" : "",
              onclick: () => queueAction(`join:${key}`, () => api.scrimsQueue("join", game, mode)),
            },
            waiting ? "…" : "Entrar"
          );
      return el(
        "div",
        { className: `qrow${mine ? " mine" : ""}${players.length ? " live" : ""}` },
        el(
          "div",
          { className: "n" },
          el("div", {}, game === "kirka" ? MODES[mode] || mode : label(game, mode)),
          el("small", { title: players.join(", ") }, q?.checking ? "Confirmando ¡Listo!…" : players.length ? players.join(", ") : "Vacía: entra y ábrela")
        ),
        el("span", { className: "c" }, `${Math.min(players.length, need)}/${need}`),
        button
      );
    });
  }

  function matchRow(m) {
    const sharing = pending === "room";
    return el(
      "div",
      { className: "mrow" },
      el("div", { className: "h" }, `Partida #${m.id} · ${MODES[m.mode] || m.mode}`),
      el("div", { className: "sub" }, `${m.teams[0].join(", ") || "—"}  vs  ${m.teams[1].join(", ") || "—"}`),
      el(
        "div",
        { className: "btns" },
        m.roomUrl && !atRoom(m.roomUrl) ? el("button", { className: "s main", onclick: () => act(() => enter(m.roomUrl)) }, "Entrar a la sala") : null,
        ...createButtons(m, "s"),
        inRoom() && !atRoom(m.roomUrl)
          ? el("button", { className: "s", disabled: sharing, title: "Manda el link de esta sala a tu partida", onclick: () => queueAction("room", () => api.scrimsShareRoom()) }, sharing ? "…" : "Compartir mi sala")
          : null,
        m.threadUrl ? el("button", { className: "s", onclick: () => api.scrimsOpen(m.threadUrl) }, "Hilo") : null
      ),
      voteBox(m),
      gearForm(m)
    );
  }

  // Linked but not in RITE yet: the same as /registro, from here. The queues
  // only open once the bot has registered the player.
  let form = { name: "", region: "", kirka: "" };
  function registerForm() {
    const input = (key, attrs) =>
      el("input", { className: "in", value: form[key], oninput: (e) => (form[key] = e.target.value), ...attrs });
    const region = el(
      "select",
      { className: "in", onchange: (e) => (form.region = e.target.value) },
      el("option", { value: "" }, "Región"),
      ...["EU", "NA", "SA"].map((r) => el("option", { value: r, selected: form.region === r }, r))
    );
    const sending = pending === "register";
    return [
      el("div", { className: "msg" }, "Para entrar a las colas regístrate en RITE. Es lo mismo que /registro en Discord."),
      input("name", { placeholder: "Tu gamer tag", maxLength: 24 }),
      region,
      input("kirka", { placeholder: "Tu Kirka: Nombre#ID (ej. SANTI#MARAGE)", maxLength: 48 }),
      el(
        "div",
        { className: "btns" },
        el(
          "button",
          { className: "s main", disabled: sending, onclick: () => queueAction("register", () => api.scrimsRegister(form)) },
          sending ? "…" : "Registrarme"
        ),
        el("button", { className: "s", onclick: () => api.openLink(DISCORD) }, "Discord")
      ),
      el("div", { className: "msg" }, "Con tu Kirka, los demás te ven con la insignia de RITE Client."),
    ];
  }

  function panelBody() {
    if (state.status === "unlinked" || state.status === "checking" || (!state.linked && !state.code))
      return [
        el("div", { className: "msg" }, "Liga tu Discord para entrar a las colas de RITE desde aquí."),
        el("div", { className: "btns" }, el("button", { className: "s main", onclick: () => act(() => api.scrimsPair()) }, "Vincular")),
      ];
    if (!state.linked)
      return [
        el("div", { className: "msg" }, "En el Discord de RITE escribe:"),
        el("div", { className: "code" }, state.code),
        el("div", { className: "cmd" }, `/cliente vincular codigo:${state.code}`),
        el(
          "div",
          { className: "btns" },
          el("button", { className: "s", onclick: () => api.openLink(DISCORD) }, "Discord"),
          el("button", { className: "s out", onclick: () => act(() => api.scrimsUnlink()) }, "Cancelar")
        ),
      ];
    if (!state.player && !state.offline) return registerForm();
    const m = state.me?.match;
    return [
      state.offline ? el("div", { className: "msg" }, "Sin conexión con RITE WEB, reintentando…") : null,
      m ? matchRow(m) : null,
      el("div", { className: "sec" }, "Colas"),
      ...queueRows(),
      el(
        "div",
        { className: "foot" },
        el("span", {}, "Ligado como ", el("b", {}, state.player?.name || "—")),
        state.me?.queue?.url ? el("button", { className: "ico", title: "Abrir #rite-cola en Discord", onclick: () => api.scrimsOpen(state.me.queue.url) }, "↗") : null
      ),
    ];
  }

  // Lobby: the full panel. In a match: only if the player wants it; while
  // aiming (pointer lock) it shrinks to its title and lets clicks through.
  function drawPanel(view) {
    const { lobby, locked } = view;
    const show = settings.scrimsEnabled && settings.scrimsPanel !== false && (lobby || settings.scrimsPanelInGame !== false || (view.room && state.me?.match && !locked));
    panel.hidden = !show;
    if (!show) {
      panelKey = "";
      return;
    }
    const ghost = locked && !lobby;
    const min = place.min || ghost;
    const blinking = Boolean(alert) && min;
    const key = JSON.stringify([view.key, ghost, min, blinking && alert.text]);
    if (key === panelKey) return;
    panel.classList.toggle("min", min);
    panel.classList.toggle("ghost", ghost);
    panel.classList.toggle("game", !lobby);
    panel.classList.toggle("alert", blinking);
    // Typing in the sign-up form: don't rebuild it under the player's fingers.
    // Same with the room settings open (a rebuild would close a dropdown).
    if (!min && root.activeElement?.classList?.contains("in")) return;
    panelKey = key;
    const count = (state.queues || []).reduce((n, q) => n + q.players.length, 0);
    const mine = state.me?.queue;
    panel.replaceChildren(
      el(
        "div",
        { className: "head", title: "Arrastra para moverlo" },
        el("span", { className: `dot${state.linked && !state.offline ? " on" : ""}` }),
        el("span", { className: "t" }, "Scrims RITE"),
        min && blinking ? el("span", { className: "badge" }, alert.text) : null,
        min && !blinking && mine ? el("span", { className: "badge", title: "Estás en cola" }, MODES[mine.mode] || "En cola") : null,
        min && !blinking && !mine && count ? el("span", { className: "badge", title: "Jugadores en cola" }, String(count)) : null,
        ghost ? null : el("button", { className: "ico", title: place.min ? "Abrir" : "Minimizar", onclick: () => ((place.min = !place.min), (alert = null), savePlace(), draw()) }, place.min ? "+" : "−")
      ),
      el("div", { className: "body" }, ...(min ? [] : panelBody().filter(Boolean)))
    );
    clampPlace();
  }

  // Someone joined a queue the player is not in: blink the minimized panel
  // (and a short blip) so they notice even mid-match.
  function watchQueues(next) {
    const now = new Map((next.queues || []).map((q) => [`${q.game}:${q.mode}`, q]));
    const before = counts;
    if (next.linked) counts = new Map([...now.entries()].map(([key, q]) => [key, q.players.length]));
    if (!before) return; // first look: what was already there is not news
    const grown = [...now.entries()].find(([key, q]) => q.players.length > (before.get(key) || 0));
    if (!grown || !next.linked || next.me?.queue || next.me?.match) return;
    if (!settings.scrimsEnabled || settings.scrimsQueueAlert === false) return;
    const [, q] = grown;
    alert = { until: Date.now() + 60000, text: `${MODES[q.mode] || q.mode} ${Math.min(q.players.length, q.need)}/${q.need}` };
    const ghost = document.pointerLockElement && !inLobby();
    if ((place.min || ghost) && settings.scrimsSound) blip();
  }

  // The countdown and its bar change every second; the buttons under them are
  // never rebuilt for it.
  function paintCountdown() {
    if (!countdown) return;
    const left = countdown.until !== null ? countdown.until - Date.now() : null;
    countdown.sub.textContent = `${countdown.text}${left !== null ? ` · quedan ${mmss(left)}` : ""}`;
    if (countdown.bar) countdown.bar.style.width = `${Math.max(0, Math.min(100, (left / 180000) * 100))}%`;
  }

  function checkCard(q) {
    const until = q.check.until ? new Date(q.check.until).getTime() : null;
    const ready = q.check.ready;
    const sub = el("div", { className: "sub" });
    const bar = until !== null ? el("i") : null;
    countdown = { sub, bar, until, text: label(q.game, q.mode) };
    paintCountdown();
    return [
      el("div", { className: "kicker" }, "Scrims RITE"),
      el("h3", {}, ready ? "Esperando a los demás" : "¡Se llenó tu cola!"),
      sub,
      bar ? el("div", { className: "bar" }, bar) : null,
      ready
        ? null
        : el(
            "div",
            { className: "row" },
            el("button", { className: "b main", onclick: () => act(() => api.scrimsReady(q.check.id, true)) }, "¡Listo!"),
            el("button", { className: "b no", onclick: () => act(() => api.scrimsReady(q.check.id, false)) }, "No puedo")
          ),
    ];
  }

  function matchCard(m) {
    const key = `${m.id}:${m.roomUrl || ""}`;
    const team = (t) =>
      el("div", { className: m.team === t ? "you" : "" }, el("small", {}, `Equipo ${t === 0 ? "A" : "B"}${m.team === t ? " · tú" : ""}`), m.teams[t].join(", ") || "—");
    return [
      el("button", { className: "x", title: "Ocultar", onclick: () => (dismissed.add(key), draw()) }, "✕"),
      el("div", { className: "kicker" }, `Partida RITE #${m.id}`),
      el("h3", {}, m.roomUrl ? "Tu sala está lista" : "Partida armada"),
      el("div", { className: "sub" }, `${label(m.game, m.mode)}${m.map ? ` · ${m.map}` : ""}${m.roomUrl ? "" : " · esperando el link de la sala"}`),
      el("div", { className: "teams" }, team(0), el("span", { className: "vs" }, "VS"), team(1)),
      voteBox(m),
      el(
        "div",
        { className: "row" },
        m.roomUrl ? el("button", { className: "b main", onclick: () => act(() => enter(m.roomUrl)) }, "Entrar a la sala") : null,
        ...createButtons(m, "b main"),
        !m.roomUrl && inRoom()
          ? el("button", { className: "b main", disabled: pending === "room", onclick: () => queueAction("room", () => api.scrimsShareRoom()) }, "Compartir mi sala")
          : null,
        m.threadUrl ? el("button", { className: m.roomUrl ? "b ghost" : "b", onclick: () => api.scrimsOpen(m.threadUrl) }, "Abrir hilo") : null
      ),
      gearForm(m),
    ];
  }

  function drawCard(view) {
    const q = state.me?.queue;
    const m = state.me?.match;
    let kind = null;
    if (state.linked && settings.scrimsEnabled) {
      if (q?.check) kind = "check";
      else if (m && !dismissed.has(`${m.id}:${m.roomUrl || ""}`) && !atRoom(m.roomUrl)) kind = "match";
    }
    if (kind && !card.hidden && root.activeElement?.classList?.contains("in") && card.contains(root.activeElement)) return;
    card.hidden = !kind;
    if (!kind) {
      cardKey = "";
      countdown = null;
      return;
    }
    const key = JSON.stringify([view.key, kind]);
    if (key === cardKey) return;
    cardKey = key;
    countdown = null;
    card.replaceChildren(...(kind === "check" ? checkCard(q) : matchCard(m)).filter(Boolean));
  }

  // Redraws only when something it shows changed: the bot's state, the
  // settings, a pending action, lobby or match, the pointer lock or the page.
  let pressing = false;
  let dirty = false;
  function draw() {
    if (pressing) {
      dirty = true;
      return;
    }
    dirty = false;
    const view = { lobby: Boolean(inLobby()), locked: Boolean(document.pointerLockElement), room: inRoom() };
    view.key = JSON.stringify([stateKey, settingsSeq, pending, gear, armed, place.min, view.lobby, view.locked, view.room, location.href, dismissed.size]);
    drawPanel(view);
    drawCard(view);
  }

  // Sound for what needs the player now: their ready check, a new match, the room link.
  function notify(next) {
    const check = next.me?.queue?.check?.id || null;
    const match = next.me?.match?.id || null;
    const room = next.me?.match?.roomUrl || null;
    const fresh = (check && check !== seen.check) || (match && match !== seen.match) || (room && room !== seen.room);
    seen = { check, match, room };
    if (fresh && primed && settings.scrimsSound && settings.scrimsEnabled) chime();
    if (next.status === "linked") primed = true;
  }

  // The bot's answers to what the player asked from the panel.
  function notices(next) {
    const list = next.notices || [];
    const fresh = list.filter((n) => !seenNotices.has(n.id));
    for (const n of list) seenNotices.add(n.id);
    if (!primed) return;
    for (const n of fresh) toast.show(n.text, n.ok ? "info" : "error");
    if (fresh.length) {
      pending = null;
      clearTimeout(pendingTimer);
    }
  }

  function apply(next) {
    if (!next) return;
    notify(next);
    watchQueues(next);
    notices(next);
    state = next;
    stateKey = JSON.stringify(next);
    fireArmed();
    draw();
    for (const fn of listeners) fn(state);
  }

  api.scrimsGet().then(apply).catch(() => {});
  // Nothing is redrawn while the player is pressing a button on the panel or
  // the card (a redraw would swallow the click); it catches up right after.
  for (const node of [panel, card]) node.addEventListener("pointerdown", () => (pressing = true));
  window.addEventListener(
    "pointerup",
    () =>
      setTimeout(() => {
        pressing = false;
        if (dirty) draw();
      }, 0),
    true
  );
  // Every second: the countdown text, the end of a queue alert and lobby/match
  // changes, which only rebuild something when they changed what is shown.
  setInterval(() => {
    if (alert && alert.until < Date.now()) alert = null;
    paintCountdown();
    paintClocks();
    draw();
  }, 1000);
  document.addEventListener("pointerlockchange", () => draw());

  return {
    apply,
    update(next) {
      settings = next;
      settingsSeq++;
      wrap.classList.toggle("perf", Boolean(next.performanceMode));
      draw();
    },
    get state() {
      return state;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

module.exports = { createScrims, label };
