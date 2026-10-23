"use strict";

// RITE lobby: sets up a RITE match in Kirka's own party lobby.
//   1. Anyone in the match with the client can press "Sala rápida" (or set the
//      server, map and length with the gear first): their party moves to that
//      server (NA, SA or EU), gets the match's mode and map (a map Kirka doesn't
//      have goes as the map code saved in Documentos/RITEClient/mapas), and its
//      link goes to the bot, which posts it in the match thread for
//      those without the client. The first room link of the thread wins: once
//      there is one, the button is gone for everybody.
//   2. Everyone else in the match with the client goes into that lobby when
//      they are on Kirka's home screen.
//   3. Each client moves its own player to their colour (team A red, team B
//      blue) and marks them ready, with Kirka's own "switch team" and "ready".
//   4. When the whole match is in the lobby and everyone is ready, the client
//      of the lobby's owner creates the match, like the owner pressing the button.
//   5. In the match room, the client of the room's owner moves anyone on the
//      wrong colour with Kirka's /teamswap command, matching players by the
//      #ID they registered with the bot. This also covers rooms made by hand
//      and players without the client.
// It only does what the players could do with the lobby's buttons and the
// owner with the chat. The part that talks to the game lives in lobby-page.js.

const { installLobbyHelper } = require("./lobby-page");

const LOBBY = /^https:\/\/(?:www\.)?kirka\.io\/___lobby___\/([A-Za-z0-9_.-]+)~([A-Za-z0-9_.-]+)$/i;
const isLobbyUrl = (url) => typeof url === "string" && url.length <= 300 && LOBBY.test(url);
const lobbyId = (url) => (isLobbyUrl(url) ? LOBBY.exec(url)[2] : null);

// Kirka's mode ids for each RITE mode, best first.
// A RITE 1v1 is played in TDM with 2 players (one red, one blue).
const MODES = {
  "1v1": ["TDM"],
  "2v2-tdm": ["2V2", "TDM"],
  "2v2-point": ["POINT2V2", "POINT"],
  "3v3-point": ["POINT3V3", "POINT"],
};

// A room or lobby link reduced to what identifies it, whatever the host
// (with or without www.), query or hash: "match" for /games/, "lobby" for a
// party lobby, and the id after the region.
const TARGET = /^https:\/\/(?:www\.)?[A-Za-z0-9.-]+\/(games|___lobby___)\/[A-Za-z0-9_.-]+~([A-Za-z0-9_.-]+)\/?(?:[?#].*)?$/i;
function roomTarget(url) {
  const m = typeof url === "string" && url.length <= 300 ? TARGET.exec(url) : null;
  return m ? { kind: m[1].toLowerCase() === "games" ? "match" : "lobby", id: m[2] } : null;
}

// Whether Kirka is already where a join was headed: its store says it is in
// that lobby or match room, or the page is on that link.
function arrived(target, where, href) {
  if (!target) return false;
  if (where?.ok && where[target.kind] === target.id) return true;
  const here = roomTarget(href);
  return Boolean(here && here.kind === target.kind && here.id === target.id);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// "Entrando…" while a join is on its way: a plain box, no blur or animation,
// so it costs nothing to draw over the game.
function showCover(text) {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483646;pointer-events:none;padding:10px 18px;" +
    "background:#16131c;border:1px solid #3a3324;border-top:2px solid #e0b34a;border-radius:2px;color:#f3d48a;" +
    'font:500 14px/1.2 "Oswald","Arial Narrow",sans-serif;letter-spacing:.14em;text-transform:uppercase;';
  box.textContent = text;
  document.documentElement.append(box);
  return { text: (t) => (box.textContent = t), remove: () => box.remove() };
}

const colorOf = (team) => (team === 0 ? "red" : team === 1 ? "blue" : null);

// Waits between toggles: Kirka's "switch team" and "ready" flip a state, and
// the lobby takes a moment to show the change.
const SETTLE_MS = 3000;
const SWAP_MS = 5000;
// /teamswap tries per player and match: someone who keeps going back to the
// wrong colour is left to the players.
const SWAP_TRIES = 3;
// Starts tried while Kirka won't keep the match's mode or map, before leaving
// it to the owner.
const START_TRIES = 3;

// What the lobby needs next. `done` remembers one-time steps of this match.
function nextStep({ match: m, snap, home, done = {}, now = Date.now(), last = {} }) {
  if (!m || m.game !== "kirka" || m.status !== "abierta" || !m.roomUrl) return null;
  const color = colorOf(m.team);
  if (!color) return null;

  const id = lobbyId(m.roomUrl);
  if (!id) return null; // a room link someone pasted: nothing to set up
  if (!snap?.ok || snap.id !== id) return home && !done.joined ? { do: "join", url: m.roomUrl } : null;
  if (snap.entering) return null;
  if (snap.team !== color) return now - (last.team || 0) >= SETTLE_MS ? { do: "team", color } : null;
  if (!snap.ready) return now - (last.ready || 0) >= SETTLE_MS ? { do: "ready" } : null;

  // Players without the client pick their colour by hand; a wrong one gets
  // fixed in the match room with /teamswap, so only who is there counts here.
  // Never while the map is still being voted.
  if (snap.owner && !done.started && !m.vote) {
    const full = snap.members.length === m.teams[0].length + m.teams[1].length;
    if (full && snap.members.every((p) => p.ready)) return { do: "start" };
  }
  return null;
}

// Who the room owner has to move: one /teamswap at a time, and not the same
// player again until the room has had time to show the swap.
function swapStep({ match: m, room, now = Date.now(), last = {} }) {
  if (!m || m.game !== "kirka" || m.status !== "abierta" || !Array.isArray(m.tags)) return null;
  if (!room?.ok || !room.owner || !room.swap) return null;
  const want = new Map();
  m.tags.forEach((list, team) => (list || []).forEach((tag) => tag && want.set(String(tag).toUpperCase(), colorOf(team))));
  for (const p of room.players || []) {
    const color = want.get(String(p.shortId).toUpperCase());
    if (!color || !["red", "blue"].includes(p.team) || p.team === color) continue;
    if (now - (last[p.shortId] || 0) < SWAP_MS) continue;
    return { do: "swap", shortId: p.shortId, name: p.name, color };
  }
  return null;
}

const DONE_KEY = "rite-lobby-done";
const MADE_KEY = "rite-lobby-made";
const COLOR_KEY = "rite-lobby-color";

// The colour this client had in the match's lobby, for the result.
function lobbyColor(matchId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(COLOR_KEY) || "null");
    return saved && saved.match === matchId && ["red", "blue"].includes(saved.color) ? saved.color : "";
  } catch {
    return "";
  }
}

function createAutoLobby({ api, toast, webFrame, getState, getSettings, onJoining = () => {} }) {
  const page = (code) => webFrame.executeJavaScript(code);
  let installed = null;
  const install = () => (installed ||= page(`(${installLobbyHelper.toString()})(window); true`).catch((error) => ((installed = null), Promise.reject(error))));
  const call = async (name, arg) => {
    await install();
    return page(`window.__riteLobby ? window.__riteLobby.${name}(${arg === undefined ? "" : JSON.stringify(arg)}) : { ok: false }`);
  };

  let done = {};
  try {
    done = JSON.parse(sessionStorage.getItem(DONE_KEY) || "{}");
  } catch {}
  const mark = (matchId, step) => {
    const mine = done.match === matchId ? done : { match: matchId };
    done = { ...mine, [step]: true };
    try {
      sessionStorage.setItem(DONE_KEY, JSON.stringify(done));
    } catch {}
  };
  const last = {};
  const swapped = {};
  // What "Sala rápida" put in the lobby, to put it again right before the start.
  // Kept in localStorage: the owner may go back to the hub and open Kirka again
  // (a new window) before everyone is in.
  let made = null;
  try {
    made = JSON.parse(localStorage.getItem(MADE_KEY) || "null");
  } catch {}
  let startTries = { match: null, n: 0 };
  const tries = {}; // "match:shortId" -> /teamswap sent
  let busy = false;

  const home = () => !document.pointerLockElement && !/^\/games\//.test(location.pathname) && Boolean(document.querySelector("#app > .interface"));

  async function tick() {
    if (busy) return;
    const settings = getSettings();
    if (!settings.scrimsEnabled || settings.scrimsAutoLobby === false) return;
    const state = getState();
    const m = state.me?.match;
    if (!m || m.game !== "kirka" || m.status !== "abierta") return;
    // Only on the home screen, in a lobby, or in this match's room while the
    // owner may still have someone to move.
    const inGames = /^\/games\//.test(location.pathname);
    if (!inGames && document.pointerLockElement) return;
    busy = true;
    try {
      if (inGames) {
        // In the match room: only the one this match uses.
        const here = m.roomUrl && (arrived(roomTarget(m.roomUrl), null, location.href) || lobbyId(m.roomUrl));
        if (!here) return;
        const step = swapStep({ match: m, room: await call("match"), last: swapped });
        if (!step) return;
        swapped[step.shortId] = Date.now();
        const tried = `${m.id}:${step.shortId}`;
        tries[tried] = (tries[tried] || 0) + 1;
        if (tries[tried] > SWAP_TRIES) return;
        const r = await call("chat", `/teamswap #${step.shortId}`);
        if (r?.ok) toast.show(`Pasé a ${step.name || `#${step.shortId}`} al equipo ${step.color === "red" ? "rojo (A)" : "azul (B)"}.`);
        return;
      }
      const snap = await call("snap");
      if (snap?.ok && snap.id === lobbyId(m.roomUrl) && snap.team) {
        try {
          sessionStorage.setItem(COLOR_KEY, JSON.stringify({ match: m.id, color: snap.team }));
        } catch {}
      }
      const step = nextStep({ match: m, snap, home: home(), done: done.match === m.id ? done : {}, last });
      if (!step) return;
      if (step.do === "join") {
        mark(m.id, "joined");
        toast.show("Entrando al lobby de tu partida RITE…");
        await join(step.url);
      } else if (step.do === "team") {
        last.team = Date.now();
        const r = await call("toTeam", step.color);
        if (r?.moved) toast.show(`Te pasé al equipo ${step.color === "red" ? "rojo" : "azul"} (equipo ${step.color === "red" ? "A" : "B"} del bot).`);
      } else if (step.do === "ready") {
        last.ready = Date.now();
        await call("ready");
      } else if (step.do === "start") {
        // Always with the match's mode and map: from what "Sala rápida" made,
        // or rebuilt from the match when this window didn't make the room.
        const settings = made?.match === m.id ? made.settings : await matchSettings(m);
        if (startTries.match !== m.id) startTries = { match: m.id, n: 0 };
        startTries.n += 1;
        const r = await call("start", settings);
        if (r?.ok) {
          mark(m.id, "started");
          toast.show(`Están todos en su equipo y listos: arrancando la partida${settings.map ? ` en ${settings.map}` : ""}.`);
          if (r.code === false) toast.show(`Kirka no tomó el código de ${settings.map}: revisa «Custom map» en los ajustes de la sala.`, "error");
        } else if (r?.wrong && startTries.n >= START_TRIES) {
          mark(m.id, "started");
          const what = r.wrong.includes("mode") ? "el modo" : `el mapa ${settings.map}`;
          toast.show(`No arranqué la partida: Kirka no dejó ${what} en los ajustes de la sala. Ponlo a mano y créala tú.`, "error");
        }
      }
    } catch (error) {
      const why = error?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      if (why) toast.show(`Lobby RITE: ${why}`, "error");
    } finally {
      busy = false;
    }
  }

  // The mode, voted map (or its code from the mapas folder), length and players
  // of a match, as "Sala rápida" puts them.
  async function matchSettings(m) {
    const map = m.map || "";
    const code = map ? await api.mapCode(map).catch(() => "") : "";
    const minutes = Number(getSettings().scrimsRoomMinutes) || 15;
    return { modes: MODES[m.mode] || [], map, code, minutes, players: m.teams[0].length + m.teams[1].length };
  }

  setInterval(tick, 1500);

  // Into a room or lobby link inside Kirka, like its own invites. A full page
  // load freezes slow PCs for seconds, so it is only the last resort: the join
  // counts as done as soon as Kirka's store shows that lobby or room, and
  // while Kirka says it is still joining it gets up to 20 s.
  const JOIN_MS = 8000;
  const JOIN_MAX_MS = 20000;
  const joining = new Set(); // a second click on the same room doesn't join it twice
  async function join(url) {
    const target = roomTarget(url);
    const key = target ? `${target.kind}:${target.id}` : url;
    if (joining.has(key)) return;
    const where = () => call("where").catch(() => null);
    if (target && arrived(target, await where(), location.href)) return;
    joining.add(key);
    onJoining(true);
    const cover = showCover("Entrando…");
    try {
      const r = await call("join", url).catch(() => null);
      if (target) {
        const start = Date.now();
        for (;;) {
          await sleep(400);
          const w = await where();
          if (arrived(target, w, location.href)) return;
          const waited = Date.now() - start;
          if (waited >= JOIN_MAX_MS || (!w?.busy && (!r?.ok || waited >= JOIN_MS))) break;
        }
      }
      cover.text("Recargando para entrar…");
      toast.show("Recargando para entrar…");
      await sleep(600);
      await api.scrimsJoin(url);
    } finally {
      joining.delete(key);
      cover.remove();
      onJoining(joining.size > 0);
    }
  }

  // "Sala rápida" / the gear: moves the party to the region's server, sets the
  // match's mode, map (or the code of a map from the mapas folder), length and
  // players, and sends the lobby link to the bot (the first link wins).
  async function createRoom({ region = "NA", map = "", minutes = 0 } = {}) {
    const m = getState().me?.match;
    if (!m || m.game !== "kirka" || m.status !== "abierta") throw new Error("No tienes una partida de Kirka abierta");
    if (m.roomUrl) throw new Error("Tu partida ya tiene sala");
    // Without a map, Kirka keeps whatever map the lobby had: wait for the vote.
    if (!map && m.vote) throw new Error("Espera a que termine la votación de mapa");
    if (!home()) throw new Error("Ve al menú principal de Kirka para crear la sala");
    let snap = await call("snap");
    // Without a party lobby, open one like Kirka does, and give it a few seconds.
    if (!snap?.ok && ["room", "joining"].includes(snap?.why)) {
      if (snap.why === "room") await call("openLobby");
      const until = Date.now() + 12000;
      while (!snap?.ok && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        snap = await call("snap");
      }
    }
    if (!snap?.ok) throw new Error(`Kirka todavía no carga tu lobby (${snap?.why || "sin respuesta"}), espera unos segundos`);
    if (!snap.owner) throw new Error("Estás en la party de alguien más: sal de ella para crear la sala");
    const mapName = map || m.map || "";
    const code = mapName ? await api.mapCode(mapName).catch(() => "") : "";
    busy = true; // no lobby steps while the party moves
    try {
      const moved = await call("setRegion", region);
      if (!moved?.ok) throw new Error(`Kirka no tiene servidor ${region}`);
      const until = Date.now() + 15000;
      while (moved.moved && !(snap?.ok && snap.region === moved.key && !snap.entering) && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        snap = await call("snap");
      }
      if (!snap?.ok || snap.region !== moved.key) throw new Error(`No se pudo pasar al servidor ${region}, inténtalo otra vez`);
      const players = m.teams[0].length + m.teams[1].length;
      const settings = { modes: MODES[m.mode] || [], map: mapName, code, minutes: Number(minutes) || 0, players };
      const picked = await call("prepare", settings);
      made = { match: m.id, settings };
      try {
        localStorage.setItem(MADE_KEY, JSON.stringify(made));
      } catch {}
      await api.scrimsShareLobby(snap.url);
      mark(m.id, "joined");
      if (picked?.ok && (!picked.mode || (mapName && !picked.map)))
        toast.show(
          `Sala creada, pero revisa los ajustes: no encontré ${!picked.mode ? "el modo" : `el mapa ${mapName} (ni en Kirka ni en Documentos/RITEClient/mapas)`}.`,
          "error"
        );
      else if (!mapName) toast.show(`Sala creada en ${region} con el mapa que tenía tu lobby (la partida no tiene mapa votado). El bot va a poner el link en el hilo de la partida.`);
      else toast.show(`Sala creada en ${region} con ${mapName}${picked?.code ? " (código de la carpeta mapas)" : ""}. El bot va a poner el link en el hilo de la partida.`);
    } finally {
      busy = false;
    }
  }

  // What the gear can offer: Kirka's maps and the ones in the mapas folder.
  async function options() {
    const [kirka, folder] = await Promise.all([call("options").catch(() => null), api.mapsList().catch(() => [])]);
    return { maps: kirka?.ok ? kirka.maps : [], folder: Array.isArray(folder) ? folder : [] };
  }

  return { createRoom, options, join };
}

module.exports = { createAutoLobby, nextStep, swapStep, isLobbyUrl, lobbyId, lobbyColor, roomTarget, arrived, MODES };
