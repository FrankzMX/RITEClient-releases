"use strict";

// Trade Helper: a panel in Kirka with the trade lines of the chat.
//   - Offers the server sends you ("#ID is offering their X for your Y, type
//     /trade accept N"), with Aceptar / Confirmar / Cancelar.
//   - People selling (WTS, vendo), buying (WTB, compro, busco, "will u sell…?")
//     or trading (WTT, cambio, "my X for your Y"), with the price they ask.
//   - The skins you look for (setting "Skins que buscas"): marked in gold, with a notice.
//   - Reference prices of KirkaTrades (src/main/prices.js) with each skin's
//     picture; a sale well under the average is a good deal.
//   - Monitor: the whole chat on one half of the screen and the helper on the
//     other, with its own box to write in the chat.
// It reads the chat that Kirka keeps in its store and never acts by itself:
// the buttons only write a message or command in the chat box, and it is sent
// only when the player presses Enter or Enviar (with a warning the first time).
// Kirka bans bots that buy or sell and spam.

// ---------------------------------------------------------------------------
// Reading chat lines (pure, tested in test/trade.test.js)

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const norm = (s) => clean(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// The server's offers, open to anyone who has what they ask for:
// "Ana#5XLY4W is offering their [Yuki||BODY_SKIN|MYTHICAL] for your [Faded|Bayonet|WEAPON_SKIN|MYTHICAL],
//  [Golden||CHEST|LEGENDARY]x600, type **/trade accept 74502** to accept this offer"
// (older form: "#0X0X0X is offering their Apollo for your Crazy, type /trade accept 3").
const OFFER = /(\S+)\s+is offering\s+(?:their\s+|his\s+|her\s+)?(.+?)\s+for your\s+(.+?)\s*[,.;]?\s*type\s+\**\s*\/trade accept\s+(\d+)/i;

// Kirka's item tags in the chat: [name|weapon|KIND|RARITY], then xN for many.
const TAG = /\[([^[\]|]{1,40})\|([^[\]|]{0,20})\|([A-Z_]{2,24})\|([A-Z_]{3,14})\](?:\s*x\s*(\d{1,7}))?/g;
const TAG_RARITY = { COMMON: "C", RARE: "R", EPIC: "E", LEGENDARY: "L", MYTHICAL: "M", MYTHIC: "M", PARANORMAL: "P" };
const TAG_TYPE = { BODY_SKIN: "Character", CHEST: "Chest", CHARACTER_CARD: "Card", CARD: "Card" };
function parseTags(text) {
  const out = [];
  for (const m of String(text || "").matchAll(TAG)) {
    out.push({ name: clean(m[1]), type: clean(m[2]) || TAG_TYPE[m[3]] || "", kind: m[3], rarity: TAG_RARITY[m[4]] || "", qty: m[5] ? Number(m[5]) : 1 });
    if (out.length >= 30) break;
  }
  return out;
}
// "[Faded|Bayonet|WEAPON_SKIN|MYTHICAL]" -> "Faded Bayonet", "[Golden||CHEST|LEGENDARY]x600" -> "600x Golden Chest".
const tagName = (t) => `${t.qty > 1 ? `${t.qty}x ` : ""}${t.name}${t.type && t.type !== "Character" ? ` ${t.type}` : ""}`;
const untag = (text) => clean(String(text || "").replace(TAG, (...m) => tagName({ name: clean(m[1]), type: clean(m[2]) || TAG_TYPE[m[3]] || "", qty: m[5] ? Number(m[5]) : 1 })));
// Server lines about a trade that is going on.
const STATUS = [
  [/\/trade confirm|confirm (?:the|this) trade/i, "confirm"],
  [/trade (?:complete|completed|done|successful)/i, "done"],
  [/trade (?:cancel+ed|declined|expired|failed)|declined your trade|left the trade|request has expired|offer (?:expired|cancel+ed)/i, "cancel"],
  [/accepted your (?:trade|offer)/i, "accepted"],
  [/wants to trade with you|trade request/i, "request"],
];
// What players write when they announce a trade (English and Spanish).
const SELL = /\b(wts|selling|sell(?:ing)?|vendo|vendiendo|se vende|vende)\b/i;
const BUY = /\b(wtb|buying|buy(?:ing)?|compro|comprando|busco|lf|looking for)\b/i;
const SWAP = /\b(wtt|trading|trade|tradeo|cambio|intercambio|swap)\b|\bmy\s+.+\s+for\s+your\b/i;
// Asking someone else to sell is buying: "will u sell ur polar 700k?", "anyone selling X?", "me vendes…".
const ASK_TO_SELL = /\b(will|would|can|could|do|does|wanna|want\s+to|pls|please)\s+(u|you|ya|anyone|any1|someone|somebody)\s+(\w+\s+)?(sell|trade)\b|\b(anyone|any1|someone|somebody|who|alguien|quien)\s+(is\s+)?(selling|sells|sell|has|have|got|vende|tiene)\b|\b(me\s+)?vendes\b/i;
// "im not selling it for under that", "no lo vendo": talk about a price, not an offer.
const NOT_SELLING = /\b(not|never|no|nunca|ni)\s+(\w+\s+){0,2}(sell(ing)?|vendo|vender|trade|trading)\b|\bwon'?t\s+(\w+\s+)?sell\b|\bdon'?t\s+(\w+\s+)?sell\b/i;
const SERVER_NAMES = /^(server|system|kirka|trade)$/i;

// What a player's line is about: "sell", "buy", "swap" or null.
function intentOf(text) {
  if (ASK_TO_SELL.test(text)) return "buy";
  if (NOT_SELLING.test(text)) return null;
  return SELL.test(text) ? "sell" : BUY.test(text) ? "buy" : SWAP.test(text) ? "swap" : null;
}

// A price in coins written in a line: "50k", "1.2m", "5000 coins", "5,000c".
function parsePrice(text) {
  const m = /(\d+(?:[.,]\d+)*)\s*(k|m|mil|coins?|c|monedas?)\b/i.exec(String(text || ""));
  if (!m) return null;
  const unit = m[2].toLowerCase();
  let num = m[1];
  // "5,000" / "5.000" are thousands; "1.5k" / "1,5k" a decimal.
  if (/^\d{1,3}([.,]\d{3})+$/.test(num) && !/^(k|m|mil)$/.test(unit)) num = num.replace(/[.,]/g, "");
  else num = num.replace(",", ".");
  const value = Number(num) * (unit === "k" || unit === "mil" ? 1000 : unit === "m" ? 1e6 : 1);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

// "Mythic AR-9, sovereign ,, bayonet" -> ["mythic ar-9", "sovereign", "bayonet"]
function parseWatch(text) {
  return [...new Set(String(text || "").split(/[,;\n]/).map(norm).filter((w) => w.length >= 2))].slice(0, 40);
}

// The words of the watch list found in a line. A name matches whole words only
// ("ar" does not match "start"), with or without dashes and spaces ("ar9" = "ar-9").
function matchWatch(text, watch) {
  const tokens = norm(text).replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  const line = ` ${tokens.join(" ")} `;
  // Neighbouring words joined: "ar 9" also reads as "ar9".
  const joined = new Set(tokens.map((t, i) => t + (tokens[i + 1] || "")));
  return watch.filter((w) => {
    const words = w.replace(/[^a-z0-9]+/g, " ").trim();
    if (!words) return false;
    return line.includes(` ${words} `) || joined.has(words.replace(/ /g, ""));
  });
}

// What a chat line is for the panel, or null when it has nothing to do with trades.
// `line` is { name, message } as Kirka keeps it.
function parseTradeLine(line, watch = []) {
  const from = clean(line && line.name);
  const text = clean(line && line.message);
  if (!text) return null;
  const server = !from || SERVER_NAMES.test(from);
  const offer = OFFER.exec(text);
  if (offer) {
    // "Ana#5XLY4W" -> "Ana"; the older "#0X0X0X" stays an id.
    const raw = offer[1];
    const who = /^#?[A-Za-z0-9]{4,10}$/.test(raw) && (raw.startsWith("#") || /\d/.test(raw)) ? `#${raw.replace(/^#/, "").toUpperCase()}` : raw.split("#")[0] || raw;
    const side = (s) => {
      const tags = parseTags(s);
      return { text: tags.length ? tags.map(tagName).join(", ") : clean(s).replace(/^\[|\]$/g, ""), tags };
    };
    const theirs = side(offer[2]);
    const yours = side(offer[3]);
    return { kind: "offer", from: who, text: untag(text), theirs: theirs.text, yours: yours.text, theirTags: theirs.tags, yourTags: yours.tags, number: Number(offer[4]), watched: matchWatch(untag(text), watch), price: null };
  }
  if (server) {
    const hit = STATUS.find(([re]) => re.test(text));
    return hit ? { kind: "status", status: hit[1], from: from || "SERVER", text, watched: [], price: null } : null;
  }
  // Commands (/trade, /price, /hm…) show as typed, and a price bot answers with
  // "#6FFEA8 1x[...]=2.7mil": neither is an announcement.
  if (/^\//.test(text) || /^#[A-Z0-9]{4,8}\s/.test(text)) return null;
  const tags = parseTags(text);
  const plain = untag(text);
  const kind = intentOf(plain);
  const watched = matchWatch(plain, watch);
  // Items shown with their tags but no word of selling or buying: someone showing them.
  if (!kind && !watched.length && !tags.length) return null;
  return { kind: kind || "mention", from, text: plain, tags, watched, price: parsePrice(plain) };
}

// Keeps the list to what is still on: a newer line of the same player and kind
// replaces the older one, announcements older than `maxAge` go, and offers and
// trade notices go once the trade is done or cancelled. Newest first.
const AD_KINDS = new Set(["sell", "buy", "swap", "mention"]);
function pruneItems(items, now, maxAge = 15 * 60 * 1000) {
  const out = [];
  const seen = new Set();
  let closed = false; // a newer "done" or "cancel" closes the offers before it
  for (const it of items) {
    if (it.kind === "status" && (it.status === "done" || it.status === "cancel")) {
      if (!closed && now - it.at < 60 * 1000) out.push(it); // the notice stays a minute
      closed = true;
      continue;
    }
    // Offers are open to everyone: they stay 10 minutes (Kirka does not say when they close).
    if (it.kind === "offer") {
      if (now - it.at > 10 * 60 * 1000 || seen.has(`offer|${it.number}`)) continue;
      seen.add(`offer|${it.number}`);
      out.push(it);
      continue;
    }
    if (it.kind === "status") {
      if (!closed) out.push(it);
      continue;
    }
    if (AD_KINDS.has(it.kind)) {
      if (now - it.at > maxAge) continue;
      const key = `${norm(it.from)}|${it.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(it);
  }
  return out;
}

// What the buttons of a card write in the chat.
function replyFor(it) {
  const who = it.from && !it.from.startsWith("#") ? `@${it.from.split("#")[0]} ` : "";
  const skin = (it.skins && it.skins[0] && it.skins[0].name) || (it.watched && it.watched[0]) || "";
  if (it.kind === "sell") return { label: "Me interesa", text: `${who}interested in your ${skin || "item"}, how much?`.trim(), offer: skin ? `/trade offer my:[ ] your:[${skin}]` : "" };
  if (it.kind === "buy") return { label: "Tengo uno", text: `${who}I have ${skin || "it"}, what do you offer?`.trim(), offer: skin ? `/trade offer my:[${skin}] your:[ ]` : "" };
  if (it.kind === "swap" || it.kind === "mention") return { label: "Responder", text: `${who}`.trim() + (skin ? ` about ${skin}: ` : " "), offer: skin ? `/trade offer my:[ ] your:[${skin}]` : "" };
  return null;
}

// ---------------------------------------------------------------------------
// Skins named in a line, from the price list (pure, tested)

const WEAPONS = { "ar 9": "AR-9", ar9: "AR-9", vita: "VITA", shark: "Shark", scar: "SCAR", revolver: "Revolver", rev: "Revolver", "mac 10": "MAC-10", mac10: "MAC-10", mac: "MAC-10", lar: "LAR", weatie: "Weatie", tomahawk: "Tomahawk", toma: "Tomahawk", m60: "M60", bayonet: "Bayonet", bayo: "Bayonet", character: "Character", skin: "Character" };
const tokensOf = (text) => norm(text).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

// name (normalized) -> entries of the list with that name. Names shorter than 4
// letters or only digits are left out: they match ordinary words and numbers.
// Skins without a price, short names and numbers are left out unless `unpriced`
// (the index for the inventory and the item tags, which name items exactly).
function buildPriceIndex(list, { unpriced = false } = {}) {
  const index = new Map();
  for (const it of Array.isArray(list) ? list : []) {
    if (!unpriced && !(it.average > 0)) continue;
    const key = tokensOf(it.name).join(" ");
    if (!key) continue;
    // In free text, short names and numbers match ordinary words; the inventory and the tags look names up exactly.
    if (!unpriced && (key.replace(/ /g, "").length < 4 || /^[\d ]+$/.test(key) || WEAPONS[key])) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(it);
  }
  return index;
}

// The skins of the list a text names (1 to 3 words), longest names first, each
// once. When a name has several skins, the weapon written next to it decides;
// otherwise the one with the most copies.
function findSkins(text, index, max = 4) {
  if (!index || !index.size) return [];
  const tokens = tokensOf(text);
  const weapons = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const two = `${tokens[i]} ${tokens[i + 1] || ""}`;
    if (WEAPONS[two]) weapons.add(WEAPONS[two]);
    else if (WEAPONS[tokens[i]]) weapons.add(WEAPONS[tokens[i]]);
  }
  const found = [];
  const used = new Set();
  for (let size = 3; size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      if ([...Array(size).keys()].some((k) => used.has(i + k))) continue;
      const hits = index.get(tokens.slice(i, i + size).join(" "));
      if (!hits) continue;
      const pick = hits.find((h) => weapons.has(h.type)) || hits.reduce((a, b) => (b.copies > a.copies ? b : a));
      if (found.includes(pick)) continue;
      found.push(pick);
      for (let k = 0; k < size; k++) used.add(i + k);
    }
  }
  return found.slice(0, max);
}

// How an asking price compares with the reference: "deal" at 85% or less,
// "high" at 130% or more.
function judgePrice(price, average) {
  if (!price || !average) return null;
  const r = price / average;
  return r <= 0.85 ? "deal" : r >= 1.3 ? "high" : "fair";
}

// The skins of the price list in the player's inventory: each entry of the page
// ({ texts, amount }) is the first of its texts that names a skin (the weapon
// among its texts decides between skins with the same name). Same skin, added.
function matchInventory(entries, index) {
  const byKey = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    const texts = (e && Array.isArray(e.texts) ? e.texts : []).map(String);
    const types = new Set(texts.map((t) => norm(t)));
    const isType = (h) => types.has(norm(h.type)) || [...types].some((t) => t.includes(norm(h.type)) && /chest|card/.test(t));
    let skin = null;
    for (const t of texts) {
      // "Golden Chest" is "Golden" in the list.
      const key = tokensOf(t).join(" ");
      const hits = index.get(key) || index.get(key.replace(/ (chest|card)$/, ""));
      if (!hits) continue;
      skin = hits.find(isType) || hits.reduce((a, b) => (b.copies > a.copies ? b : a));
      break;
    }
    if (!skin) continue;
    const key = `${skin.name}|${skin.type}`;
    const amount = Math.max(1, Math.min(1e7, Math.round(Number(e.amount) || 1)));
    if (byKey.has(key)) byKey.get(key).amount += amount;
    else byKey.set(key, { key, skin, amount });
  }
  return [...byKey.values()].sort((a, b) => b.skin.average - a.skin.average || a.skin.name.localeCompare(b.skin.name));
}

const RARITY_ORDER = "CRELMP";
// The inventory with the panel's filters: a text, rarities, a weapon (or Chest,
// Card, Character) and "dup" = only what you have more than one of.
function filterOwned(owned, { q = "", rar = [], type = "", dup = false } = {}) {
  const text = norm(q);
  return owned.filter(
    (o) => (!text || norm(`${o.skin.name} ${o.skin.type}`).includes(text)) && (!rar.length || rar.includes(o.skin.rarity)) && (!type || o.skin.type === type) && (!dup || o.amount > 1)
  );
}
// Sorted by "value", "name", "amount" or "rarity"; dir "desc" or "asc".
function sortOwned(list, by = "value", dir = "desc", valueOf = (skin) => skin.average || 0) {
  const key = {
    value: (o) => valueOf(o.skin),
    amount: (o) => o.amount,
    rarity: (o) => RARITY_ORDER.indexOf(o.skin.rarity),
  }[by];
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const d = by === "name" ? a.skin.name.localeCompare(b.skin.name) : key(a) - key(b);
    return d * sign || (b.skin.average || 0) - (a.skin.average || 0) || a.skin.name.localeCompare(b.skin.name);
  });
}

// 3 significant figures: 433_330_000 -> 433_000_000, 165_000_000 stays.
function roundPrice(n) {
  if (!(n > 0)) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 2);
  return Math.round(n / step) * step;
}

// What to ask for some skins (picks: [{ skin, qty }]): "least" is the lowest
// price any list gives (BOLT, FATE, BROS or the average), "fair" the average.
function suggestPrice(picks) {
  let least = 0;
  let fair = 0;
  let best = 0;
  for (const { skin, qty } of picks) {
    const values = [...Object.values(skin.lists || {}), skin.average].filter((v) => v > 0);
    least += (values.length ? Math.min(...values) : 0) * qty;
    fair += (skin.average || 0) * qty;
    best += bestOf(skin).value * qty;
  }
  return { least: roundPrice(least), fair: roundPrice(fair), best: roundPrice(best) };
}

// The highest price any list gives a skin, and which list: { value, from: "BOLT" }.
function bestOf(skin) {
  let best = { value: skin.average || 0, from: "promedio" };
  for (const [k, v] of Object.entries(skin.lists || {})) if (v > best.value) best = { value: v, from: k.toUpperCase() };
  return best;
}

// "450k", "1.2m", "82.3m", "165m"
const chatCoins = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}m` : n >= 1000 ? `${+(n / 1000).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n));

// The chat message for some skins: "sell" asks for coins, "swap" asks for offers.
// Golden Chests go as money in trades (KirkaTrades counts each as 1000 coins).
const GOLDEN_VALUE = 1000;
function adFor(picks, mode, price, pay = "coins") {
  const names = picks.map(({ skin, qty }) => `${qty > 1 ? `${qty}x ` : ""}${skin.name}${skin.type && skin.type !== "Character" ? ` ${skin.type}` : ""}`);
  let list = names.join(" + ");
  for (let n = names.length - 1; list.length > 120 && n > 0; n--) list = `${names.slice(0, n).join(" + ")} +${names.length - n} more`;
  if (!list) return "";
  if (!(price > 0)) return mode === "swap" ? `WTT ${list}, send offers` : `WTS ${list}, send offers`;
  const money = pay === "golden" ? `${chatCoins(Math.max(1, Math.round(price / GOLDEN_VALUE)))} golden` : `${chatCoins(price)} coins`;
  return mode === "swap" ? `WTT ${list}${price ? ` (worth ~${money})` : ""}, send offers` : `WTS ${list} for ${money}`;
}

// Trades of the KirkaTrades history that match a search (player, trade id or skin).
function searchTrades(list, query) {
  const raw = norm(query);
  // "#123": that trade only.
  if (/^#\d+$/.test(raw)) return list.filter((t) => String(t.id) === raw.slice(1));
  const q = raw.replace(/^#/, "");
  if (!q) return list;
  return list.filter((t) => String(t.id) === q || [t.offerer, t.accepter, ...t.offered.items.map((i) => i.name), ...t.wanted.items.map((i) => i.name)].some((v) => norm(v).includes(q)));
}

// ---------------------------------------------------------------------------
// The part that runs in the page's world: reads the chat lines from Kirka's
// store and writes in its chat box. It is injected as source, so it must not
// use anything from outside. Kirka renames most fields; the chat module is
// found by what it holds (a "messages" list and the chat commands), and every
// list in it with lines of { name, message } is read (the lobby chat has its own).
function installTradePage(win) {
  const seen = new WeakSet();
  const app = () => {
    const el = win.document.querySelector("#app");
    if (!el) return null;
    for (const key of ["__vue__", ...Object.keys(el)]) {
      const vm = el[key];
      if (vm && typeof vm === "object" && vm.$store && vm.$store.state) return vm;
    }
    return null;
  };
  const isLine = (m) => Boolean(m && typeof m === "object" && typeof m.message === "string");
  const isChat = (v) => Boolean(v && typeof v === "object" && Array.isArray(v.messages) && Array.isArray(v.commands));
  function chatModule() {
    const vm = app();
    const state = vm && vm.$store.state;
    if (!state) return null;
    if (isChat(state.chat)) return state.chat;
    const key = Object.keys(state).find((k) => isChat(state[k]));
    return key ? state[key] : null;
  }
  // New lines since the last call (Kirka keeps the last 50 of each list).
  function poll() {
    const chat = chatModule();
    if (!chat) return { ok: false };
    const lines = [];
    for (const key of Object.keys(chat)) {
      const list = chat[key];
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        if (!isLine(m) || seen.has(m)) continue;
        seen.add(m);
        lines.push({ name: String(m.name || "").slice(0, 60), message: m.message.slice(0, 300) });
      }
    }
    return { ok: true, lines };
  }
  // Kirka's chat box component: a send handler, the typed text and the commands.
  function chatBox() {
    const root = app();
    const queue = root ? [root] : [];
    while (queue.length) {
      const vm = queue.shift();
      if (vm && typeof vm.handler === "function" && typeof vm.text === "string" && Array.isArray(vm.commands)) return vm;
      queue.push(...((vm && vm.$children) || []));
    }
    return null;
  }
  // Writes a message or command in Kirka's chat box without sending it.
  function write(text) {
    const vm = chatBox();
    if (!vm) return { ok: false };
    vm.text = text;
    const input = vm.$el && vm.$el.querySelector && vm.$el.querySelector("input, textarea");
    if (input) input.focus();
    return { ok: true };
  }
  // Sends what the player typed and sent from the monitor, like pressing Enter
  // in Kirka's chat box (with Kirka's own wait between messages).
  function say(text) {
    const vm = chatBox();
    if (!vm) return { ok: false };
    vm.text = text;
    vm.handler();
    return { ok: true };
  }
  // The player's inventory, as Kirka keeps it in its store (a module with an
  // "inventory" of maps). Kirka renames the fields, so each entry goes out as
  // its short texts (name, weapon, rarity...) and its count; the panel matches
  // the texts with the price list. Only reads.
  function inventory() {
    const vm = app();
    const state = vm && vm.$store.state;
    if (!state) return { ok: false };
    let inv = null;
    for (const key of Object.keys(state)) {
      const m = state[key];
      if (m && typeof m === "object" && m.inventory && typeof m.inventory === "object") {
        inv = m.inventory;
        break;
      }
    }
    if (!inv) return { ok: false };
    const isObj = (v) => Boolean(v && typeof v === "object" && !Array.isArray(v));
    const texts = (o, out, depth) => {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === "string" && v.length && v.length <= 40 && !/^https?:|^\d{4}-\d\d-/.test(v)) out.push(v);
        else if (isObj(v) && depth < 2) texts(v, out, depth + 1);
        if (out.length >= 16) return out;
      }
      return out;
    };
    // An entry has a count of its own and an object with texts (the item).
    const isEntry = (o) =>
      Object.keys(o).some((k) => typeof o[k] === "number") && Object.keys(o).some((k) => isObj(o[k]) && Object.keys(o[k]).some((j) => typeof o[k][j] === "string"));
    const countOf = (o) => {
      for (const k of ["amount", "quantity", "count"]) if (Number.isInteger(o[k]) && o[k] > 0) return o[k];
      for (const k of Object.keys(o)) if (Number.isInteger(o[k]) && o[k] > 0 && o[k] < 1e6) return o[k];
      return 1;
    };
    const entries = [];
    const seenEntry = new Set();
    const walk = (v, depth) => {
      if (!v || typeof v !== "object" || depth > 4 || entries.length >= 3000) return;
      if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
      if (isEntry(v)) {
        if (seenEntry.has(v)) return;
        seenEntry.add(v);
        return entries.push({ texts: texts(v, [], 0), amount: countOf(v) });
      }
      for (const k of Object.keys(v)) walk(v[k], depth + 1);
    };
    walk(inv, 0);
    return { ok: true, entries };
  }
  win.__riteTrade = { poll, write, say, inventory };
}

// ---------------------------------------------------------------------------
// The panel

const KEEP = 80; // trade lines kept
const KEEP_CHAT = 200; // chat lines kept for the monitor
const POLL_MS = 1500;
const POLL_PLAYING_MS = 4000; // listening during a match: slower
const LABEL = { offer: "Oferta", sell: "Vende", buy: "Compra", swap: "Cambia", mention: "Menciona", status: "Trade" };
const STATUS_LABEL = { confirm: "Falta confirmar", done: "Trade completo", cancel: "Trade cancelado", accepted: "Aceptaron tu oferta", request: "Solicitud de trade" };
const FILTERS = [
  ["all", "Todo"],
  ["offer", "Ofertas"],
  ["sell", "Venden"],
  ["buy", "Compran"],
  ["watch", "Busco"],
  ["inv", "Mi inventario"],
  ["history", "Últimos trades"],
];
const RARITY = { C: "Común", R: "Rara", E: "Épica", L: "Legendaria", M: "Mítica", P: "Paranormal" };
const PRICES_EVERY = 30 * 60 * 1000;
const fmtCoins = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));
// "BOLT 300K · FATE 400K · BROS 520K · promedio 407K"
const listsText = (sk) =>
  [...Object.entries(sk.lists || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k.toUpperCase()} ${fmtCoins(v)}`), `promedio ${fmtCoins(sk.average)}`].join(" · ");
const SAFE_IMG = /^https:\/\/kirka\.lukeskywalk\.com\//;

const CSS = `
  :host { all: initial; }
  .panel { position: fixed; right: 16px; top: 96px; z-index: 2147483640; width: 370px; max-height: min(560px, 72vh); display: flex; flex-direction: column;
    background: rgba(16, 14, 22, .95); border: 1px solid #3a3324; border-top: 2px solid #e0b34a; border-radius: 2px; color: #f4efe4;
    font: 13px/1.35 "Outfit", system-ui, sans-serif; box-shadow: 0 10px 30px #0009; }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 8px 10px; cursor: move; user-select: none; border-bottom: 1px solid #3a3324; }
  .status { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 2px 6px; margin-left: -6px; }
  .grip { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; z-index: 3;
    background: linear-gradient(135deg, transparent 50%, #6f6656 50%, #6f6656 58%, transparent 58%, transparent 70%, #6f6656 70%, #6f6656 78%, transparent 78%); }
  .grip:hover { background-color: #e0b34a22; }
  .folded .grip, .monitor .grip { display: none; }
  .title { flex: 1; white-space: nowrap; font: 500 13px/1 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #f3d48a; }
  .count { min-width: 18px; padding: 2px 5px; border-radius: 2px; background: #e0b34a; color: #07060b; font: 600 11px/1 ui-monospace, monospace; text-align: center; }
  .count:empty { display: none; }
  .hbtn { all: unset; cursor: pointer; color: #a39886; padding: 2px 6px; border: 1px solid transparent; border-radius: 2px; font: 400 10px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .1em; text-transform: uppercase; }
  .hbtn:hover { color: #f3d48a; border-color: #3a3324; }
  .hbtn.on { color: #3ddc84; }
  .hbtn.off { color: #ff4d5e; }
  .filters { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid #3a3324; flex-wrap: wrap; }
  .filters button { all: unset; cursor: pointer; padding: 3px 8px; border: 1px solid #3a3324; border-radius: 2px; color: #a39886;
    font: 400 10px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  .filters button.on { border-color: #e0b34a; color: #07060b; background: #e0b34a; }
  .list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 6px; display: grid; gap: 6px; align-content: start; scrollbar-width: thin; scrollbar-color: #3a3324 transparent; }
  .empty { color: #a39886; padding: 14px 8px; text-align: center; font-size: 12px; }
  .card { position: relative; padding: 7px 9px 8px 11px; background: #16131c; border: 1px solid #241f2c; border-radius: 2px; }
  .card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c, #a39886); }
  .card.sell { --c: #3ddc84; } .card.buy { --c: #4aa8ff; } .card.swap { --c: #c48cff; } .card.offer { --c: #e0b34a; } .card.status { --c: #a39886; } .card.mention { --c: #f3d48a; } .card.trade { --c: #e0b34a; }
  .card.watched { border-color: #e0b34a; box-shadow: inset 0 0 0 1px #e0b34a55; }
  .card.offer { background: linear-gradient(90deg, #2a2112, #16131c 70%); }
  .meta { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .tag { font: 500 10px/1 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
  .who { color: #f4efe4; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
  .time { margin-left: auto; color: #6f6656; font-size: 11px; }
  .text { color: #d9d1c2; word-break: break-word; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .chip { position: relative; display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 2px; font-size: 11px; background: #241f2c; color: #f4efe4; }
  .chip.gold { background: #e0b34a; color: #07060b; font-weight: 600; }
  .chip.deal { background: #3ddc84; color: #07060b; font-weight: 600; }
  .chip.high { background: #ff4d5e; color: #07060b; font-weight: 600; }
  .chip.skin { background: #0e0c13; border: 1px solid var(--r, #3a3324); padding-left: 3px; }
  .chip.skin b { color: var(--r, #f4efe4); font-weight: 600; }
  .chip.skin span { color: #a39886; }
  .thumb { width: 22px; height: 22px; object-fit: contain; flex: none; }
  .peek { display: none; position: absolute; left: 0; bottom: calc(100% + 6px); z-index: 5; width: 150px; padding: 6px; background: #0e0c13; border: 1px solid var(--r, #3a3324); border-radius: 2px; box-shadow: 0 8px 20px #000b; text-align: center; }
  .peek img { width: 136px; height: 136px; object-fit: contain; display: block; margin: 0 auto 4px; }
  .peek small { display: block; color: #a39886; font-size: 10px; line-height: 1.3; }
  .chip.skin:hover .peek, .side:hover .peek { display: block; }
  .r-C { --r: #b8b8b8; } .r-R { --r: #4aa8ff; } .r-E { --r: #c48cff; } .r-L { --r: #f3b13c; } .r-M { --r: #ff4d5e; } .r-P { --r: #3ddc84; }
  .swapbox { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: center; margin: 4px 0 2px; }
  .swapbox .side { position: relative; padding: 5px 6px; background: #0e0c13; border: 1px solid var(--r, #3a3324); border-radius: 2px; text-align: center; font-weight: 600; word-break: break-word; }
  .swapbox .side img.big { width: 48px; height: 48px; object-fit: contain; display: block; margin: 0 auto 2px; }
  .swapbox small { display: block; color: #a39886; font: 400 9px/1.2 "Oswald", sans-serif; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 2px; }
  .swapbox em { display: block; font-style: normal; font-weight: 400; color: #a39886; font-size: 11px; margin-top: 2px; }
  .arrow { color: #e0b34a; font-size: 15px; }
  .oside-box { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 6px; align-items: start; margin: 4px 0 2px; }
  .oside small { display: block; color: #a39886; font: 400 9px/1.2 "Oswald", sans-serif; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .oitem { position: relative; display: flex; align-items: center; gap: 4px; padding: 2px 5px; margin-bottom: 3px; background: #0e0c13; border-left: 2px solid var(--r, #3a3324); border-radius: 2px; font-size: 12px; cursor: default; }
  .oitem b { flex: 1; min-width: 0; color: var(--r, #f4efe4); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .oitem span { color: #a39886; white-space: nowrap; font-size: 11px; }
  .oside-box .arrow { align-self: center; }
  .oitem span.v { color: #f4efe4; }
  .oitem:hover .peek { display: block; }
  .oside .total { color: #f3d48a; font-size: 11px; }
  .card.mine { border-color: #3ddc84; box-shadow: inset 0 0 0 1px #3ddc8455; }
  .chat-line { cursor: default; }
  .chat-line.has-card { cursor: pointer; }
  .chat-line.has-card:hover { background: #ffffff0d; }
  .chat-line .chip { margin: 0 2px; vertical-align: middle; }
  .verdict { margin-top: 4px; font-size: 12px; font-weight: 600; }
  .verdict.win { color: #3ddc84; } .verdict.lose { color: #ff4d5e; } .verdict.even { color: #a39886; }
  .actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .actions button { all: unset; cursor: pointer; padding: 4px 8px; border: 1px solid #e0b34a; border-radius: 2px; color: #f3d48a;
    font: 400 10px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  .actions button:hover { background: #e0b34a; color: #07060b; }
  .actions button.ghost { border-color: #3a3324; color: #a39886; }
  .search { display: block; width: calc(100% - 16px); box-sizing: border-box; margin: 6px 8px 0; padding: 6px 9px; background: #0e0c13; border: 1px solid #3a3324; border-radius: 2px; color: #f4efe4; font: inherit; font-size: 12px; outline: none; }
  .search:focus { border-color: #e0b34a; }
  .trade .people { color: #a39886; font-size: 11px; }
  .trade .people b { color: #f4efe4; }
  .trade .sides { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: start; margin-top: 5px; }
  .trade .col small { display: block; color: #a39886; font: 400 9px/1.2 "Oswald", sans-serif; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 3px; }
  .trade .item { display: flex; align-items: center; gap: 4px; padding: 2px 5px; margin-bottom: 3px; background: #0e0c13; border-left: 2px solid var(--r, #3a3324); border-radius: 2px; font-size: 12px; }
  .trade .item b { flex: 1; color: var(--r, #f4efe4); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trade .item span { color: #a39886; white-space: nowrap; }
  .trade .total { color: #f3d48a; font-size: 11px; }
  .src { padding: 4px 10px 6px; color: #6f6656; font-size: 10px; border-top: 1px solid #241f2c; }
  .folded .filters, .folded .list, .folded .search, .folded .src { display: none !important; }
  .flash { animation: flash 1.2s ease-out 2; }
  @keyframes flash { 0%, 100% { box-shadow: 0 10px 30px #0009; } 30% { box-shadow: 0 0 0 2px #e0b34a, 0 10px 30px #0009; } }

  /* Monitor: the whole chat on the left, the helper on the right. */
  .monitor-chat { display: none; }
  .panel.monitor { left: 0 !important; top: 0 !important; right: 0 !important; bottom: 0; width: auto; max-height: none; z-index: 2147483645;
    display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto auto 1fr auto; background: rgba(7, 6, 11, .97); }
  .panel.monitor .head { grid-column: 1 / -1; cursor: default; padding: 10px 16px; }
  .panel.monitor .filters, .panel.monitor .search, .panel.monitor .list, .panel.monitor .src { grid-column: 2; }
  .panel.monitor .filters { grid-row: 2; } .panel.monitor .search { grid-row: 3; }
  .panel.monitor .list { grid-row: 4; padding: 10px; } .panel.monitor .src { grid-row: 5; }
  .panel.monitor .monitor-chat { display: flex; flex-direction: column; grid-column: 1; grid-row: 2 / 6; min-height: 0; border-right: 1px solid #3a3324; }
  .panel.monitor .card { font-size: 14px; }
  .chat-log { flex: 1; overflow-y: auto; padding: 10px 14px; display: grid; gap: 3px; align-content: start; scrollbar-width: thin; scrollbar-color: #3a3324 transparent; font-size: 14px; }
  .chat-line { word-break: break-word; color: #d9d1c2; padding: 2px 6px; border-left: 2px solid transparent; }
  .chat-line b { color: #f3d48a; font-weight: 600; margin-right: 6px; }
  .chat-line.server b { color: #a39886; }
  .chat-line.sell { border-left-color: #3ddc84; } .chat-line.buy { border-left-color: #4aa8ff; } .chat-line.swap { border-left-color: #c48cff; } .chat-line.offer { border-left-color: #e0b34a; background: #2a211255; }
  .chat-line.watched { background: #e0b34a22; }
  .chat-head { padding: 8px 14px; color: #a39886; font: 400 11px/1.2 "Oswald", sans-serif; letter-spacing: .14em; text-transform: uppercase; border-bottom: 1px solid #241f2c; }
  .chat-form { display: flex; gap: 6px; padding: 10px 14px; border-top: 1px solid #3a3324; }
  .chat-form input { flex: 1; min-width: 0; padding: 8px 10px; background: #0e0c13; border: 1px solid #3a3324; border-radius: 2px; color: #f4efe4; font: inherit; font-size: 14px; outline: none; }
  .chat-form input:focus { border-color: #e0b34a; }
  .chat-form button { all: unset; cursor: pointer; padding: 8px 14px; border: 1px solid #e0b34a; border-radius: 2px; color: #f3d48a; font: 400 11px/1.2 "Oswald", sans-serif; letter-spacing: .14em; text-transform: uppercase; }
  .chat-form button:hover { background: #e0b34a; color: #07060b; }
  .chat-hint { padding: 0 14px 8px; color: #6f6656; font-size: 11px; }

  /* The warning before writing in the chat. */
  .warn { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; background: #07060bcc; }
  .warn-box { width: min(320px, 90%); padding: 14px; background: #16131c; border: 1px solid #e0b34a; border-radius: 2px; }
  .warn-box h3 { margin: 0 0 6px; font: 500 13px/1.2 "Oswald", sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #f3d48a; }
  .warn-box p { margin: 0 0 6px; color: #d9d1c2; font-size: 12px; }
  .warn-box code { display: block; margin: 6px 0; padding: 6px; background: #0e0c13; border: 1px solid #3a3324; color: #f4efe4; font: 12px/1.3 ui-monospace, monospace; word-break: break-word; }
  .warn-box label { display: flex; gap: 6px; align-items: center; color: #a39886; font-size: 11px; margin: 8px 0; }

  /* My inventory: pick skins, see what to ask and write the ad. */
  .chip.own { background: #3ddc84; color: #07060b; font-weight: 600; }
  .inv-note { color: #a39886; font-size: 12px; padding: 4px 2px; }
  .inv-note button { all: unset; cursor: pointer; color: #f3d48a; text-decoration: underline; margin-left: 4px; }
  .inv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 5px; }
  .inv-tile { all: unset; box-sizing: border-box; cursor: pointer; position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px 5px;
    background: #0e0c13; border: 1px solid #241f2c; border-bottom: 2px solid var(--r, #3a3324); border-radius: 2px; text-align: center; min-width: 0; }
  .inv-tile:hover { border-color: var(--r, #3a3324); }
  .inv-tile.on { border-color: #e0b34a; background: #2a2112; box-shadow: inset 0 0 0 1px #e0b34a; }
  .inv-tile img { width: 56px; height: 56px; object-fit: contain; }
  .inv-tile b { max-width: 100%; color: var(--r, #f4efe4); font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inv-tile span { color: #a39886; font-size: 10px; }
  .inv-tile span.val { color: #f4efe4; font-size: 11px; font-weight: 600; }
  .inv-tile i { position: absolute; top: 3px; right: 4px; font-style: normal; color: #f4efe4; font: 600 10px/1 ui-monospace, monospace; }
  .builder { padding: 8px 9px; background: #16131c; border: 1px solid #e0b34a; border-radius: 2px; display: grid; gap: 6px; }
  .builder h4 { margin: 0; font: 500 11px/1.2 "Oswald", sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #f3d48a; }
  .picks { display: flex; flex-wrap: wrap; gap: 4px; }
  .pick { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 6px; background: #0e0c13; border: 1px solid var(--r, #3a3324); border-radius: 2px; font-size: 12px; }
  .pick b { color: var(--r, #f4efe4); }
  .pick button { all: unset; cursor: pointer; width: 16px; text-align: center; color: #a39886; border: 1px solid #3a3324; border-radius: 2px; font-size: 11px; line-height: 14px; }
  .pick button:hover { color: #f3d48a; border-color: #e0b34a; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .seg { display: inline-flex; border: 1px solid #3a3324; border-radius: 2px; overflow: hidden; }
  .seg button { all: unset; cursor: pointer; padding: 3px 9px; color: #a39886; font: 400 10px/1.2 "Oswald", sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  .seg button.on { background: #e0b34a; color: #07060b; }
  .price { width: 90px; padding: 4px 7px; background: #0e0c13; border: 1px solid #3a3324; border-radius: 2px; color: #f4efe4; font: inherit; font-size: 12px; outline: none; }
  .price:focus { border-color: #e0b34a; }
  .hint { color: #a39886; font-size: 11px; }
  .hint b { color: #f4efe4; }
  .low { color: #ff4d5e; font-size: 11px; font-weight: 600; }
  .inv-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .inv-tools select { padding: 3px 5px; background: #0e0c13; border: 1px solid #3a3324; border-radius: 2px; color: #f4efe4; font: inherit; font-size: 11px; outline: none; }
  .inv-tools select:focus { border-color: #e0b34a; }
  .inv-tools .rb { all: unset; cursor: pointer; min-width: 16px; padding: 2px 5px; text-align: center; border: 1px solid var(--r, #3a3324); border-radius: 2px; color: var(--r, #a39886); font: 600 10px/1.3 ui-monospace, monospace; opacity: .55; }
  .inv-tools .rb.none { opacity: .2; }
  .inv-tools .rb.on { opacity: 1; background: var(--r); color: #07060b; }
  .inv-tools .tg { all: unset; cursor: pointer; padding: 3px 7px; border: 1px solid #3a3324; border-radius: 2px; color: #a39886; font: 400 10px/1.2 "Oswald", sans-serif; letter-spacing: .1em; text-transform: uppercase; }
  .inv-tools .tg.on { border-color: #e0b34a; background: #e0b34a; color: #07060b; }
  .inv-tools .sep { width: 1px; align-self: stretch; background: #3a3324; margin: 0 2px; }
  .gold { display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: #2a2112; border: 1px solid #e0b34a55; border-radius: 2px; color: #f3d48a; font-size: 12px; }
  .gold img { width: 26px; height: 26px; object-fit: contain; }
  .ad { padding: 6px; background: #0e0c13; border: 1px solid #3a3324; color: #f4efe4; font: 12px/1.3 ui-monospace, monospace; word-break: break-word; }
  [hidden] { display: none !important; }
`;

function createTradeHelper({ webFrame, toast, getSettings, getPrices = async () => ({ ok: false, list: [] }), getHistory = async () => ({ ok: false, list: [] }), ear = null }) {
  const page = (code) => webFrame.executeJavaScript(code);
  let installed = null;
  const install = () => (installed ||= page(`(${installTradePage.toString()})(window); true`).catch((e) => ((installed = null), Promise.reject(e))));
  const call = async (name, arg) => {
    await install();
    return page(`window.__riteTrade ? window.__riteTrade.${name}(${arg === undefined ? "" : JSON.stringify(arg)}) : { ok: false }`);
  };

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style>
  <div class="panel" hidden>
    <div class="head">
      <span class="title">Trade Helper</span><span class="count"></span>
      <button class="hbtn mon" title="Monitor: el chat completo y el helper a pantalla completa">Monitor</button>
      <button class="hbtn fold" title="Minimizar">–</button>
      <div class="status">
        <button class="hbtn listen" title="Escuchar el chat siempre, también durante la partida"></button>
        <button class="hbtn ear" title="Oído: una ventana de Kirka escondida en Servers para seguir recibiendo los trades mientras juegas" hidden></button>
        <button class="hbtn earwin" title="Muestra la ventana del oído para abrir Servers en ella" hidden>Ver oído</button>
      </div>
    </div>
    <div class="monitor-chat">
      <div class="chat-head">Chat de Kirka</div>
      <div class="chat-log"></div>
      <form class="chat-form"><input type="text" maxlength="200" spellcheck="false" placeholder="Escribe en el chat de Kirka…"><button type="submit">Enviar</button></form>
      <div class="chat-hint">Se manda solo cuando presionas Enter o Enviar. Esc cierra el monitor.</div>
    </div>
    <div class="filters"></div>
    <input class="search" type="text" spellcheck="false" placeholder="Buscar jugador, skin o #trade" hidden>
    <div class="list"></div>
    <div class="src" hidden>Precios de referencia: KirkaTrades (kirka.lukeskywalk.com)</div>
    <div class="grip" title="Arrastra para cambiar el tamaño (doble clic: tamaño normal)"></div>
    <div class="warn" hidden><div class="warn-box">
      <h3>Antes de escribir</h3>
      <p>RITE solo deja el mensaje escrito; tú decides si lo envías. Nunca manda nada solo.</p>
      <code class="warn-text"></code>
      <p>Kirka banea por spam, por usar bots para comprar o vender y por vender skins por dinero real o algo que no sean coins.</p>
      <label><input type="checkbox" class="warn-skip"> No volver a mostrar</label>
      <div class="actions"><button class="warn-ok">Escribirlo</button><button class="ghost warn-no">Cancelar</button></div>
    </div></div>
  </div>`;
  document.documentElement.append(host);
  const $ = (s) => root.querySelector(s);
  const panel = $(".panel");
  const list = $(".list");
  const count = $(".count");
  const filtersEl = $(".filters");
  const foldBtn = $(".fold");
  const listenBtn = $(".listen");
  const monBtn = $(".mon");
  const earBtn = $(".ear");
  const earWinBtn = $(".earwin");
  let earOn = false;
  let earState = { on: false, listening: false, visible: false };
  const search = $(".search");
  const srcNote = $(".src");
  const chatLog = $(".chat-log");
  const chatForm = $(".chat-form");
  const chatInput = chatForm.querySelector("input");

  const STORE_KEY = "rite-trade-ui";
  let ui = { filter: "all", folded: false, x: null, y: null, w: null, h: null, listen: true, monitor: false, noWarn: false, invRar: [], invType: "", invDup: false, invSort: "value", invDir: "desc", pay: "coins", best: false };
  try {
    ui = { ...ui, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {}
  ui.monitor = false; // the monitor always starts closed
  const saveUi = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(ui));
    } catch {}
  };

  let items = [];
  let chatLines = [];
  let unread = 0;
  let watch = [];
  let enabled = false;
  let timer = null;
  let failures = 0;
  let history = [];
  let historyAt = 0;
  let priceIndex = new Map();
  let invIndex = new Map(); // also the skins without a price yet
  let pricesAt = 0;
  let primed = false;
  let quiet = false;
  let lastSay = 0;
  // My inventory
  let invEntries = null; // what the page gave, null = not read yet
  let invAt = 0;
  let owned = []; // [{ key, skin, amount }]
  let ownedByKey = new Map();
  const picks = new Map(); // key -> how many
  let adMode = "sell";
  let customPrice = null; // what the player typed, null = the suggestion

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const playing = () => Boolean(document.pointerLockElement);

  // --- Prices and history -------------------------------------------------
  async function loadPrices() {
    if (Date.now() - pricesAt < PRICES_EVERY) return;
    pricesAt = Date.now();
    try {
      const r = await getPrices();
      if (r && r.ok && r.list.length) {
        priceIndex = buildPriceIndex(r.list);
        invIndex = buildPriceIndex(r.list, { unpriced: true });
        renderChat();
        srcNote.hidden = false;
        matchOwned();
        // Lines that came before the prices get theirs now.
        for (const it of items) enrich(it);
        render();
      }
    } catch {}
  }
  async function loadHistory() {
    if (Date.now() - historyAt < 5 * 60 * 1000) return;
    historyAt = Date.now();
    try {
      const r = await getHistory();
      if (r && r.ok) {
        history = r.list;
        srcNote.hidden = false;
        if (ui.filter === "history") render();
      }
    } catch {}
  }
  const skinByName = (name) => findSkins(name, priceIndex, 1)[0] || null;
  // The skin of a chat tag [name|weapon|KIND|RARITY]: same name, then the weapon decides.
  const skinForTag = (t) => {
    const hits = invIndex.get(tokensOf(t.name).join(" "));
    if (!hits) return null;
    return hits.find((h) => norm(h.type) === norm(t.type)) || hits.find((h) => h.rarity === t.rarity) || hits.reduce((a, b) => (b.copies > a.copies ? b : a));
  };
  const withQty = (sk, qty) => (sk ? { ...sk, qty } : null);

  // --- My inventory ---------------------------------------------------------
  function matchOwned() {
    owned = invEntries && invIndex.size ? matchInventory(invEntries, invIndex) : [];
    ownedByKey = new Map(owned.map((o) => [o.key, o]));
    for (const it of items) if (it.kind === "offer") enrich(it);
    for (const key of [...picks.keys()]) {
      if (!ownedByKey.has(key)) picks.delete(key);
      else picks.set(key, Math.min(picks.get(key), ownedByKey.get(key).amount));
    }
  }
  async function loadInventory(force) {
    if (!force && Date.now() - invAt < 60 * 1000) return;
    invAt = Date.now();
    try {
      const r = await call("inventory");
      if (!r || !r.ok) return;
      const before = owned.map((o) => `${o.key}:${o.amount}`).join();
      invEntries = r.entries;
      matchOwned();
      const now = owned.map((o) => `${o.key}:${o.amount}`).join();
      if (force || (before !== now && ui.filter === "inv")) render();
    } catch {}
  }
  const ownedOf = (sk) => ownedByKey.get(`${sk.name}|${sk.type}`);

  // --- Header buttons -----------------------------------------------------
  for (const [id, label] of FILTERS) {
    const b = el("button", "", label);
    b.dataset.f = id;
    b.onclick = () => {
      ui.filter = id;
      saveUi();
      render();
    };
    filtersEl.append(b);
  }
  foldBtn.onclick = () => {
    ui.folded = !ui.folded;
    if (!ui.folded) unread = 0;
    saveUi();
    render();
  };
  listenBtn.onclick = () => {
    ui.listen = !ui.listen;
    saveUi();
    toast.show(ui.listen ? "Trade Helper: escuchando el chat (también en partida)" : "Trade Helper: en pausa, no lee el chat");
    render();
    if (ui.listen && !timer) tick();
  };
  monBtn.onclick = () => setMonitor(!ui.monitor);
  // The ear: lines from the hidden Kirka window on Servers (src/main/trade-ear.js).
  const recent = new Map(); // "name|message" -> when, so a line seen by both windows counts once
  const fresh = (l) => {
    const key = `${l.name}|${l.message}`;
    const now = Date.now();
    for (const [k, t] of recent) if (now - t > 2 * 60 * 1000) recent.delete(k);
    if (recent.has(key)) return false;
    recent.set(key, now);
    return true;
  };
  if (ear) {
    earBtn.hidden = false;
    earBtn.onclick = async () => {
      await ear.set(!earOn);
      toast.show(!earOn ? "Oído encendido: abre una ventana de Kirka escondida en Servers" : "Oído apagado");
    };
    earWinBtn.onclick = () => ear.window(earState.visible ? "hide" : "show");
    ear.onState((state) => {
      earState = state;
      render();
    });
    ear.onLines((lines) => {
      if (!enabled || !ui.listen) return;
      const before = quiet;
      quiet = !primed;
      lines.filter(fresh).forEach(add);
      quiet = before;
      render();
      renderChat();
    });
  }
  function setMonitor(on) {
    ui.monitor = on;
    if (on) {
      ui.folded = false;
      unread = 0;
    }
    render();
    if (on) {
      renderChat();
      chatInput.focus();
    }
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.monitor) {
      e.stopPropagation();
      setMonitor(false);
    }
  }, true);

  // Dragging by the header, like the FPS counter (not in the monitor).
  const place = (x, y) => {
    panel.style.left = `${Math.min(Math.max(0, innerWidth - panel.offsetWidth), Math.max(0, x))}px`;
    panel.style.top = `${Math.min(Math.max(0, innerHeight - 40), Math.max(0, y))}px`;
    panel.style.right = "auto";
  };
  $(".head").addEventListener("pointerdown", (e) => {
    if (ui.monitor || e.target.closest("button")) return;
    e.preventDefault();
    const dx = e.clientX - panel.offsetLeft;
    const dy = e.clientY - panel.offsetTop;
    const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      ui.x = panel.offsetLeft;
      ui.y = panel.offsetTop;
      saveUi();
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
  });
  // Resizing from the bottom right corner; double click goes back to the normal size.
  const grip = $(".grip");
  const applySize = () => {
    panel.style.width = !ui.monitor && ui.w ? `${ui.w}px` : "";
    panel.style.height = !ui.monitor && ui.h && !ui.folded ? `${ui.h}px` : "";
    panel.style.maxHeight = !ui.monitor && ui.h && !ui.folded ? "none" : "";
  };
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Anchored by its left side while resizing, so it grows to the right and down.
    place(panel.offsetLeft, panel.offsetTop);
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = panel.offsetWidth;
    const sh = panel.offsetHeight;
    const move = (ev) => {
      ui.w = Math.round(Math.min(Math.max(300, sw + ev.clientX - sx), innerWidth - panel.offsetLeft - 4, 1200));
      ui.h = Math.round(Math.min(Math.max(200, sh + ev.clientY - sy), innerHeight - panel.offsetTop - 4));
      applySize();
    };
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      ui.x = panel.offsetLeft;
      ui.y = panel.offsetTop;
      saveUi();
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
  });
  grip.addEventListener("dblclick", () => {
    ui.w = null;
    ui.h = null;
    applySize();
    saveUi();
  });
  // Keeps clicks and keys in the panel away from the game behind it.
  for (const type of ["pointerdown", "mousedown", "click", "keydown", "keyup", "keypress", "wheel"]) panel.addEventListener(type, (e) => e.stopPropagation());
  search.addEventListener("input", () => render());

  // --- Writing in the chat --------------------------------------------------
  // Asks once (unless "No volver a mostrar"), then puts the text where the
  // player will send it: the monitor's box, or Kirka's chat box.
  const warn = $(".warn");
  let pending = null;
  $(".warn-ok").onclick = () => {
    if ($(".warn-skip").checked) {
      ui.noWarn = true;
      saveUi();
    }
    warn.hidden = true;
    const text = pending;
    pending = null;
    if (text != null) place_(text);
  };
  $(".warn-no").onclick = () => {
    warn.hidden = true;
    pending = null;
  };
  function prepare(text) {
    if (ui.noWarn) return place_(text);
    pending = text;
    $(".warn-text").textContent = text;
    $(".warn-skip").checked = false;
    warn.hidden = false;
  }
  async function place_(text) {
    if (ui.monitor) {
      chatInput.value = text;
      chatInput.focus();
      // The cursor goes to the first empty [ ] so the player fills it in.
      const gap = text.indexOf("[ ]");
      if (gap >= 0) chatInput.setSelectionRange(gap + 1, gap + 2);
      return;
    }
    try {
      const r = await call("write", text);
      if (r && r.ok) return toast.show("Listo en tu chat de Kirka: revísalo y presiona Enter para enviarlo");
    } catch {}
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`Copiado: ${text}. Pégalo en el chat de Kirka.`);
    } catch {
      toast.show(`Escribe en el chat: ${text}`);
    }
  }
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim().slice(0, 200);
    if (!text) return;
    if (/\[\s\]/.test(text)) return toast.show("Completa lo que va entre [ ] antes de enviarlo");
    if (Date.now() - lastSay < 2000) return toast.show("Espera un momento entre mensajes");
    lastSay = Date.now();
    try {
      const r = await call("say", text);
      if (r && r.ok) {
        chatInput.value = "";
        return;
      }
    } catch {}
    toast.show("No encontré el chat de Kirka: abre el chat del menú y vuelve a intentar");
  });

  // --- Cards --------------------------------------------------------------
  function skinChip(sk) {
    const chip = el("span", `chip skin r-${sk.rarity}`);
    if (sk.render && SAFE_IMG.test(sk.render)) {
      const img = el("img", "thumb");
      img.src = sk.render;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => img.remove();
      chip.append(img);
    }
    chip.append(el("b", "", `${sk.qty > 1 ? `${sk.qty.toLocaleString()}x ` : ""}${sk.name}`), el("span", "", ` ${sk.type} · ${sk.average ? `≈ ${fmtCoins(sk.average * (sk.qty || 1))}` : "sin precio"}`));
    chip.append(peek(sk));
    return chip;
  }
  // One item of an offer: picture, name, how many and its value; the big picture on hover.
  function itemRow(x) {
    const sk = x.skin;
    const row = el("div", `oitem r-${x.rarity || (sk && sk.rarity) || ""}`);
    if (sk && sk.render && SAFE_IMG.test(sk.render)) {
      const img = el("img", "thumb");
      img.src = sk.render;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => img.remove();
      row.append(img);
    }
    row.append(el("b", "", `${x.name}${x.type && x.type !== "Character" ? ` ${x.type}` : ""}`), el("span", "", `x${x.qty.toLocaleString()}`));
    row.append(el("span", "v", sk && sk.average ? fmtCoins(sk.average * x.qty) : "?"));
    if (sk) row.append(peek(sk));
    return row;
  }
  // The bigger picture and the three price lists, on hover.
  function peek(sk) {
    const box = el("span", `peek r-${sk.rarity}`);
    if (sk.render && SAFE_IMG.test(sk.render)) {
      const img = el("img");
      img.src = sk.render;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => img.remove();
      box.append(img);
    }
    box.append(el("b", "", sk.name), el("small", "", `${RARITY[sk.rarity] || ""} · ${sk.type} · ${sk.copies} copias`), el("small", "", listsText(sk)));
    return box;
  }

  const visible = (it) =>
    ui.filter === "all" || (ui.filter === "watch" ? it.watched.length > 0 : ui.filter === "offer" ? it.kind === "offer" || it.kind === "status" : it.kind === ui.filter);

  function card(it) {
    const c = el("div", `card ${it.kind}${it.watched.length ? " watched" : ""}${it.canAccept === "all" ? " mine" : ""}`);
    cardOf.set(it, c);
    const meta = el("div", "meta");
    meta.append(el("span", "tag", it.kind === "status" ? STATUS_LABEL[it.status] : LABEL[it.kind]), el("span", "who", it.from));
    meta.append(el("span", "time", new Date(it.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    c.append(meta);
    if (it.kind === "offer") {
      const box = el("div", "oside-box");
      const col = (label, list, sum) => {
        const d = el("div", "oside");
        d.append(el("small", "", label));
        for (const x of list) d.append(itemRow(x));
        d.append(el("div", "total", sum ? `≈ ${fmtCoins(sum)} coins` : "sin precio"));
        return d;
      };
      box.append(col(`${it.from} da`, it.theirItems, it.theirTotal), el("span", "arrow", "⇄"), col("Pide (tú das)", it.yourItems, it.yourTotal));
      c.append(box);
      if (it.theirTotal && it.yourTotal) {
        const diff = it.theirTotal - it.yourTotal;
        const even = Math.abs(diff) <= 0.1 * Math.max(it.theirTotal, it.yourTotal);
        c.append(el("div", `verdict ${even ? "even" : diff > 0 ? "win" : "lose"}`, even ? "Si la aceptas: trato parejo" : diff > 0 ? `Si la aceptas: ganas ≈ ${fmtCoins(diff)} coins` : `Si la aceptas: pierdes ≈ ${fmtCoins(-diff)} coins`));
      }
      if (it.canAccept) {
        const have = el("div", "chips");
        have.append(el("span", it.canAccept === "all" ? "chip own" : "chip", it.canAccept === "all" ? "Tienes lo que pide" : "Tienes parte de lo que pide"));
        c.append(have);
      }
      const actions = el("div", "actions");
      const accept = el("button", "", `Aceptar #${it.number}`);
      accept.onclick = () => prepare(`/trade accept ${it.number}`);
      actions.append(accept);
      c.append(actions);
    } else {
      c.append(el("div", "text", it.text));
      if (it.kind === "status" && (it.status === "confirm" || it.status === "accepted")) {
        const actions = el("div", "actions");
        const confirm = el("button", "", "Confirmar");
        confirm.onclick = () => prepare("/trade confirm");
        const cancel = el("button", "ghost", "Cancelar");
        cancel.onclick = () => prepare("/trade cancel");
        actions.append(confirm, cancel);
        c.append(actions);
      }
    }
    const chips = el("div", "chips");
    for (const w of it.watched) chips.append(el("span", "chip gold", `★ ${w}`));
    if (it.kind !== "offer" && it.kind !== "status")
      for (const sk of it.skins || []) {
        chips.append(skinChip(sk));
        const mine = it.kind === "buy" && ownedOf(sk);
        if (mine) chips.append(el("span", "chip own", `Tienes ${mine.amount}`));
      }
    if (it.price) chips.append(el("span", "chip", `${it.kind === "buy" ? "Paga" : it.kind === "sell" ? "Pide" : "Precio"} ${fmtCoins(it.price)} coins`));
    if (it.verdict === "deal") chips.append(el("span", "chip deal", "Buena oferta"));
    if (it.verdict === "high") chips.append(el("span", "chip high", "Cara"));
    if (chips.children.length) c.append(chips);
    const reply = replyFor(it);
    if (reply) {
      const actions = el("div", "actions");
      const msg = el("button", "", reply.label);
      msg.onclick = () => prepare(reply.text.endsWith(" ") ? reply.text : `${reply.text}`);
      actions.append(msg);
      if (reply.offer) {
        const offer = el("button", "ghost", "Ofrecer trade");
        offer.onclick = () => prepare(reply.offer);
        actions.append(offer);
      }
      c.append(actions);
    }
    return c;
  }

  const cardOf = new WeakMap(); // item -> its card, to go to it from the chat

  // From a line of the monitor's chat to its card in the panel.
  function focusCard(it) {
    if (ui.filter === "history" || ui.filter === "inv" || !visible(it)) ui.filter = "all";
    ui.folded = false;
    render();
    const c = cardOf.get(it);
    if (!c || !c.isConnected) return toast.show("Esa línea ya no está en el panel");
    c.scrollIntoView({ block: "center", behavior: "smooth" });
    c.classList.remove("flash");
    void c.offsetWidth;
    c.classList.add("flash");
  }

  function tradeCard(t) {
    const c = el("div", "card trade");
    const meta = el("div", "meta");
    meta.append(el("span", "tag", `Trade #${t.id}`), el("span", "time", t.at ? new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""));
    const people = el("div", "people");
    people.append(el("b", "", t.offerer.split("#")[0]), document.createTextNode(" le dio a "), el("b", "", t.accepter.split("#")[0]));
    c.append(meta, people);
    const col = (label, s) => {
      const d = el("div", "col");
      d.append(el("small", "", label));
      for (const it of s.items) {
        const sk = skinByName(it.name);
        const row = el("div", `item r-${it.rarity || (sk && sk.rarity) || ""}`);
        row.title = `${RARITY[it.rarity] || ""} · ${fmtCoins(it.value)} c/u`;
        if (sk && sk.render && SAFE_IMG.test(sk.render)) {
          const img = el("img", "thumb");
          img.src = sk.render;
          img.alt = "";
          img.loading = "lazy";
          img.onerror = () => img.remove();
          row.append(img);
        }
        row.append(el("b", "", it.name), el("span", "", `x${it.quantity}`));
        d.append(row);
      }
      if (s.total) d.append(el("div", "total", `≈ ${fmtCoins(s.total)} coins`));
      return d;
    };
    const sides = el("div", "sides");
    sides.append(col(`${t.offerer.split("#")[0]} dio`, t.offered), el("span", "arrow", "⇄"), col(`${t.accepter.split("#")[0]} dio`, t.wanted));
    c.append(sides);
    return c;
  }

  function render() {
    for (const b of filtersEl.children) b.classList.toggle("on", b.dataset.f === ui.filter);
    panel.classList.toggle("folded", ui.folded && !ui.monitor);
    panel.classList.toggle("monitor", ui.monitor);
    foldBtn.hidden = ui.monitor;
    monBtn.textContent = ui.monitor ? "Cerrar monitor" : "Monitor";
    earBtn.textContent = !earOn ? "Oído: no" : earState.listening ? "Oído: sí" : "Oído: abriendo…";
    earBtn.className = `hbtn ear ${earOn && earState.listening ? "on" : earOn ? "" : "off"}`;
    earWinBtn.hidden = !ear || !earOn;
    earWinBtn.textContent = earState.visible ? "Ocultar oído" : "Ver oído";
    listenBtn.textContent = ui.listen ? "● Escuchando" : "○ En pausa";
    listenBtn.className = `hbtn listen ${ui.listen ? "on" : "off"}`;
    foldBtn.textContent = ui.folded ? "+" : "–";
    count.textContent = ui.folded && unread ? String(unread) : "";
    panel.hidden = !enabled || (playing() && !ui.monitor);
    applySize();
    search.hidden = (ui.folded && !ui.monitor) || (ui.filter !== "history" && ui.filter !== "inv");
    search.placeholder = ui.filter === "inv" ? "Buscar en tu inventario" : "Buscar jugador, skin o #trade";
    if (ui.folded && !ui.monitor) return;
    if (ui.filter === "inv") return renderInventory();
    if (ui.filter === "history") {
      loadHistory();
      const found = searchTrades(history, search.value).slice(0, 40);
      return list.replaceChildren(...(found.length ? found.map(tradeCard) : [el("div", "empty", history.length ? "Ningún trade de hoy con eso." : "Cargando los trades de hoy…")]));
    }
    items = pruneItems(items, Date.now());
    const shown = items.filter(visible);
    list.replaceChildren(
      ...(shown.length
        ? shown.map(card)
        : [el("div", "empty", !ui.listen ? "En pausa: presiona «En pausa» para volver a escuchar el chat." : items.length ? "Nada en este filtro todavía." : "Aquí salen las ofertas que te lleguen y quién vende, compra o cambia en el chat de Kirka.")])
    );
  }

  // My inventory: the skins with a price, to pick what to trade. The box on top
  // says what to ask for them and writes the ad (only when the player says so).
  function renderInventory() {
    loadInventory();
    const nodes = [];
    if (picks.size) nodes.push(builder());
    if (invEntries === null) {
      const note = el("div", "inv-note", "Abre tu inventario en Kirka una vez para que RITE lo lea.");
      const again = el("button", "", "Volver a leer");
      again.onclick = () => loadInventory(true);
      note.append(again);
      nodes.push(note);
      return list.replaceChildren(...nodes);
    }
    if (!priceIndex.size) {
      nodes.push(el("div", "inv-note", "Cargando los precios de KirkaTrades…"));
      return list.replaceChildren(...nodes);
    }
    const valueOf = (sk) => (ui.best ? bestOf(sk).value : sk.average || 0);
    const shown = sortOwned(filterOwned(owned, { q: search.value, rar: ui.invRar, type: ui.invType, dup: ui.invDup }), ui.invSort, ui.invDir, valueOf);
    const total = owned.reduce((n, o) => n + valueOf(o.skin) * o.amount, 0);
    // Golden Chests: the "gold" that goes as money in trades.
    const golden = owned.find((o) => o.skin.type === "Chest" && /^golden$/i.test(o.skin.name));
    if (golden) {
      const g = el("div", "gold");
      if (golden.skin.render && SAFE_IMG.test(golden.skin.render)) {
        const img = el("img");
        img.src = golden.skin.render;
        img.alt = "";
        g.append(img);
      }
      g.append(document.createTextNode(`Oro: ${golden.amount.toLocaleString()} Golden Chests (≈ ${fmtCoins(golden.amount * GOLDEN_VALUE)} coins)`));
      nodes.push(g);
    }
    nodes.push(invTools());
    const head = el("div", "inv-note", `${shown.length === owned.length ? owned.length : `${shown.length} de ${owned.length}`} items · valor total ≈ ${fmtCoins(roundPrice(total))} coins.${ui.invDup ? " Al tocar una, se escogen las que te sobran." : " Toca los que quieres tradear."}`);
    const again = el("button", "", "Volver a leer");
    again.onclick = () => loadInventory(true);
    head.append(again);
    nodes.push(head);
    if (!owned.length) nodes.push(el("div", "empty", "No encontré skins con precio. Abre tu inventario en Kirka y presiona «Volver a leer»."));
    else if (!shown.length) nodes.push(el("div", "empty", "Nada con estos filtros."));
    const grid = el("div", "inv-grid");
    for (const o of shown) {
      const sk = o.skin;
      const tile = el("button", `inv-tile r-${sk.rarity}${picks.has(o.key) ? " on" : ""}`);
      tile.title = `${sk.name} · ${RARITY[sk.rarity] || ""} · ${sk.type}\n${listsText(sk)}`;
      if (sk.render && SAFE_IMG.test(sk.render)) {
        const img = el("img");
        img.src = sk.render;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => (img.style.visibility = "hidden");
        tile.append(img);
      }
      const best = bestOf(sk);
      const price = el("span", "val", !(best.value > 0) ? "Sin precio aún" : ui.best ? `${fmtCoins(best.value)} ${best.from}` : `${fmtCoins(sk.average)} promedio`);
      tile.append(el("b", "", sk.name), el("span", "", `${sk.type === "Character" ? "Personaje" : sk.type} · ${RARITY[sk.rarity] || ""}`), price);
      if (o.amount > 1) tile.append(el("i", "", `x${o.amount.toLocaleString()}`));
      tile.onclick = () => {
        if (picks.has(o.key)) picks.delete(o.key);
        // With "Repetidas", the extras: you keep one.
        else picks.set(o.key, ui.invDup && o.amount > 1 ? o.amount - 1 : 1);
        customPrice = null;
        render();
      };
      grid.append(tile);
    }
    nodes.push(grid);
    list.replaceChildren(...nodes);
  }

  // Rarity, weapon, "Repetidas" and the order.
  function invTools() {
    const box = el("div", "inv-tools");
    const set = (patch) => {
      Object.assign(ui, patch);
      saveUi();
      render();
    };
    for (const r of RARITY_ORDER) {
      const n = owned.filter((o) => o.skin.rarity === r).length;
      const b = el("button", `rb r-${r}${ui.invRar.includes(r) ? " on" : ""}${n ? "" : " none"}`, r);
      b.title = `${RARITY[r]}: ${n}`;
      b.onclick = () => set({ invRar: ui.invRar.includes(r) ? ui.invRar.filter((x) => x !== r) : [...ui.invRar, r] });
      box.append(b);
    }
    box.append(el("span", "sep"));
    const type = el("select");
    type.title = "Arma";
    const types = [...new Set(owned.map((o) => o.skin.type))].sort();
    for (const [v, label] of [["", "Todas las armas"], ...types.map((t) => [t, t === "Character" ? "Personajes" : t === "Chest" ? "Cofres" : t === "Card" ? "Cartas" : t])]) {
      const opt = el("option", "", label);
      opt.value = v;
      type.append(opt);
    }
    type.value = types.includes(ui.invType) ? ui.invType : "";
    type.onchange = () => set({ invType: type.value });
    const dup = el("button", `tg${ui.invDup ? " on" : ""}`, "Repetidas");
    dup.title = "Solo las que tienes más de una: puedes tradear las que sobran sin quedarte sin ella";
    dup.onclick = () => set({ invDup: !ui.invDup });
    box.append(type, dup, el("span", "sep"));
    const sort = el("select");
    sort.title = "Ordenar";
    for (const [v, label] of [["value", "Valor"], ["name", "Nombre"], ["amount", "Cantidad"], ["rarity", "Rareza"]]) {
      const opt = el("option", "", label);
      opt.value = v;
      sort.append(opt);
    }
    sort.value = ui.invSort;
    sort.onchange = () => set({ invSort: sort.value, invDir: sort.value === "name" ? "asc" : "desc" });
    const dir = el("button", "tg", ui.invSort === "name" ? (ui.invDir === "asc" ? "A → Z" : "Z → A") : ui.invDir === "asc" ? "↑ Menor" : "↓ Mayor");
    dir.title = "Cambiar el orden";
    dir.onclick = () => set({ invDir: ui.invDir === "asc" ? "desc" : "asc" });
    box.append(sort, dir, el("span", "sep"));
    const best = el("button", `tg${ui.best ? " on" : ""}`, "Mejor precio");
    best.title = "Usa la lista que más paga (BOLT, FATE o BROS) como tu precio; las demás quedan de referencia";
    best.onclick = () => {
      customPrice = null;
      set({ best: !ui.best });
    };
    box.append(best);
    return box;
  }

  function builder() {
    const box = el("div", "builder");
    const chosen = [...picks].map(([key, qty]) => ({ key, qty, skin: ownedByKey.get(key).skin, max: ownedByKey.get(key).amount }));
    box.append(el("h4", "", "Lo que quieres tradear"));
    const row = el("div", "picks");
    for (const p of chosen) {
      const chip = el("span", `pick r-${p.skin.rarity}`);
      chip.append(el("b", "", p.skin.name), el("span", "", `x${p.qty}`));
      const step = (label, d, title) => {
        const b = el("button", "", label);
        b.title = title;
        b.onclick = () => {
          const n = p.qty + d;
          if (n <= 0) picks.delete(p.key);
          else picks.set(p.key, Math.min(n, p.max));
          customPrice = null;
          render();
        };
        return b;
      };
      chip.append(step("−", -1, "Uno menos"), step("+", 1, "Uno más"), step("×", -p.qty, "Quitar"));
      row.append(chip);
    }
    box.append(row);
    const { least, fair, best } = suggestPrice(chosen);
    const target = ui.best ? best : fair;
    const floor = ui.best ? best : least;
    const seg = el("div", "seg");
    for (const [mode, label] of [["sell", "Vender"], ["swap", "Cambiar"]]) {
      const b = el("button", adMode === mode ? "on" : "", label);
      b.onclick = () => {
        adMode = mode;
        render();
      };
      seg.append(b);
    }
    const pay = el("div", "seg");
    pay.title = "En qué pides el pago";
    for (const [v, label] of [["coins", "Coins"], ["golden", "Oro (Golden)"]]) {
      const b = el("button", ui.pay === v ? "on" : "", label);
      b.onclick = () => {
        ui.pay = v;
        saveUi();
        render();
      };
      pay.append(b);
    }
    const price = el("input", "price");
    price.type = "text";
    price.inputMode = "numeric";
    price.value = customPrice ?? target ? chatCoins(customPrice ?? target) : "";
    price.placeholder = "tu precio";
    price.title = "Lo que pides en total: 450k, 1.2m…";
    const controls = el("div", "row");
    controls.append(seg, pay);
    const priceRow = el("div", "row");
    const inGold = el("span", "hint");
    priceRow.append(el("span", "hint", adMode === "sell" ? "Pides (en coins)" : "Valen (en coins)"), price, inGold);
    box.append(controls, priceRow);
    const hint = el("div", "hint");
    if (!(best > 0)) {
      hint.append(document.createTextNode("Las listas todavía no tienen precio para esto (skin nueva): pon tú el precio o pide ofertas."));
    } else if (ui.best) {
      const from = chosen.length === 1 ? ` (${bestOf(chosen[0].skin).from})` : "";
      hint.append(document.createTextNode("Tu precio: "), el("b", "", `${fmtCoins(best)}${from}`), document.createTextNode(` · referencia: promedio ${fmtCoins(fair)}, lista más baja ${fmtCoins(least)}`));
    } else {
      hint.append(document.createTextNode("Pide por lo menos "), el("b", "", fmtCoins(least)), document.createTextNode(" (la lista más baja) · promedio "), el("b", "", fmtCoins(fair)), document.createTextNode(" · mejor lista "), el("b", "", fmtCoins(best)));
    }
    const low = el("div", "low");
    const ad = el("div", "ad");
    const refresh = () => {
      const value = customPrice ?? target;
      ad.textContent = adFor(chosen, adMode, value, ui.pay);
      inGold.textContent = ui.pay === "golden" ? `= ${Math.max(1, Math.round(value / GOLDEN_VALUE)).toLocaleString()} Golden Chests` : "";
      low.textContent =
        adMode === "sell" && value > 0 && value < floor ? (ui.best ? `Estás pidiendo menos que tu mejor precio (${fmtCoins(best)}).` : `Estás pidiendo menos que la lista más baja (${fmtCoins(least)}).`) : "";
      low.hidden = !low.textContent;
    };
    price.addEventListener("input", () => {
      const v = parsePrice(`${price.value.trim()} coins`);
      customPrice = v || null;
      refresh();
    });
    refresh();
    const actions = el("div", "actions");
    const write = el("button", "", "Escribir en el chat");
    write.onclick = () => ad.textContent && prepare(ad.textContent);
    const clear = el("button", "ghost", "Limpiar");
    clear.onclick = () => {
      picks.clear();
      customPrice = null;
      render();
    };
    actions.append(write, clear);
    box.append(hint, low, ad, el("div", "hint", "Kirka banea por spam: no repitas el anuncio seguido, y por vender skins por dinero real."), actions);
    return box;
  }

  // The whole chat, for the monitor.
  function chatLine(l) {
    const d = el("div", `chat-line${l.server ? " server" : ""}${l.kind ? ` ${l.kind}` : ""}${l.watched ? " watched" : ""}${l.item ? " has-card" : ""}`);
    d.append(el("b", "", l.name || "SERVER"));
    // Kirka's item tags become chips with picture and price (and the big picture on hover).
    let last = 0;
    const message = l.message.replace(/\*\*/g, "");
    for (const m of message.matchAll(TAG)) {
      if (m.index > last) d.append(document.createTextNode(message.slice(last, m.index)));
      const t = { name: clean(m[1]), type: clean(m[2]) || TAG_TYPE[m[3]] || "", rarity: TAG_RARITY[m[4]] || "", qty: m[5] ? Number(m[5]) : 1 };
      const sk = withQty(skinForTag(t), t.qty);
      d.append(sk ? skinChip(sk) : el("span", "chip", tagName(t)));
      last = m.index + m[0].length;
    }
    if (last < message.length) d.append(document.createTextNode(message.slice(last)));
    if (l.item) {
      d.title = "Ver en el panel";
      d.onclick = () => focusCard(l.item);
    }
    return d;
  }
  function renderChat() {
    if (!ui.monitor) return;
    const atBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 40;
    chatLog.replaceChildren(...(chatLines.length ? chatLines.map(chatLine) : [el("div", "empty", "Todavía no hay mensajes. Abre el chat de Kirka una vez si no aparecen.")]));
    if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
  }

  function enrich(it) {
    if (it.kind === "offer") {
      const side = (tags, text) =>
        tags && tags.length ? tags.map((t) => ({ name: t.name, type: t.type, rarity: t.rarity, qty: t.qty, skin: skinForTag(t) })) : [{ name: text, type: "", rarity: "", qty: 1, skin: skinByName(text) }];
      it.theirItems = side(it.theirTags, it.theirs);
      it.yourItems = side(it.yourTags, it.yours);
      const total = (list) => list.reduce((n, x) => n + (x.skin ? x.skin.average * x.qty : 0), 0);
      it.theirTotal = total(it.theirItems);
      it.yourTotal = total(it.yourItems);
      // Whether you have what they ask for.
      const have = it.yourItems.filter((x) => x.skin && ownedOf(x.skin) && ownedOf(x.skin).amount >= x.qty).length;
      it.canAccept = have === it.yourItems.length ? "all" : have ? "some" : "";
    } else if (it.kind !== "status") {
      it.skins = it.tags && it.tags.length ? it.tags.map((t) => withQty(skinForTag(t), t.qty)).filter(Boolean) : findSkins(it.text, priceIndex);
      if (it.kind === "sell" && it.skins.length === 1) it.verdict = judgePrice(it.price, it.skins[0].average * (it.skins[0].qty || 1));
    }
  }

  function add(line) {
    const it = parseTradeLine(line, watch);
    const entry = { name: line.name, message: line.message, server: !line.name || /^server$/i.test(line.name), kind: it && it.kind !== "mention" && it.kind !== "status" ? it.kind : "", watched: Boolean(it && it.watched.length), item: it || null };
    chatLines.push(entry);
    if (chatLines.length > KEEP_CHAT) chatLines.splice(0, chatLines.length - KEEP_CHAT);
    if (!it) return;
    it.at = Date.now();
    enrich(it);
    items.unshift(it);
    if (items.length > KEEP) items.length = KEEP;
    if ((ui.folded && !ui.monitor) || !visible(it)) unread++;
    if (quiet) return;
    if (it.kind === "offer") {
      // Offers go to everyone: a notice only when you have what they ask for, or it names a skin you look for.
      if (it.canAccept === "all" || it.watched.length) {
        const diff = it.theirTotal && it.yourTotal ? it.theirTotal - it.yourTotal : 0;
        toast.show(`Oferta #${it.number} de ${it.from}: da ${it.theirs} por ${it.yours}${diff > 0 ? ` (ganas ≈ ${fmtCoins(diff)})` : ""}`);
        panel.classList.remove("flash");
        void panel.offsetWidth;
        panel.classList.add("flash");
      }
    } else if (it.kind === "status" && (it.status === "done" || it.status === "cancel")) {
      toast.show(STATUS_LABEL[it.status]);
    } else if (it.watched.length && (it.kind === "sell" || it.kind === "swap" || it.kind === "mention")) {
      toast.show(`${it.from} ${it.kind === "sell" ? "vende" : "nombra"} ${it.watched.join(", ")}${it.verdict === "deal" ? " (buena oferta)" : ""}`);
    } else if (it.kind === "buy" && (it.skins || []).some((sk) => ownedOf(sk))) {
      const sk = it.skins.find((x) => ownedOf(x));
      toast.show(`${it.from} compra ${sk.name} y tú tienes ${ownedOf(sk).amount}`);
    } else if (it.verdict === "deal") {
      toast.show(`Buena oferta: ${it.from} vende ${it.skins[0].name} en ${fmtCoins(it.price)} (ref. ${fmtCoins(it.skins[0].average)})`);
    }
  }

  async function tick() {
    timer = null;
    if (!enabled || !ui.listen) return render();
    if (!document.hidden) {
      loadPrices();
      if (!playing()) loadInventory();
      try {
        const r = await call("poll");
        failures = r && r.ok ? 0 : failures + 1;
        if (r && r.ok && r.lines.length) {
          // The first read only fills the panel with what was already in the chat, without notices.
          quiet = !primed;
          r.lines.filter(fresh).forEach(add);
          quiet = false;
          if (!primed) unread = 0;
          render();
          renderChat();
        } else if (items.length) render(); // expired cards go
        if (r && r.ok) primed = true;
      } catch {
        failures++;
      }
    }
    // Without Kirka's chat (loading, or a Kirka update renamed it) it checks less often.
    const wait = failures > 5 ? POLL_MS * 6 : playing() ? POLL_PLAYING_MS : POLL_MS;
    timer = setTimeout(tick, wait);
  }
  document.addEventListener("pointerlockchange", () => {
    // Going into the game closes the monitor.
    if (playing() && ui.monitor) ui.monitor = false;
    render();
  });
  addEventListener("resize", () => ui.x != null && !ui.monitor && place(ui.x, ui.y));

  function update(settings) {
    watch = parseWatch(settings.tradeWatch);
    earOn = Boolean(settings.tradeEar);
    const on = Boolean(settings.tradeHelper) && !settings.tournamentMode;
    if (on === enabled) return render();
    enabled = on;
    if (on) {
      if (ui.x != null) requestAnimationFrame(() => place(ui.x, ui.y));
      render();
      if (!timer) tick();
    } else {
      if (timer) clearTimeout(timer);
      timer = null;
      ui.monitor = false;
      render();
    }
  }

  update(getSettings());
  return { update };
}

module.exports = { parseTags, untag, bestOf, filterOwned, sortOwned, matchInventory, roundPrice, suggestPrice, adFor, chatCoins, searchTrades, parseTradeLine, parsePrice, parseWatch, matchWatch, intentOf, pruneItems, replyFor, buildPriceIndex, findSkins, judgePrice, installTradePage, createTradeHelper };
