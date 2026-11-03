"use strict";

// The part of the RITE lobby that has to run in the page's own world: it talks
// to Kirka's party lobby through the game's own store, the same calls its
// buttons make (switch team, ready, create the match). Nothing here touches the
// match itself. It is injected as source, so it must not use anything from
// outside the function.
//
// Kirka's code renames most of its fields, even the "game" module of its store;
// these names come from its app.js (30/10/2026, app.0312c6a3.js) and change
// with each Kirka build. Until they are fixed every call answers { ok: false }
// instead of doing something else. The module itself is found by what it holds.
function installLobbyHelper(win) {
  const K = {
    modules: ["mwwnWMN", "game"], // state.<module>: the store module with the lobby (found by its content if renamed)
    room: "WnwMwWNm", // the party lobby (a Colyseus room)
    sessionId: "WmwNWnMw", // the room's own session id
    members: "wMNWWnmw", // room.state: MapSchema of the people in the party
    team: "wwMnWm", // "red" | "blue"
    ready: "wNWWn",
    owner: "wWwmMWNn", // game: session id of the party owner
    admins: "wWNmMn", // game: session ids of the admins, comma separated
    entering: "wnwMNWmW", // game: true while the party goes into a match
    joining: "wNwnWW", // game: true while Kirka is opening the party lobby
    weapons: "WNWnMmww", // game: weapons; also a mode's list of weapons
    weaponOn: "wNwnmWW", // weapons[name]: allowed for the players (bots have their own)
    setMode: "wNwnmWMW", // commit { active, name } for a mode
    setMap: "wNwnmWM", // commit { active, name } for a map
    setWeapon: "wMWWNmnw", // commit { active, name } for a weapon
    setMapCode: "WwWnmMw", // commit: the "map code" of the match settings ("" = none)
    mapCode: "WWwwNMm", // game: that map code, which the create sends as is
    setMinutes: "setMinutes", // commit: game duration (4, 8, 15, 30 or 60)
    setMaxPlayers: "wnwMNW", // commit: maximum players (2, 4, 6, 8, 16 or 50)
    maxPlayers: "WwWMwnmN", // game: that maximum
    toggleReady: "WwwMWNnm",
    switchTeam: "switchTeamLobby",
    create: "WwwMWNmn", // creates the custom match for everyone in the party
    bots: "WnwmWwMN", // option of create: how many bots
    match: "mwwnWMNW", // game: the match room the player is in
    regions: "WWww", // game: Kirka's servers by region
    pickRegion: "wmWwnNMW", // commit: the region picked on the home screen
    useRegion: "wWNmMW", // dispatch: switch to that region
    rejoin: "WnwMwWN", // dispatch: open the party lobby again (in the new region), or join "REGION~id"
    joinGame: "WnWMNw", // dispatch { id: "REGION~id" }: go into a match room
    shortId: "wMNWWm", // a player's #ID
    name: "wwMnWmW",
    vue: ["__vue__", "WWwMwnNm"], // where Vue keeps an element's instance
    noThrottle: "wnmwWNM", // option of the chat handler: send without the chat's wait
  };
  const ROOM_SEP = "~";
  const norm = (text) => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Kirka's root Vue instance. Vue keeps it on its element as `__vue__`, but
  // Kirka's code renames that too, so it is looked up by what it is: the
  // property of #app that holds the store.
  const app = () => {
    const el = win.document.querySelector("#app");
    if (!el) return null;
    for (const key of [...K.vue, ...Object.keys(el)]) {
      const vm = el[key];
      if (vm && typeof vm === "object" && vm.$store && vm.$store.state) return vm;
    }
    return null;
  };
  const store = () => {
    const vm = app();
    return (vm && vm.$store) || null;
  };
  // The store module with the lobby and the match settings: the one with the
  // region, the modes and the maps.
  const isGame = (v) => Boolean(v && typeof v === "object" && "currentRegion" in v && v.mods && v.maps);
  function moduleKey(s) {
    const state = s && s.state;
    if (!state) return null;
    const known = K.modules.find((key) => state[key] && typeof state[key] === "object");
    return known || Object.keys(state).find((key) => isGame(state[key])) || null;
  }
  const gameOf = (s) => {
    const key = moduleKey(s);
    return key ? s.state[key] : null;
  };
  // A mutation or action of that module.
  const call = (s, kind, name, ...args) => s[kind](`${moduleKey(s)}/${name}`, ...args);
  const commit = (s, name, ...args) => call(s, "commit", name, ...args);
  const dispatch = (s, name, ...args) => call(s, "dispatch", name, ...args);
  // Modes a custom match can be created with (Kirka only sends the default ones).
  const creatable = (m) => Boolean(m && m.optionCreate && m.isDefault !== false);

  function read() {
    const s = store();
    const game = gameOf(s);
    const room = game && game[K.room];
    if (!room || !room.id || !room.state || !room.state[K.members]) return null;
    return { s, game, room };
  }

  // Why there is no lobby to read: no store, no lobby room, or a room without members yet.
  function missing() {
    const s = store();
    if (!s) return "store";
    const game = gameOf(s);
    // A store without these names: a Kirka update renamed them.
    if (!game || !(K.room in game) || !(K.joining in game)) return "names";
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
    const modeList = Object.entries(game.mods || {}).filter(([, m]) => creatable(m));
    let mode = null;
    for (const want of modes) {
      mode = modeList.find(([key, m]) => [key, m.id, m.name].some((v) => norm(v) === norm(want)));
      if (mode) break;
    }
    if (mode) {
      for (const [key] of modeList) commit(s, K.setMode, { active: key === mode[0], name: key });
      const weapons = mode[1][K.weapons] || mode[1].weapons;
      if (Array.isArray(weapons)) for (const name in game[K.weapons] || {}) commit(s, K.setWeapon, { active: weapons.includes(name), name });
    }
    let picked = null;
    if (map) {
      const maps = Object.entries(game.maps || {}).filter(([, m]) => m && m.optionCreate);
      picked = maps.find(([key, m]) => norm(key) === norm(map) || norm(m.name) === norm(map));
      if (picked) for (const [key] of maps) commit(s, K.setMap, { active: key === picked[0], name: key });
    }
    // Kirka's own map wins; the code is only for maps it doesn't have.
    const useCode = !picked && Boolean(code);
    commit(s, K.setMapCode, useCode ? String(code) : "");
    if (MINUTES.includes(Number(minutes))) commit(s, K.setMinutes, Number(minutes));
    const room = PLAYERS.find((n) => n >= Number(players));
    if (Number(players) > 0 && room) commit(s, K.setMaxPlayers, room);
    return { ok: true, mode: mode ? mode[0] : "", map: picked ? picked[0] : useCode ? map : "", code: useCode };
  }

  // The maps Kirka offers for a custom match, for the room settings.
  function options() {
    const s = store();
    const game = gameOf(s);
    if (!game) return { ok: false };
    const maps = Object.entries(game.maps || {})
      .filter(([, m]) => m && m.optionCreate)
      .map(([key, m]) => String(m.name || key));
    return { ok: true, maps, minutes: MINUTES };
  }

  // Opens the party lobby when Kirka has none (the same Kirka does after losing it).
  function openLobby() {
    const s = store();
    const game = gameOf(s);
    if (!game || game[K.room] || game[K.joining]) return { ok: false };
    dispatch(s, K.rejoin);
    return { ok: true };
  }

  // Goes into a RITE room link the way Kirka's own invites do, without loading
  // the whole page again (a reload freezes slow PCs for several seconds).
  function join(url) {
    const s = store();
    const game = gameOf(s);
    const m = /^\/(games|___lobby___)\/([A-Za-z0-9_.-]+~[A-Za-z0-9_.-]+)$/.exec(String(url || "").replace(/^https:\/\/[^/]+/, ""));
    if (!game || !m || game[K.joining] || game[K.entering]) return { ok: false };
    if (m[1] === "games") dispatch(s, K.joinGame, { id: m[2] });
    else dispatch(s, K.rejoin, m[2]);
    return { ok: true };
  }

  // Where Kirka is right now: the ids of its party lobby and match room, and
  // whether it is still on its way into one. The RITE lobby checks a join
  // with this instead of comparing URLs.
  function where() {
    const s = store();
    const game = gameOf(s);
    if (!game) return { ok: false, busy: false };
    const lobby = game[K.room];
    const room = game[K.match];
    return { ok: true, lobby: (lobby && lobby.id) || "", match: (room && room.id) || "", busy: Boolean(game[K.joining] || game[K.entering]) };
  }

  function toTeam(color) {
    const r = read();
    const now = snap();
    if (!r || !now.ok || !color || now.team === color) return { ok: Boolean(r), moved: false };
    dispatch(r.s, K.switchTeam);
    return { ok: true, moved: true };
  }

  function ready() {
    const r = read();
    const now = snap();
    if (!r || !now.ok || now.ready) return { ok: Boolean(r), changed: false };
    dispatch(r.s, K.toggleReady);
    return { ok: true, changed: true };
  }

  // What the create will send: Kirka's create reads mode, maps, map code and
  // players straight from its store module (modes and maps are toggles: every one
  // with activeCreate goes).
  function current() {
    const r = read();
    if (!r) return { ok: false };
    const { game } = r;
    const active = (list) =>
      Object.entries(list || {})
        .filter(([, m]) => m && m.optionCreate && m.activeCreate && (list !== game.mods || creatable(m)))
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
    dispatch(r.s, K.create, { [K.bots]: 0 });
    return { ok: true, mode: picked ? picked.mode : "", map: picked ? picked.map : "", code, now };
  }

  // The match room: the player's role there (from the chat commands the server
  // gave them) and who is on each colour.
  function match() {
    const s = store();
    const game = gameOf(s);
    const room = game && game[K.match];
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
  // Kirka renames the component's options too, so it is found by what it has:
  // a send handler, the typed text and the chat commands (with /teamswap).
  const isChatBox = (vm) =>
    Boolean(vm && typeof vm.handler === "function" && typeof vm.text === "string" && Array.isArray(vm.commands) && vm.commands.some((c) => c && c.name === "teamswap"));
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
    vm.handler({ bypassThrottle: true, [K.noThrottle]: true });
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
    const game = gameOf(s);
    if (!game) return { ok: false };
    const key = regionKey(game, name);
    if (!key) return { ok: false, regions: Object.keys(game[K.regions] || {}) };
    if (game.currentRegion === key) return { ok: true, key, moved: false };
    commit(s, K.pickRegion, key);
    dispatch(s, K.useRegion, key);
    try {
      win.localStorage.setItem("region", key);
    } catch (e) {}
    dispatch(s, K.rejoin);
    return { ok: true, key, moved: true };
  }

  win.__riteLobby = { snap, where, openLobby, join, prepare, current, options, toTeam, ready, start, match, chat, setRegion };
}

module.exports = { installLobbyHelper };
