"use strict";

// The part of the RITE lobby that has to run in the page's own world: it talks
// to Kirka's party lobby through the game's own store, the same calls its
// buttons make (switch team, ready, create the match). Nothing here touches the
// match itself. It is injected as source, so it must not use anything from
// outside the function.
//
// Kirka's code renames most of its fields; these names come from its app.js
// (13/10/2026). If a Kirka update renames them, this is the only place to fix,
// and until then every call answers { ok: false } instead of doing something else.
function installLobbyHelper(win) {
  const K = {
    room: "WwnMmN", // state.game: the party lobby (a Colyseus room)
    sessionId: "WwMmwW", // the room's own session id
    members: "wMWNm", // room.state: MapSchema of the people in the party
    team: "wNmWwWMn", // "red" | "blue"
    ready: "wnMNWmwW",
    owner: "wWNwmWM", // state.game: session id of the party owner
    admins: "wWnWmM", // state.game: session ids of the admins, comma separated
    entering: "wnmWMNwW", // state.game: true while the party goes into a match
    joining: "wnNwMmW", // state.game: true while Kirka is opening the party lobby
    weapons: "WmnwNWwM", // state.game: weapons the match allows
    setMode: "game/wnNwM", // commit { active, name } for a mode
    setMap: "game/wnNw", // commit { active, name } for a map
    setWeapon: "game/wmNnWMW", // commit { active, name } for a weapon
    setMapCode: "game/WwmnNwMW", // commit: the "map code" of the match settings ("" = none)
    mapCode: "WmWwMNwn", // state.game: that map code, which the create sends as is
    setMinutes: "game/setMinutes", // commit: game duration (4, 8, 15, 30 or 60)
    setMaxPlayers: "game/wnmWMN", // commit: maximum players (2, 4, 6, 8, 16 or 50)
    maxPlayers: "WwmnMwN", // state.game: that maximum
    toggleReady: "game/wwnmNWW",
    switchTeam: "game/switchTeamLobby",
    create: "game/wwnmNWM", // creates the custom match for everyone in the party
    bots: "WwnmNMWw", // option of create: how many bots
    match: "WnmwwWNM", // state.game: the match room the player is in
    regions: "WmWwnMN", // state.game: Kirka's servers by region
    pickRegion: "game/wWWwMmn", // commit: the region picked on the home screen
    useRegion: "game/wWnWmw", // dispatch: switch to that region
    rejoin: "game/WwnMmwNW", // dispatch: open the party lobby again (in the new region), or join "REGION~id"
    joinGame: "game/WwwNMW", // dispatch { id: "REGION~id" }: go into a match room
    shortId: "wMWNnmwW", // a player's #ID
    name: "wNmWwnW",
  };
  const ROOM_SEP = "~";
  const norm = (text) => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Kirka's root Vue instance. Vue keeps it on its element as `__vue__`, but
  // Kirka's code renames that too ("WmnWMwwN" on 13/10/2026), so it is looked
  // up by what it is: the property of #app that holds the store.
  const app = () => {
    const el = win.document.querySelector("#app");
    if (!el) return null;
    for (const key of ["__vue__", "WmnWMwwN", ...Object.keys(el)]) {
      const vm = el[key];
      if (vm && typeof vm === "object" && vm.$store && vm.$store.state) return vm;
    }
    return null;
  };
  const store = () => {
    const vm = app();
    return (vm && vm.$store) || null;
  };

  function read() {
    const s = store();
    const game = s && s.state && s.state.game;
    const room = game && game[K.room];
    if (!room || !room.id || !room.state || !room.state[K.members]) return null;
    return { s, game, room };
  }

  // Why there is no lobby to read: no store, no lobby room, or a room without members yet.
  function missing() {
    const s = store();
    const game = s && s.state && s.state.game;
    if (!game) return "store";
    const room = game[K.room];
    if (!room) return game[K.joining] ? "joining" : "room";
    return !room.state ? "state" : !room.state[K.members] ? "members" : "id";
  }

  function snap() {
    const r = read();
    if (!r) return { ok: false, why: missing() };
    const { game, room } = r;
    const me = room[K.sessionId];
    const members = [];
    room.state[K.members].forEach((m, id) => members.push({ id, team: m[K.team] || "", ready: Boolean(m[K.ready]) }));
    const mine = members.find((m) => m.id === me) || null;
    const admins = String(game[K.admins] || "").split(",");
    return {
      ok: true,
      id: room.id,
      url: `${win.location.origin}/___lobby___/${game.currentRegion}${ROOM_SEP}${room.id}`,
      region: game.currentRegion || "",
      owner: Boolean(me) && game[K.owner] === me,
      admin: Boolean(me) && admins.includes(me),
      team: mine ? mine.team : "",
      ready: mine ? mine.ready : false,
      entering: Boolean(game[K.entering]),
      members,
    };
  }

  // Picks the RITE mode and map in the match settings. `modes` are the names to
  // try in order (Kirka's mode ids, like "1V1" or "POINT3V3"). A map Kirka
  // doesn't have goes as a map code (`code`); `minutes` and `players` are the
  // match length and the maximum players.
  const MINUTES = [4, 8, 15, 30, 60];
  const PLAYERS = [2, 4, 6, 8, 16, 50];
  function prepare({ modes = [], map = "", code = "", minutes = 0, players = 0 } = {}) {
    const r = read();
    if (!r) return { ok: false };
    const { s, game } = r;
    const modeList = Object.entries(game.mods || {}).filter(([, m]) => m && m.optionCreate);
    let mode = null;
    for (const want of modes) {
      mode = modeList.find(([key, m]) => [key, m.id, m.name].some((v) => norm(v) === norm(want)));
      if (mode) break;
    }
    if (mode) {
      for (const [key] of modeList) s.commit(K.setMode, { active: key === mode[0], name: key });
      const weapons = mode[1].weapons;
      if (Array.isArray(weapons)) for (const name in game[K.weapons] || {}) s.commit(K.setWeapon, { active: weapons.includes(name), name });
    }
    let picked = null;
    if (map) {
      const maps = Object.entries(game.maps || {}).filter(([, m]) => m && m.optionCreate);
      picked = maps.find(([key, m]) => norm(key) === norm(map) || norm(m.name) === norm(map));
      if (picked) for (const [key] of maps) s.commit(K.setMap, { active: key === picked[0], name: key });
    }
    // Kirka's own map wins; the code is only for maps it doesn't have.
    const useCode = !picked && Boolean(code);
    s.commit(K.setMapCode, useCode ? String(code) : "");
    if (MINUTES.includes(Number(minutes))) s.commit(K.setMinutes, Number(minutes));
    const room = PLAYERS.find((n) => n >= Number(players));
    if (Number(players) > 0 && room) s.commit(K.setMaxPlayers, room);
    return { ok: true, mode: mode ? mode[0] : "", map: picked ? picked[0] : useCode ? map : "", code: useCode };
  }

  // The maps Kirka offers for a custom match, for the room settings.
  function options() {
    const s = store();
    const game = s && s.state && s.state.game;
    if (!game) return { ok: false };
    const maps = Object.entries(game.maps || {})
      .filter(([, m]) => m && m.optionCreate)
      .map(([key, m]) => String(m.name || key));
    return { ok: true, maps, minutes: MINUTES };
  }

  // Opens the party lobby when Kirka has none (the same Kirka does after losing it).
  function openLobby() {
    const s = store();
    const game = s && s.state && s.state.game;
    if (!game || game[K.room] || game[K.joining]) return { ok: false };
    s.dispatch(K.rejoin);
    return { ok: true };
  }

  // Goes into a RITE room link the way Kirka's own invites do, without loading
  // the whole page again (a reload freezes slow PCs for several seconds).
  function join(url) {
    const s = store();
    const game = s && s.state && s.state.game;
    const m = /^\/(games|___lobby___)\/([A-Za-z0-9_.-]+~[A-Za-z0-9_.-]+)$/.exec(String(url || "").replace(/^https:\/\/[^/]+/, ""));
    if (!game || !m || game[K.joining] || game[K.entering]) return { ok: false };
    if (m[1] === "games") s.dispatch(K.joinGame, { id: m[2] });
    else s.dispatch(K.rejoin, m[2]);
    return { ok: true };
  }

  // Where Kirka is right now: the ids of its party lobby and match room, and
  // whether it is still on its way into one. The RITE lobby checks a join
  // with this instead of comparing URLs.
  function where() {
    const s = store();
    const game = s && s.state && s.state.game;
    if (!game) return { ok: false, busy: false };
    const lobby = game[K.room];
    const room = game[K.match];
    return { ok: true, lobby: (lobby && lobby.id) || "", match: (room && room.id) || "", busy: Boolean(game[K.joining] || game[K.entering]) };
  }

  function toTeam(color) {
    const r = read();
    const now = snap();
    if (!r || !now.ok || !color || now.team === color) return { ok: Boolean(r), moved: false };
    r.s.dispatch(K.switchTeam);
    return { ok: true, moved: true };
  }

  function ready() {
    const r = read();
    const now = snap();
    if (!r || !now.ok || now.ready) return { ok: Boolean(r), changed: false };
    r.s.dispatch(K.toggleReady);
    return { ok: true, changed: true };
  }

  // What the create will send: Kirka's create reads mode, maps, map code and
  // players straight from state.game (modes and maps are toggles: every one
  // with activeCreate goes).
  function current() {
    const r = read();
    if (!r) return { ok: false };
    const { game } = r;
    const active = (list) =>
      Object.entries(list || {})
        .filter(([, m]) => m && m.optionCreate && m.activeCreate)
        .map(([key]) => key);
    return { ok: true, modes: active(game.mods), maps: active(game.maps), code: String(game[K.mapCode] || ""), players: Number(game[K.maxPlayers]) || 0 };
  }

  // What is off between `picked` (what prepare chose) and what Kirka would send.
  function wrong(settings, picked, now) {
    const off = [];
    if (picked.mode && !(now.modes.length === 1 && now.modes[0] === picked.mode)) off.push("mode");
    if (picked.map && !picked.code && !(now.maps.length === 1 && now.maps[0] === picked.map)) off.push("map");
    if (picked.code && now.code !== String(settings.code)) off.push("code");
    return off;
  }

  // Creates the match. With `settings` (the match's mode, map or map code,
  // length and players) they go in again first and are read back: if Kirka
  // would not send them, it doesn't create the match, so nobody lands on the
  // wrong map.
  function start(settings) {
    const r = read();
    if (!r) return { ok: false };
    const picked = settings ? prepare(settings) : null;
    const now = picked ? current() : null;
    const off = picked && now.ok ? wrong(settings, picked, now) : [];
    if (off.length) return { ok: false, wrong: off, mode: picked.mode, map: picked.map, now };
    const code = settings && settings.code && picked && picked.code ? String(r.game[K.mapCode] || "") === String(settings.code) : null;
    r.s.dispatch(K.create, { [K.bots]: 0 });
    return { ok: true, mode: picked ? picked.mode : "", map: picked ? picked.map : "", code, now };
  }

  // The match room: the player's role there (from the chat commands the server
  // gave them) and who is on each colour.
  function match() {
    const s = store();
    const room = s && s.state && s.state.game && s.state.game[K.match];
    if (!room || !room.state || !room.state[K.members]) return { ok: false };
    const commands = ((s.state.chat && s.state.chat.commands) || []).map((c) => c && c.name);
    const players = [];
    room.state[K.members].forEach((p, id) =>
      players.push({ id, me: id === room[K.sessionId], shortId: String(p[K.shortId] || ""), name: String(p[K.name] || ""), team: p[K.team] || "" })
    );
    return { ok: true, owner: commands.includes("setadmin"), swap: commands.includes("teamswap"), players };
  }

  // Sends a chat command the way the chat box does (Kirka's own chat component).
  // The component is found once and kept while Kirka keeps it on screen.
  let chatBox = null;
  const isChatBox = (vm) => {
    const methods = vm && vm.$options && vm.$options.methods;
    return Boolean(methods && methods.applySelectedCommand && typeof vm.handler === "function" && (vm.commands || []).some((c) => c && c.name === "teamswap"));
  };
  function findChat() {
    if (chatBox && !chatBox._isDestroyed && isChatBox(chatBox)) return chatBox;
    chatBox = null;
    const root = app();
    const queue = root ? [root] : [];
    while (queue.length) {
      const vm = queue.shift();
      if (isChatBox(vm)) return (chatBox = vm);
      queue.push(...(vm.$children || []));
    }
    return null;
  }
  function chat(text) {
    const vm = findChat();
    if (!vm) return { ok: false };
    vm.text = text;
    vm.handler({ bypassThrottle: true });
    return { ok: true };
  }

  // Moves the player's party to a region's server, like picking it on the
  // home screen. `name` is "NA", "SA" or "EU".
  const ALIASES = { NA: ["NA", "NORTHAMERICA", "US", "USA"], SA: ["SA", "SOUTHAMERICA", "BR", "BRAZIL", "LATAM"], EU: ["EU", "EUROPE"] };
  function regionKey(game, name) {
    const want = ALIASES[norm(name)] || [norm(name)];
    const list = Object.entries(game[K.regions] || {});
    const hit = list.find(([key, r]) => want.includes(norm(key)) || want.includes(norm(r && r.name)));
    return hit ? hit[0] : null;
  }
  function setRegion(name) {
    const s = store();
    const game = s && s.state && s.state.game;
    if (!game) return { ok: false };
    const key = regionKey(game, name);
    if (!key) return { ok: false, regions: Object.keys(game[K.regions] || {}) };
    if (game.currentRegion === key) return { ok: true, key, moved: false };
    s.commit(K.pickRegion, key);
    s.dispatch(K.useRegion, key);
    try {
      win.localStorage.setItem("region", key);
    } catch (e) {}
    s.dispatch(K.rejoin);
    return { ok: true, key, moved: true };
  }

  win.__riteLobby = { snap, where, openLobby, join, prepare, current, options, toTeam, ready, start, match, chat, setRegion };
}

module.exports = { installLobbyHelper };
