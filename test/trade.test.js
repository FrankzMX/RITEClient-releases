"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { parseTradeLine, parsePrice, parseWatch, matchWatch, installTradePage } = require("../src/preload/features/trade");

test("the server's offer line gives who, both items and the offer number", () => {
  const it = parseTradeLine({ name: "SERVER", message: "#0X0X0X is offering their Sovereign AR-9 for your Bayonet Gold, type /trade accept 3 to accept this offer" });
  assert.strictEqual(it.kind, "offer");
  assert.strictEqual(it.from, "#0X0X0X");
  assert.strictEqual(it.theirs, "Sovereign AR-9");
  assert.strictEqual(it.yours, "Bayonet Gold");
  assert.strictEqual(it.number, 3);
  // With brackets, as the server may write them.
  const b = parseTradeLine({ name: "", message: "#ABCD12 is offering [Mythic Vita] for your [Shark], type /trade accept 12 to accept this offer" });
  assert.deepStrictEqual([b.theirs, b.yours, b.number], ["Mythic Vita", "Shark", 12]);
});

test("server lines about a running trade are statuses", () => {
  assert.strictEqual(parseTradeLine({ name: "SERVER", message: "Type /trade confirm to finish the trade" }).status, "confirm");
  assert.strictEqual(parseTradeLine({ name: "SERVER", message: "Trade complete" }).status, "done");
  assert.strictEqual(parseTradeLine({ name: "SERVER", message: "Trade cancelled" }).status, "cancel");
  assert.strictEqual(parseTradeLine({ name: "SERVER", message: "Bob joined the game" }), null);
});

test("players selling, buying and trading are told apart", () => {
  assert.strictEqual(parseTradeLine({ name: "Ana#AAAA11", message: "WTS Sovereign AR-9 50k" }).kind, "sell");
  assert.strictEqual(parseTradeLine({ name: "Ana", message: "vendo bayonet barata" }).kind, "sell");
  assert.strictEqual(parseTradeLine({ name: "Ana", message: "WTB any mythic" }).kind, "buy");
  assert.strictEqual(parseTradeLine({ name: "Ana", message: "busco tomahawk" }).kind, "buy");
  assert.strictEqual(parseTradeLine({ name: "Ana", message: "my shark for your vita?" }).kind, "swap");
  assert.strictEqual(parseTradeLine({ name: "Ana", message: "gg wp" }), null);
  // A command someone typed is not an announcement.
  assert.strictEqual(parseTradeLine({ name: "Ana", message: "/trade offer my:Shark your:Vita" }), null);
});

test("the skins you look for are found as whole words", () => {
  const watch = parseWatch("Sovereign, ar9 ,, bayonet;x");
  assert.deepStrictEqual(watch, ["sovereign", "ar9", "bayonet"]);
  assert.deepStrictEqual(matchWatch("WTS Sovereign AR-9", watch), ["sovereign", "ar9"]);
  assert.deepStrictEqual(matchWatch("bayonets are cool", ["bayonet"]), []);
  assert.deepStrictEqual(matchWatch("start now", ["ar"]), []);
  // Asking who has one is buying.
  const it = parseTradeLine({ name: "Ana", message: "anyone has a sovereign?" }, watch);
  assert.strictEqual(it.kind, "buy");
  assert.strictEqual(parseTradeLine({ name: "Ana", message: "my sovereign looks cool" }, watch).kind, "mention");
  assert.deepStrictEqual(it.watched, ["sovereign"]);
});

test("prices in coins are read from the line", () => {
  assert.strictEqual(parsePrice("WTS vita 50k"), 50000);
  assert.strictEqual(parsePrice("1.5k coins"), 1500);
  assert.strictEqual(parsePrice("selling for 5,000 coins"), 5000);
  assert.strictEqual(parsePrice("1,2m"), 1200000);
  assert.strictEqual(parsePrice("AR-9 for 300c"), 300);
  assert.strictEqual(parsePrice("AR-9 level 10"), null);
});

test("the page helper reads new chat lines once, from every list of the chat module", () => {
  const messages = [{ name: "Ana", message: "WTS vita" }];
  const lobby = [{ name: "SERVER", message: "Trade complete" }];
  const chat = { messages, renamedLobby: lobby, message: "", commands: [] };
  const vm = { $store: { state: { renamedChat: chat } }, $children: [] };
  const win = { document: { querySelector: () => ({ __vue__: vm }) } };
  installTradePage(win);
  assert.deepStrictEqual(win.__riteTrade.poll().lines.map((l) => l.message), ["WTS vita", "Trade complete"]);
  assert.deepStrictEqual(win.__riteTrade.poll().lines, []);
  messages.push({ name: "Bo", message: "WTB shark" });
  assert.deepStrictEqual(win.__riteTrade.poll().lines, [{ name: "Bo", message: "WTB shark" }]);
  // Writing a command fills the chat box without sending it.
  let sent = false;
  const box = { handler: () => (sent = true), text: "", commands: [], $children: [] };
  vm.$children.push(box);
  assert.ok(win.__riteTrade.write("/trade accept 3").ok);
  assert.strictEqual(box.text, "/trade accept 3");
  assert.strictEqual(sent, false);
});

const { buildPriceIndex, findSkins, judgePrice } = require("../src/preload/features/trade");
const { cleanPrices, Prices } = require("../src/main/prices");

const LIST = cleanPrices([
  { itemName: "Sovereign", rarity: "M", type: "AR-9", average: 60000, inventory: 40, bolt: 50000, fate: 70000, bros: "x" },
  { itemName: "Nova", rarity: "L", type: "VITA", average: 9000, inventory: 900 },
  { itemName: "Nova", rarity: "L", type: "Shark", average: 4000, inventory: 100 },
  { itemName: "Golden Age", rarity: "M", type: "Character", average: 250000, inventory: 12 },
  { itemName: "Ace", rarity: "R", type: "SCAR", average: 500, inventory: 5 },
  { itemName: "2022", rarity: "L", type: "Shark", average: 800, inventory: 5 },
  { itemName: "Nothing", rarity: "M", type: "LAR", average: 0, inventory: 5 },
  { itemName: 7 },
]);

test("the KirkaTrades list keeps named skins; the chat index only the priced ones", () => {
  assert.strictEqual(LIST.length, 7);
  assert.strictEqual(buildPriceIndex(LIST).has("nothing"), false);
  assert.strictEqual(buildPriceIndex(LIST, { unpriced: true }).has("nothing"), true);
  assert.deepStrictEqual(LIST[0], { name: "Sovereign", type: "AR-9", rarity: "M", average: 60000, lists: { bolt: 50000, fate: 70000, bros: 0 }, render: "", copies: 40 });
});

test("skins named in a line are found, with the weapon deciding between equal names", () => {
  const index = buildPriceIndex(LIST);
  assert.deepStrictEqual(findSkins("WTS sovereign 45k", index).map((s) => s.name), ["Sovereign"]);
  assert.deepStrictEqual(findSkins("selling golden age char and nova shark", index).map((s) => `${s.name} ${s.type}`), ["Golden Age Character", "Nova Shark"]);
  assert.deepStrictEqual(findSkins("nova anyone?", index).map((s) => s.type), ["VITA"]); // the one with more copies
  // Short and numeric names are not looked for (they match ordinary words).
  assert.deepStrictEqual(findSkins("ace 2022", index), []);
});

test("an asking price is judged against the reference", () => {
  assert.strictEqual(judgePrice(45000, 60000), "deal");
  assert.strictEqual(judgePrice(60000, 60000), "fair");
  assert.strictEqual(judgePrice(90000, 60000), "high");
  assert.strictEqual(judgePrice(null, 60000), null);
});

test("prices are downloaded once every 30 minutes and a failure keeps the last list", async () => {
  let now = 0;
  let calls = 0;
  let fail = false;
  const prices = new Prices({
    now: () => now,
    fetch: async () => {
      calls++;
      if (fail) throw new Error("offline");
      return { status: 200, json: async () => [{ itemName: "Sovereign", rarity: "M", type: "AR-9", average: 60000, inventory: 40 }] };
    },
  });
  assert.strictEqual((await prices.get()).list.length, 1);
  await prices.get();
  assert.strictEqual(calls, 1);
  now = 31 * 60 * 1000;
  fail = true;
  const r = await prices.get();
  assert.strictEqual(calls, 2);
  assert.ok(r.ok);
  assert.strictEqual(r.list.length, 1);
});

test("today's KirkaTrades history is cleaned, newest first, and searchable", () => {
  const { cleanTrades } = require("../src/main/prices");
  const { searchTrades } = require("../src/preload/features/trade");
  const list = cleanTrades([
    { tradeId: 1, offerer: "Ana#AAAA11", accepter: "Bo#BBBB22", receivedAt: 10, trade: { offered: { total: 9000, items: [{ name: "Golden", rarity: "L", quantity: "9", value: 1000 }] }, wanted: { total: 8000, items: [{ name: "Villain", rarity: "E", quantity: "1", value: 8000 }] } } },
    { tradeId: 2, offerer: "Cy#CCCC33", accepter: "Bo#BBBB22", receivedAt: 20, trade: { offered: { items: [{ name: "Chilly", rarity: "Z" }] }, wanted: {} } },
    { tradeId: "x", trade: {} },
    null,
  ]);
  assert.deepStrictEqual(list.map((t) => t.id), [2, 1]);
  assert.deepStrictEqual(list[0].offered.items[0], { name: "Chilly", rarity: "", quantity: 1, value: 0 });
  assert.deepStrictEqual(list[1].offered, { total: 9000, items: [{ name: "Golden", rarity: "L", quantity: 9, value: 1000 }] });
  assert.deepStrictEqual(searchTrades(list, "villain").map((t) => t.id), [1]);
  assert.deepStrictEqual(searchTrades(list, "bo#").map((t) => t.id), [2, 1]);
  assert.deepStrictEqual(searchTrades(list, "#2").map((t) => t.id), [2]);
  assert.strictEqual(searchTrades(list, "").length, 2);
});

test("questions and refusals are not taken as sales", () => {
  const { intentOf } = require("../src/preload/features/trade");
  assert.strictEqual(intentOf("polar is over 3m im not selling it for under that"), null);
  assert.strictEqual(intentOf("will u sell ur polar 700k?"), "buy");
  assert.strictEqual(intentOf("anyone selling bayonet?"), "buy");
  assert.strictEqual(intentOf("me vendes tu polar?"), "buy");
  assert.strictEqual(intentOf("no lo vendo"), null);
  assert.strictEqual(intentOf("WTS polar 3m"), "sell");
  // The refusal with a watched skin still shows, as a mention, without "good deal".
  const it = parseTradeLine({ name: "Sh4d0w", message: "polar is over 3m im not selling it for under that" }, ["polar"]);
  assert.strictEqual(it.kind, "mention");
});

test("only what is still on stays in the panel", () => {
  const { pruneItems } = require("../src/preload/features/trade");
  const now = 100 * 60 * 1000;
  const items = [
    { kind: "sell", from: "Ana", at: now - 1000 },
    { kind: "status", status: "done", at: now - 2000 },
    { kind: "offer", from: "#AAAA11", at: now - 3000 },
    { kind: "sell", from: "ana", at: now - 4000 }, // same player, older: replaced
    { kind: "buy", from: "Bo", at: now - 20 * 60 * 1000 }, // too old
    { kind: "buy", from: "Cy", at: now - 5000 },
  ];
  assert.deepStrictEqual(pruneItems(items, now).map((i) => `${i.kind}:${i.from || i.status}`), ["sell:Ana", "status:done", "offer:#AAAA11", "buy:Cy"]);
  // The done notice itself goes after a minute.
  assert.deepStrictEqual(pruneItems([{ kind: "status", status: "cancel", at: 0 }], 2 * 60 * 1000), []);
});

test("the card buttons only prepare text for the player", () => {
  const { replyFor } = require("../src/preload/features/trade");
  const sell = replyFor({ kind: "sell", from: "Sh4d0w", skins: [{ name: "Polar" }], watched: [] });
  assert.strictEqual(sell.text, "@Sh4d0w interested in your Polar, how much?");
  assert.strictEqual(sell.offer, "/trade offer my:[ ] your:[Polar]");
  assert.strictEqual(replyFor({ kind: "buy", from: "Bo#BBBB22", skins: [], watched: ["polar"] }).text, "@Bo I have polar, what do you offer?");
  assert.strictEqual(replyFor({ kind: "offer" }), null);
});

test("the ear opens a hidden, muted Kirka window and passes on its chat lines", async () => {
  const { TradeEar } = require("../src/main/trade-ear");
  const calls = [];
  let pollAnswer = { ok: true, lines: [{ name: "Ana", message: "WTS polar 3m" }] };
  class FakeWindow {
    constructor(opts) {
      this.opts = opts;
      this.handlers = {};
      this.destroyed = false;
      this.webContents = {
        setAudioMuted: (m) => calls.push(["muted", m]),
        setWindowOpenHandler: () => {},
        on: () => {},
        executeJavaScript: async (code) => (code.includes("poll()") ? pollAnswer : true),
      };
    }
    removeMenu() {}
    on(name, fn) { this.handlers[name] = fn; }
    loadURL(url) { calls.push(["load", url]); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.handlers.closed && this.handlers.closed(); }
    show() {} hide() {} focus() {}
  }
  const got = [];
  const states = [];
  const ear = new TradeEar({ BrowserWindow: FakeWindow, getUrl: () => "https://kirka.io/", isAllowed: () => true, onLines: (l) => got.push(...l), onState: (s) => states.push(s) });
  ear.start();
  assert.strictEqual(ear.win.opts.show, false);
  assert.strictEqual(ear.win.opts.webPreferences.backgroundThrottling, false);
  assert.deepStrictEqual(calls, [["muted", true], ["load", "https://kirka.io/"]]);
  await ear.poll();
  assert.deepStrictEqual(got, [{ name: "Ana", message: "WTS polar 3m" }]);
  assert.strictEqual(ear.state.listening, true);
  ear.stop();
  assert.strictEqual(ear.state.on, false);
  assert.strictEqual(ear.timer, null);
});

test("my inventory: skins with a price, what to ask and the ad", () => {
  const { buildPriceIndex, matchInventory, suggestPrice, adFor, roundPrice } = require("../src/preload/features/trade");
  const index = buildPriceIndex([
    { name: "Polar", type: "AR-9", rarity: "L", average: 450000, lists: { bolt: 400000, fate: 500000, bros: 0 }, copies: 10 },
    { name: "Polar", type: "VITA", rarity: "E", average: 50000, lists: {}, copies: 50 },
    { name: "Crazy", type: "AR-9", rarity: "M", average: 2000000, lists: { bolt: 1500000 }, copies: 3 },
  ]);
  const owned = matchInventory(
    [
      { texts: ["Polar", "LEGENDARY", "AR-9"], amount: 1 },
      { texts: ["Polar", "AR-9"], amount: 2 },
      { texts: ["Crazy"], amount: 1 },
      { texts: ["Unknown thing"], amount: 4 },
    ],
    index
  );
  assert.deepStrictEqual(owned.map((o) => [o.key, o.amount]), [["Crazy|AR-9", 1], ["Polar|AR-9", 3]]);
  const picks = owned.map((o) => ({ skin: o.skin, qty: o.amount }));
  assert.deepStrictEqual(suggestPrice(picks), { least: 2700000, fair: 3350000, best: 3500000 });
  assert.strictEqual(adFor(picks, "sell", 3400000), "WTS Crazy AR-9 + 3x Polar AR-9 for 3.4m coins");
  assert.strictEqual(adFor(picks, "swap", 3400000), "WTT Crazy AR-9 + 3x Polar AR-9 (worth ~3.4m coins), send offers");
  assert.strictEqual(roundPrice(433330000), 433000000);
  assert.strictEqual(roundPrice(279000), 279000);
});

test("the page reads the inventory by its shape", () => {
  const item = (name, type) => ({ wXy: { nMw: name, mWn: type, rWw: "LEGENDARY", url: "https://x/y.png" }, aMn: 2, mkW: false });
  const app = { __vue__: { $store: { state: { chat: { messages: [], commands: [] }, wWm: { inventory: { a: { 1: item("Polar", "AR-9") }, b: { 2: item("Crazy", "AR-9") }, c: {}, d: {} } } } } } };
  const win = { document: { querySelector: () => app } };
  installTradePage(win);
  const r = win.__riteTrade.inventory();
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.entries, [
    { texts: ["Polar", "AR-9", "LEGENDARY"], amount: 2 },
    { texts: ["Crazy", "AR-9", "LEGENDARY"], amount: 2 },
  ]);
});

test("my inventory: filters, order and Golden Chests as money", () => {
  const { buildPriceIndex, matchInventory, filterOwned, sortOwned, adFor } = require("../src/preload/features/trade");
  const index = buildPriceIndex([
    { name: "Golden", type: "Chest", rarity: "L", average: 1000, lists: {}, copies: 9 },
    { name: "Golden", type: "SCAR", rarity: "E", average: 5000, lists: {}, copies: 99 },
    { name: "Polar", type: "AR-9", rarity: "L", average: 450000, lists: {}, copies: 1 },
    { name: "Alpha", type: "Bayonet", rarity: "M", average: 570000, lists: {}, copies: 1 },
  ]);
  const owned = matchInventory([{ texts: ["Golden Chest"], amount: 9000 }, { texts: ["Polar", "AR-9"], amount: 2 }, { texts: ["Alpha"], amount: 1 }], index);
  assert.deepStrictEqual(owned.map((o) => o.key), ["Alpha|Bayonet", "Polar|AR-9", "Golden|Chest"]);
  assert.deepStrictEqual(filterOwned(owned, { dup: true }).map((o) => o.key), ["Polar|AR-9", "Golden|Chest"]);
  assert.deepStrictEqual(filterOwned(owned, { rar: ["L"], type: "AR-9" }).map((o) => o.key), ["Polar|AR-9"]);
  assert.deepStrictEqual(sortOwned(owned, "name", "asc").map((o) => o.skin.name), ["Alpha", "Golden", "Polar"]);
  assert.deepStrictEqual(sortOwned(owned, "amount", "desc").map((o) => o.amount), [9000, 2, 1]);
  assert.deepStrictEqual(sortOwned(owned, "rarity", "asc").map((o) => o.skin.rarity), ["L", "L", "M"]);
  assert.strictEqual(adFor([{ skin: owned[1].skin, qty: 1 }], "sell", 450000, "golden"), "WTS Polar AR-9 for 450 golden");
});

test("best price: the list that pays the most", () => {
  const { bestOf, suggestPrice, sortOwned, chatCoins } = require("../src/preload/features/trade");
  assert.strictEqual(chatCoins(82300000), "82.3m");
  assert.strictEqual(chatCoins(165000000), "165m");
  const mirror = { name: "Mirror", average: 82333333, lists: { bolt: 165000000, fate: 50000000, bros: 32000000 } };
  const plain = { name: "Plain", average: 100000000, lists: {} };
  assert.deepStrictEqual(bestOf(mirror), { value: 165000000, from: "BOLT" });
  assert.deepStrictEqual(bestOf(plain), { value: 100000000, from: "promedio" });
  assert.deepStrictEqual(suggestPrice([{ skin: mirror, qty: 1 }]), { least: 32000000, fair: 82300000, best: 165000000 });
  const owned = [{ skin: mirror, amount: 1 }, { skin: plain, amount: 1 }];
  assert.deepStrictEqual(sortOwned(owned, "value", "desc", (s) => bestOf(s).value).map((o) => o.skin.name), ["Mirror", "Plain"]);
  assert.deepStrictEqual(sortOwned(owned, "value", "desc").map((o) => o.skin.name), ["Plain", "Mirror"]);
});

test("Kirka's real offers and item tags", () => {
  const { parseTags, untag } = require("../src/preload/features/trade");
  const a = parseTradeLine({
    name: "SERVER",
    message: "MyAimPaysRent#5XLY4W is offering their [Yuki||BODY_SKIN|MYTHICAL] for your [Faded|Bayonet|WEAPON_SKIN|MYTHICAL], [Looming|SCAR|WEAPON_SKIN|LEGENDARY], type **/trade accept 74502** to accept this offer",
  });
  assert.deepStrictEqual([a.kind, a.from, a.theirs, a.yours, a.number], ["offer", "MyAimPaysRent", "Yuki", "Faded Bayonet, Looming SCAR", 74502]);
  assert.deepStrictEqual(a.theirTags, [{ name: "Yuki", type: "Character", kind: "BODY_SKIN", rarity: "M", qty: 1 }]);
  const b = parseTradeLine({ name: "SERVER", message: "ZG-Mario#2BW9CI is offering their [Golden||CHEST|LEGENDARY]x600 for your [1337|Shark|WEAPON_SKIN|MYTHICAL], type **/trade accept 484** to accept this offer" });
  assert.deepStrictEqual([b.from, b.theirs, b.yours, b.number, b.theirTags[0].qty], ["ZG-Mario", "600x Golden Chest", "1337 Shark", 484, 600]);
  const c = parseTradeLine({ name: "Sh4d0w", message: "trading [Capricorn|Tomahawk|WEAPON_SKIN|MYTHICAL] [Majestic|Shark|WEAPON_SKIN|MYTHICAL]" });
  assert.deepStrictEqual([c.kind, c.text, c.tags.map((t) => t.name)], ["swap", "trading Capricorn Tomahawk Majestic Shark", ["Capricorn", "Majestic"]]);
  // Showing an item is a mention; the price bot's answers and commands are not trades.
  assert.strictEqual(parseTradeLine({ name: "Neo", message: "[Honeycomb|Tomahawk|WEAPON_SKIN|MYTHICAL]" }).kind, "mention");
  assert.strictEqual(parseTradeLine({ name: "Pwnstar", message: "#6FFEA8 1x[Capricorn|Tomahawk|WEAPON_SKIN|MYTHICAL]=2.7mil (average) 3F9ABB" }), null);
  assert.strictEqual(parseTradeLine({ name: "Pedri", message: "/price [LOLkin||BODY_SKIN|PARANORMAL]" }), null);
  assert.deepStrictEqual(parseTags("[Wood||CHEST|COMMON]x300"), [{ name: "Wood", type: "Chest", kind: "CHEST", rarity: "C", qty: 300 }]);
  assert.strictEqual(untag("wts [Polar|AR-9|WEAPON_SKIN|LEGENDARY] 3m"), "wts Polar AR-9 3m");
  // The inventory index finds short and number names exactly ("1337").
  const all = buildPriceIndex([{ name: "1337", type: "Shark", rarity: "M", average: 400000, lists: {}, copies: 3 }], { unpriced: true });
  assert.strictEqual(all.get("1337")[0].type, "Shark");
});
