"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { nextStep, swapStep, isLobbyUrl, lobbyId, roomTarget, arrived } = require("../src/preload/features/lobby");
const { installLobbyHelper } = require("../src/preload/features/lobby-page");
const { isRoomUrl, isLobbyUrl: mainIsLobby } = require("../src/main/scrims");

const URL = "https://kirka.io/___lobby___/NA~AbC123";
const match = (over = {}) => ({ id: 7, game: "kirka", mode: "2v2-tdm", map: "Pool", status: "abierta", team: 0, teams: [["Ana", "Beto"], ["Caro", "Dani"]], roomUrl: null, ...over });
const snap = (over = {}) => ({ ok: true, id: "AbC123", url: URL, owner: false, admin: false, team: "red", ready: true, entering: false, members: [], ...over });

test("lobby links", () => {
  assert.ok(isLobbyUrl(URL) && mainIsLobby(URL) && isRoomUrl(URL));
  assert.strictEqual(lobbyId(URL), "AbC123");
  assert.ok(!isLobbyUrl("https://kirka.io/games/NA~AbC123"));
  assert.ok(!isLobbyUrl("https://evil.example/___lobby___/NA~x"));
  assert.ok(!mainIsLobby(`${URL}?x=<script>`));
});

test("without a room link nothing happens by itself (the room is created with the button)", () => {
  assert.strictEqual(nextStep({ match: match(), snap: snap({ owner: true }), home: true }), null);
});

test("players join the lobby, take their colour and get ready", () => {
  const m = match({ roomUrl: URL, team: 1 });
  assert.deepStrictEqual(nextStep({ match: m, snap: { ok: true, id: "other" }, home: true }), { do: "join", url: URL });
  assert.strictEqual(nextStep({ match: m, snap: { ok: true, id: "other" }, home: true, done: { joined: true } }), null);
  assert.deepStrictEqual(nextStep({ match: m, snap: snap({ team: "red" }), home: true }), { do: "team", color: "blue" });
  // Right after a switch, give the lobby time to show it.
  assert.strictEqual(nextStep({ match: m, snap: snap({ team: "red" }), home: true, now: 5000, last: { team: 4000 } }), null);
  assert.deepStrictEqual(nextStep({ match: m, snap: snap({ team: "blue", ready: false }), home: true }), { do: "ready" });
  assert.strictEqual(nextStep({ match: m, snap: snap({ team: "blue" }), home: true }), null);
});

test("the lobby owner starts once the whole match is there and ready", () => {
  const m = match({ roomUrl: URL });
  const members = [
    { team: "red", ready: true },
    { team: "red", ready: true },
    { team: "blue", ready: true },
    { team: "red", ready: true }, // without the client, on the wrong colour: /teamswap fixes it in the room
  ];
  assert.deepStrictEqual(nextStep({ match: m, snap: snap({ owner: true, members }), home: true }), { do: "start" });
  assert.strictEqual(nextStep({ match: m, snap: snap({ owner: true, members }), home: true, done: { started: true } }), null);
  // Not while the map is still being voted: Kirka would start on the lobby's map.
  const voting = { ...m, vote: { maps: ["A", "B"], until: new Date().toISOString(), counts: [0, 0], mine: null } };
  assert.strictEqual(nextStep({ match: voting, snap: snap({ owner: true, members }), home: true }), null);
  assert.strictEqual(nextStep({ match: m, snap: snap({ owner: true, members: members.slice(1) }), home: true }), null);
  const notReady = members.map((p, i) => (i === 3 ? { ...p, ready: false } : p));
  assert.strictEqual(nextStep({ match: m, snap: snap({ owner: true, members: notReady }), home: true }), null);
  assert.strictEqual(nextStep({ match: m, snap: snap({ members }), home: true }), null);
});

test("the page helper moves the party to a region's server", () => {
  const calls = [];
  const game = { currentRegion: "EU", WmWwnMN: { EU: { name: "Europe" }, NA: { name: "North America" }, SA: { name: "South America" } } };
  const store = { state: { game }, commit: (...a) => calls.push(a), dispatch: (...a) => calls.push(a) };
  const saved = {};
  const win = { location: { origin: "https://kirka.io" }, localStorage: { setItem: (k, v) => (saved[k] = v) }, document: { querySelector: () => ({ __vue__: { $store: store } }) } };
  installLobbyHelper(win);
  assert.deepStrictEqual(win.__riteLobby.setRegion("EU"), { ok: true, key: "EU", moved: false });
  assert.deepStrictEqual(win.__riteLobby.setRegion("NA"), { ok: true, key: "NA", moved: true });
  assert.deepStrictEqual(calls, [["game/wWWwMmn", "NA"], ["game/wWnWmw", "NA"], ["game/WwnMmwNW"]]);
  assert.strictEqual(saved.region, "NA");
  assert.strictEqual(win.__riteLobby.setRegion("ASIA").ok, false);
});

test("room links pasted by hand and other games are left alone", () => {
  assert.strictEqual(nextStep({ match: match({ roomUrl: "https://kirka.io/games/NA~x" }), snap: snap(), home: true }), null);
  assert.strictEqual(nextStep({ match: match({ game: "voxarena" }), snap: snap(), home: true }), null);
  assert.strictEqual(nextStep({ match: match({ status: "reportada" }), snap: snap(), home: true }), null);
});

// A stand-in for Kirka's store with the lobby fields the helper reads.
function fakeKirka() {
  const calls = [];
  const members = new Map([
    ["me", { wNmWwWMn: "blue", wnMNWmwW: false }],
    ["you", { wNmWwWMn: "red", wnMNWmwW: true }],
  ]);
  const game = {
    WwnMmN: { id: "AbC123", WwMmwW: "me", state: { wMWNm: members } },
    wWNwmWM: "me",
    wWnWmM: "",
    currentRegion: "NA",
    mods: { "1V1": { id: "1V1", name: "1v1", optionCreate: true, weapons: ["AR"] }, TDM: { id: "TDM", name: "Team Deathmatch", optionCreate: true } },
    maps: { Pool: { name: "Pool", optionCreate: true }, Sandstorm: { name: "Sandstorm", optionCreate: true } },
    WmnwNWwM: { AR: {}, Weatie: {} },
  };
  const store = { state: { game }, commit: (...a) => calls.push(["commit", ...a]), dispatch: (...a) => calls.push(["dispatch", ...a]) };
  const win = { location: { origin: "https://kirka.io" }, document: { querySelector: () => ({ __vue__: { $store: store } }) } };
  installLobbyHelper(win);
  return { lobby: win.__riteLobby, calls, members, game, store };
}

test("the page helper reads the lobby and uses Kirka's own actions", () => {
  const { lobby, calls, members } = fakeKirka();
  const s = lobby.snap();
  assert.strictEqual(s.url, URL);
  assert.strictEqual(s.owner, true);
  assert.strictEqual(s.team, "blue");
  assert.strictEqual(s.ready, false);
  assert.strictEqual(s.members.length, 2);

  assert.deepStrictEqual(lobby.prepare({ modes: ["2V2", "TDM"], map: "pool", code: "{}" }), { ok: true, mode: "TDM", map: "Pool", code: false });
  // Kirka has the map: no map code.
  assert.deepStrictEqual(calls.filter((c) => c[1] === "game/WwmnNwMW").map((c) => c[2]), [""]);
  assert.deepStrictEqual(calls.filter((c) => c[1] === "game/wnNwM").map((c) => c[2]), [{ active: false, name: "1V1" }, { active: true, name: "TDM" }]);
  assert.deepStrictEqual(calls.filter((c) => c[1] === "game/wnNw").map((c) => c[2]), [{ active: true, name: "Pool" }, { active: false, name: "Sandstorm" }]);
  calls.length = 0;
  lobby.prepare({ modes: ["1V1"] });
  assert.deepStrictEqual(calls.filter((c) => c[1] === "game/wmNnWMW").map((c) => c[2]), [{ active: true, name: "AR" }, { active: false, name: "Weatie" }]);

  calls.length = 0;
  assert.strictEqual(lobby.toTeam("blue").moved, false);
  assert.strictEqual(lobby.toTeam("red").moved, true);
  lobby.ready();
  members.get("me").wnMNWmwW = true;
  lobby.ready();
  lobby.start();
  assert.deepStrictEqual(calls, [["dispatch", "game/switchTeamLobby"], ["dispatch", "game/wwnmNWW"], ["dispatch", "game/wwnmNWM", { WwnmNMWw: 0 }]]);
});

test("the start puts the map code in again in case Kirka's sync dropped it", () => {
  const { lobby, calls, game, store } = fakeKirka();
  store.commit = (...a) => {
    calls.push(["commit", ...a]);
    if (a[0] === "game/WwmnNwMW") game.WmWwMNwn = a[1];
  };
  const settings = { modes: ["TDM"], map: "Clash", code: '{"mapName___DATA":"Clash"}', minutes: 8, players: 2 };
  lobby.prepare(settings);
  game.WmWwMNwn = ""; // the party's settings came back from Kirka's server without it
  const r = lobby.start(settings);
  assert.strictEqual(r.code, true);
  const order = calls.map((c) => c[1]);
  assert.ok(order.lastIndexOf("game/WwmnNwMW") < order.indexOf("game/wwnmNWM"));
  assert.strictEqual(game.WmWwMNwn, settings.code);
  // Without what the room was made with, it only starts.
  calls.length = 0;
  assert.strictEqual(lobby.start().code, null);
  assert.deepStrictEqual(calls, [["dispatch", "game/wwnmNWM", { WwnmNMWw: 0 }]]);
});

test("a map Kirka doesn't have goes as its code, with the match's length and players", () => {
  const { lobby, calls } = fakeKirka();
  const r = lobby.prepare({ modes: ["TDM"], map: "Mapa Nuevo", code: '{"blocks":[]}', minutes: 8, players: 6 });
  assert.deepStrictEqual(r, { ok: true, mode: "TDM", map: "Mapa Nuevo", code: true });
  const sent = (name) => calls.filter((c) => c[1] === name).map((c) => c[2]);
  assert.deepStrictEqual(sent("game/WwmnNwMW"), ['{"blocks":[]}']);
  assert.deepStrictEqual(sent("game/setMinutes"), [8]);
  assert.deepStrictEqual(sent("game/wnmWMN"), [6]);
  assert.deepStrictEqual(sent("game/wnNw"), []);
  calls.length = 0;
  // Without a code the map stays as it was; odd values are left alone.
  assert.strictEqual(lobby.prepare({ map: "Mapa Nuevo", minutes: 7, players: 3 }).map, "");
  assert.deepStrictEqual(sent("game/setMinutes"), []);
  assert.deepStrictEqual(sent("game/wnmWMN"), [4]);
  assert.deepStrictEqual(lobby.options(), { ok: true, maps: ["Pool", "Sandstorm"], minutes: [4, 8, 15, 30, 60] });
});

test("the mapas folder: map codes by the map's name", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { listMaps, mapCode } = require("../src/main/maps");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-maps-"));
  fs.writeFileSync(path.join(dir, "Mapa Nuevo.txt"), '\uFEFF {"blocks":[1]}\n');
  fs.writeFileSync(path.join(dir, "Otro.json"), "{}");
  fs.writeFileSync(path.join(dir, "vacio.txt"), "");
  fs.writeFileSync(path.join(dir, "nota.md"), "x");
  assert.deepStrictEqual(listMaps(dir), ["Mapa Nuevo", "Otro"]);
  assert.strictEqual(mapCode(dir, "mapa-nuevo"), '{"blocks":[1]}');
  assert.strictEqual(mapCode(dir, "Pool"), "");
  assert.strictEqual(mapCode(dir, ""), "");
  assert.deepStrictEqual(listMaps(path.join(dir, "no-existe")), []);
});

test("with no party lobby the helper says why and can open one", () => {
  const calls = [];
  const game = { WwnMmN: null, wnNwMmW: false };
  const store = { state: { game }, dispatch: (...a) => calls.push(a) };
  const win = { location: { origin: "https://kirka.io" }, document: { querySelector: () => ({ __vue__: { $store: store } }) } };
  installLobbyHelper(win);
  assert.deepStrictEqual(win.__riteLobby.snap(), { ok: false, why: "room" });
  assert.deepStrictEqual(win.__riteLobby.openLobby(), { ok: true });
  assert.deepStrictEqual(calls, [["game/WwnMmwNW"]]);
  game.wnNwMmW = true;
  assert.strictEqual(win.__riteLobby.snap().why, "joining");
  assert.deepStrictEqual(win.__riteLobby.openLobby(), { ok: false });
  game.WwnMmN = { id: "x", state: {} };
  assert.strictEqual(win.__riteLobby.snap().why, "members");
});

test("the page helper finds Kirka's app under a renamed property", () => {
  const game = { WwnMmN: { id: "AbC123", WwMmwW: "me", state: { wMWNm: new Map([["me", { wNmWwWMn: "red", wnMNWmwW: true }]]) } }, wWNwmWM: "me", currentRegion: "NA" };
  const el = { WmnWMwwN: { $store: { state: { game } } } };
  const win = { location: { origin: "https://kirka.io" }, document: { querySelector: () => el } };
  installLobbyHelper(win);
  assert.strictEqual(win.__riteLobby.snap().url, URL);
  delete el.WmnWMwwN;
  el.zZz = { $store: { state: { game } } };
  assert.strictEqual(win.__riteLobby.snap().owner, true);
});

test("the page helper joins room links inside Kirka, without reloading", () => {
  const calls = [];
  const game = { WwnMmN: null, wnNwMmW: false };
  const store = { state: { game }, dispatch: (...a) => calls.push(a) };
  const win = { location: { origin: "https://kirka.io" }, document: { querySelector: () => ({ __vue__: { $store: store } }) } };
  installLobbyHelper(win);
  assert.deepStrictEqual(win.__riteLobby.join(URL), { ok: true });
  assert.deepStrictEqual(win.__riteLobby.join("https://kirka.io/games/EU~a1B2c3"), { ok: true });
  assert.deepStrictEqual(calls, [["game/WwnMmwNW", "NA~AbC123"], ["game/WwwNMW", { id: "EU~a1B2c3" }]]);
  assert.strictEqual(win.__riteLobby.join("https://kirka.io/servers/main").ok, false);
  game.wnNwMmW = true;
  assert.strictEqual(win.__riteLobby.join(URL).ok, false);
});

test("the page helper answers ok: false when Kirka's store isn't there", () => {
  const win = { location: { origin: "https://kirka.io" }, document: { querySelector: () => null } };
  installLobbyHelper(win);
  assert.deepStrictEqual(win.__riteLobby.snap(), { ok: false, why: "store" });
  assert.deepStrictEqual(win.__riteLobby.start(), { ok: false });
});

test("the room owner swaps players on the wrong colour, one at a time", () => {
  const m = match({ roomUrl: "https://kirka.io/games/NA~x", tags: [["ANA1", "BETO2"], ["CARO3", ""]] });
  const players = [
    { shortId: "ana1", name: "Ana", team: "red" },
    { shortId: "BETO2", name: "Beto", team: "blue" },
    { shortId: "CARO3", name: "Caro", team: "red" },
    { shortId: "ZZZ9", name: "Otro", team: "blue" },
  ];
  const room = { ok: true, owner: true, swap: true, players };
  assert.deepStrictEqual(swapStep({ match: m, room, now: 10000 }), { do: "swap", shortId: "BETO2", name: "Beto", color: "red" });
  assert.deepStrictEqual(swapStep({ match: m, room, now: 10000, last: { BETO2: 9000 } }), { do: "swap", shortId: "CARO3", name: "Caro", color: "blue" });
  assert.strictEqual(swapStep({ match: m, room: { ...room, owner: false } }), null);
  assert.strictEqual(swapStep({ match: m, room: { ...room, swap: false } }), null);
  assert.strictEqual(swapStep({ match: { ...m, tags: undefined }, room }), null);
  const fixed = players.map((p) => (p.shortId === "BETO2" ? { ...p, team: "red" } : p.shortId === "CARO3" ? { ...p, team: "blue" } : p));
  assert.strictEqual(swapStep({ match: m, room: { ...room, players: fixed } }), null);
});

test("the page helper reads the match room and sends /teamswap through the chat box", () => {
  const sent = [];
  const chatBox = { $options: { methods: { applySelectedCommand() {} } }, commands: [{ name: "roles" }, { name: "teamswap" }], text: "", handler() { sent.push(this.text); }, $children: [] };
  const other = { $options: { methods: { applySelectedCommand() {} } }, commands: [{ name: "roles" }], handler() { sent.push("wrong"); }, $children: [] };
  const players = new Map([["s1", { wMWNnmwW: "ANA1", wNmWwnW: "Ana", wNmWwWMn: "red" }]]);
  const store = { state: { game: { WnmwwWNM: { WwMmwW: "s1", state: { wMWNm: players } } }, chat: { commands: [{ name: "teamswap" }, { name: "setadmin" }] } } };
  const root = { $store: store, $children: [other, { $children: [chatBox] }] };
  const win = { location: { origin: "https://kirka.io" }, document: { querySelector: () => ({ __vue__: root }) } };
  installLobbyHelper(win);
  assert.deepStrictEqual(win.__riteLobby.match(), { ok: true, owner: true, swap: true, players: [{ id: "s1", me: true, shortId: "ANA1", name: "Ana", team: "red" }] });
  assert.deepStrictEqual(win.__riteLobby.chat("/teamswap #ANA1"), { ok: true });
  assert.deepStrictEqual(sent, ["/teamswap #ANA1"]);
});

test("a join counts as done by Kirka's store or the link, whatever www., query or hash", () => {
  const lobby = roomTarget("https://kirka.io/___lobby___/NA~abc123");
  const room = roomTarget("https://www.kirka.io/games/EU~Xy9?x=1#top");
  assert.deepStrictEqual(lobby, { kind: "lobby", id: "abc123" });
  assert.deepStrictEqual(room, { kind: "match", id: "Xy9" });
  assert.strictEqual(roomTarget("https://kirka.io/servers/main"), null);
  assert.ok(arrived(lobby, { ok: true, lobby: "abc123", match: "" }, "https://kirka.io/"));
  assert.ok(!arrived(lobby, { ok: true, lobby: "other", match: "" }, "https://kirka.io/"));
  assert.ok(arrived(room, { ok: false }, "https://kirka.io/games/EU~Xy9"));
  assert.ok(!arrived(room, { ok: true, lobby: "Xy9", match: "" }, "https://kirka.io/"));
  assert.ok(!arrived(null, { ok: true }, "https://kirka.io/"));
});
