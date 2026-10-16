"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Scrims, isRoomUrl, isDiscordUrl, pollDelay, API } = require("../src/main/scrims");

test("only Kirka room links and Discord channels are followed", () => {
  assert.ok(isRoomUrl("https://kirka.io/games/EU~a1B2c3"));
  assert.ok(!isRoomUrl("https://kirka.io/servers/main"));
  assert.ok(!isRoomUrl("https://evil.example/?u=https://kirka.io/games/x"));
  assert.ok(!isRoomUrl("javascript:alert(1)"));
  assert.ok(isDiscordUrl("https://discord.com/channels/123/456"));
  assert.ok(!isDiscordUrl("https://discord.com.evil.example/channels/1/2"));
  assert.ok(API.href.startsWith("https://riteweb.up.railway.app/api/client/"));
});

test("polls faster while the player has to act", () => {
  assert.strictEqual(pollDelay({ linked: true, me: { queue: { check: { id: "c", ready: false } } } }), 2000);
  assert.strictEqual(pollDelay({ linked: true, me: { queue: { check: { id: "c", ready: true } } } }), 5000);
  assert.strictEqual(pollDelay({ linked: true, me: { match: { id: 1, roomUrl: null } } }), 3000);
  assert.strictEqual(pollDelay({ linked: false }), 5000);
  const vote = { maps: ["A", "B"], until: "", counts: [0, 0], mine: null };
  assert.strictEqual(pollDelay({ linked: true, me: { match: { id: 1, roomUrl: null, vote } } }), 2000);
  assert.strictEqual(pollDelay({ linked: true, me: { match: { id: 1, roomUrl: null, vote } } }, { focused: false }), 5000);
  // A map got the votes: one ask right when the 3 s countdown ends.
  const won = { ...vote, winner: 1, until: new Date(10000).toISOString() };
  assert.strictEqual(pollDelay({ linked: true, me: { match: { id: 1, roomUrl: null, vote: won } } }, { now: 7000 }), 3300);
});

test("polls slowly in a match, with nothing going on or in the background", () => {
  const room = { linked: true, me: { match: { id: 1, roomUrl: "https://kirka.io/games/NA~x" } } };
  assert.strictEqual(pollDelay(room), 15000);
  assert.strictEqual(pollDelay({ linked: true, me: {} }), 20000);
  assert.strictEqual(pollDelay({ linked: true, me: { queue: { game: "kirka" } } }, { focused: false }), 15000);
  assert.strictEqual(pollDelay({ linked: true, me: { queue: { check: { id: "c", ready: false } } } }, { focused: false }), 2000);
});

test("the same answer from RITE WEB is not sent to the page twice", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-scrims-"));
  fs.writeFileSync(path.join(dir, "rite-scrims.json"), JSON.stringify({ token: "t".repeat(43) }));
  let queues = [];
  const { fetch } = fakeApi({ state: () => [200, { linked: true, queues }] });
  const sent = [];
  const scrims = new Scrims({ dir, fetch, onState: (s) => sent.push(s) });
  scrims.enabled = true;
  await scrims.poll();
  await scrims.poll();
  queues = [{ game: "kirka", mode: "1v1", players: ["a"] }];
  await scrims.poll();
  clearTimeout(scrims.timer);
  assert.strictEqual(sent.length, 2);
});

function fakeApi(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const route = new URL(url).pathname.replace("/api/client/", "");
    calls.push({ route, auth: init.headers?.authorization, body: init.body });
    const [status, body] = routes[route](init);
    return { status, json: async () => body };
  };
  return { fetch, calls };
}

test("pairing stores the token on disk, unlinking removes it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-scrims-"));
  const token = "t".repeat(43);
  const { fetch, calls } = fakeApi({
    pair: () => [200, { token, code: "ABC234", expiresAt: new Date().toISOString() }],
    state: () => [200, { linked: false, code: "ABC234" }],
    unlink: () => [200, { ok: true }],
  });
  const states = [];
  const scrims = new Scrims({ dir, fetch, onState: (s) => states.push(s) });
  scrims.setEnabled(true);
  assert.strictEqual(scrims.state.status, "unlinked");
  await scrims.pair();
  assert.strictEqual(scrims.state.code, "ABC234");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "rite-scrims.json"), "utf8")).token, token);
  await new Promise((r) => setImmediate(r));
  assert.ok(calls.some((c) => c.route === "state" && c.auth === `Bearer ${token}`));
  await scrims.unlink();
  scrims.setEnabled(false);
  assert.ok(!fs.existsSync(path.join(dir, "rite-scrims.json")));
  assert.strictEqual(states.at(-1).status, "off");
});

test("a token RITE WEB no longer knows is dropped", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-scrims-"));
  fs.writeFileSync(path.join(dir, "rite-scrims.json"), JSON.stringify({ token: "x".repeat(43) }));
  const { fetch } = fakeApi({ state: () => [401, { error: "Cliente no registrado" }] });
  const scrims = new Scrims({ dir, fetch, onState: () => {} });
  scrims.enabled = true;
  await scrims.poll();
  assert.strictEqual(scrims.state.status, "unlinked");
  assert.ok(!fs.existsSync(path.join(dir, "rite-scrims.json")));
});

test("registering sends the form to RITE WEB with the token", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-scrims-"));
  fs.writeFileSync(path.join(dir, "rite-scrims.json"), JSON.stringify({ token: "t".repeat(43) }));
  const { fetch, calls } = fakeApi({ register: () => [200, { ok: true }], state: () => [200, { linked: true, player: null }] });
  const scrims = new Scrims({ dir, fetch, onState: () => {} });
  await scrims.register({ name: "Santi", region: "SA", kirka: "SANTI#MARAGE" });
  const call = calls.find((c) => c.route === "register");
  assert.strictEqual(call.auth, `Bearer ${"t".repeat(43)}`);
  assert.deepStrictEqual(JSON.parse(call.body), { name: "Santi", region: "SA", kirka: "SANTI#MARAGE" });
});
