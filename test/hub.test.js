"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { startTarget, isGame } = require("../src/main/hub");
const { classifyNavigation, classifyVoxNavigation, isVoxOrigin, isGameOrigin } = require("../src/main/navigation");
const { sanitize } = require("../src/main/settings");
const { isHubPage } = require("../src/main/windows/hub");

test("the client opens the hub unless a game was remembered", () => {
  assert.strictEqual(startTarget({}), "hub");
  assert.strictEqual(startTarget({ startGame: "hub" }), "hub");
  assert.strictEqual(startTarget({ startGame: "kirka" }), "kirka");
  assert.strictEqual(startTarget({ startGame: "voxarena" }), "voxarena");
  assert.strictEqual(startTarget({ startGame: "protox" }), "hub");
  assert.strictEqual(isGame("voxarena"), true);
  assert.strictEqual(isGame("hub"), false);
});

test("startGame only takes the hub or one of the two games", () => {
  assert.strictEqual(sanitize("startGame", "voxarena"), "voxarena");
  assert.strictEqual(sanitize("startGame", "steam"), undefined);
  assert.strictEqual(sanitize("startGame", 1), undefined);
});

test("each window only loads its own game; the other one goes to the browser", () => {
  assert.strictEqual(classifyNavigation("https://kirka.io/games/abc"), "internal");
  assert.strictEqual(classifyNavigation("https://voxarena.io/"), "external");
  assert.strictEqual(classifyVoxNavigation("https://voxarena.io/tienda"), "internal");
  assert.strictEqual(classifyVoxNavigation("https://www.voxarena.io/"), "internal");
  assert.strictEqual(classifyVoxNavigation("https://kirka.io/"), "external");
  // Logins open inside either window.
  assert.strictEqual(classifyVoxNavigation("https://discord.com/oauth2/authorize"), "internal");
  assert.strictEqual(classifyVoxNavigation("https://accounts.google.com/o/oauth2"), "internal");
  assert.strictEqual(classifyVoxNavigation("javascript:alert(1)"), "block");
});

test("the VOXARENA origin is not a Kirka origin and the other way round", () => {
  assert.strictEqual(isVoxOrigin("https://voxarena.io/jugar"), true);
  assert.strictEqual(isVoxOrigin("http://voxarena.io/"), false);
  assert.strictEqual(isVoxOrigin("https://kirka.io/"), false);
  assert.strictEqual(isGameOrigin("https://voxarena.io/"), false);
});

test("only the client's own hub page counts as the hub", () => {
  assert.strictEqual(isHubPage("file:///C:/Users/x/RITE%20Client/resources/app.asar/src/hub/index.html"), true);
  assert.strictEqual(isHubPage("file:///home/x/riteclient/src/hub/index.html"), true);
  assert.strictEqual(isHubPage("file:///home/x/Downloads/hub/index.html?x=1"), false);
  assert.strictEqual(isHubPage("https://kirka.io/hub/index.html"), false);
  assert.strictEqual(isHubPage(undefined), false);
});

test("hub layouts stay on the grid, at least their minimum size and never overlap", () => {
  const L = require("../src/hub/layout");
  for (const name of Object.keys(L.PRESETS)) assert.strictEqual(L.isValid(L.preset(name)), true, name);
  const base = L.preset("clasico");
  assert.strictEqual(L.fits(base, "chat", [0, 5, 8, 3]), true);
  assert.strictEqual(L.fits(base, "chat", [0, 4, 8, 3]), false); // on top of the games
  assert.strictEqual(L.fits(base, "chat", [0, 6, 8, 3]), false); // off the grid
  assert.strictEqual(L.fits(base, "kirka", [0, 0, 1, 5]), false); // too narrow
  assert.deepStrictEqual(L.parse("not json"), base);
  assert.deepStrictEqual(L.parse(JSON.stringify({ ...base, chat: [0, 0, 8, 3] })), base);
  // Dropping Kirka onto VOXARENA swaps them.
  assert.strictEqual(L.at(base, 5, 2), "voxarena");
  const swapped = L.swap(base, "kirka", "voxarena");
  assert.deepStrictEqual([swapped.kirka, swapped.voxarena], [[4, 0, 4, 5], [0, 0, 4, 5]]);
  // The chat (8 wide) has no room where Kirka was: no swap.
  assert.strictEqual(L.swap(base, "chat", "kirka"), null);
});

test("the hub layout and folded games settings only take valid values", () => {
  const L = require("../src/hub/layout");
  assert.strictEqual(sanitize("hubLayout", ""), "");
  assert.strictEqual(sanitize("hubLayout", JSON.stringify(L.preset("chat"))), JSON.stringify(L.preset("chat")));
  assert.strictEqual(sanitize("hubLayout", '{"kirka":[0,0,12,8]}'), undefined);
  assert.strictEqual(sanitize("hubLayout", "{"), undefined);
  assert.strictEqual(sanitize("hubFolded", "kirka,voxarena"), "kirka,voxarena");
  assert.strictEqual(sanitize("hubFolded", "<b>"), undefined);
});
