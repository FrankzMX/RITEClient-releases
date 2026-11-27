"use strict";

// Reference prices for the Trade Helper. The price of each skin comes from the
// community value sheet (Google Sheets through opensheet.elk.sh, "Sorted View").
// KirkaTrades (kirka.lukeskywalk.com, by skywalk) adds pictures, copies and the
// BOLT, FATE and BROS lists, and its trade average stays as the price of skins
// the sheet has no value for (new or TBD) or when the sheet is down. The client
// downloads both at most every 30 minutes and hands the page a short version
// (name, type, rarity, average = the price used, copies).

const SOURCE = "https://kirka.lukeskywalk.com/priceList.json";
const SHEET = "https://opensheet.elk.sh/1pxMSoaSo8FYv-OIJ26HpSj8EDy7EDRmatHyQW24o6E4/Sorted+View";
const TYPES = ["Character", "Bayonet", "VITA", "Shark", "SCAR", "AR-9", "Revolver", "MAC-10", "LAR", "Weatie", "Tomahawk", "M60", "Chest", "Card"];
const TYPE_BY_LOWER = new Map(TYPES.map((t) => [t.toLowerCase(), t]));
const RARITY_LETTER = { common: "C", rare: "R", epic: "E", legendary: "L", mythical: "M", paranormal: "P" };
// Trades completed today (refreshed by KirkaTrades every 15 minutes).
const TRADES = "https://kirka.lukeskywalk.com/tradehistory/dailyTrades.json";
const TRADES_EVERY = 10 * 60 * 1000;
const KEEP_TRADES = 300;
const EVERY = 30 * 60 * 1000;
const RARITIES = new Set(["C", "R", "E", "L", "M", "P"]);

// Keeps what looks valid: skins with a name. New skins come without a price
// yet (average 0): they stay for the inventory, the chat leaves them out.
function cleanPrices(data) {
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const it of data) {
    if (!it || typeof it.itemName !== "string") continue;
    const name = it.itemName.trim().slice(0, 40);
    const average = Math.round(Number(it.average));
    if (!name || !Number.isFinite(average) || average < 0) continue;
    out.push({
      name,
      type: typeof it.type === "string" ? it.type.slice(0, 20) : "",
      rarity: RARITIES.has(it.rarity) ? it.rarity : "",
      average,
      // Each price list of the community (BOLT, FATE, BROS); 0 = not listed there.
      lists: Object.fromEntries(["bolt", "fate", "bros"].map((k) => [k, Math.max(0, Math.round(Number(it[k]) || 0))])),
      // Its picture on KirkaTrades (only from that site).
      render: typeof it.render === "string" && it.render.startsWith("https://kirka.lukeskywalk.com/") ? it.render.slice(0, 300) : "",
      copies: Number.isFinite(Number(it.inventory)) ? Math.max(0, Math.round(Number(it.inventory))) : 0,
    });
    if (out.length >= 5000) break;
  }
  return out;
}

// "Vita", "Ar-9?", "Charater" -> "VITA", "AR-9", "Character".
function sheetType(raw) {
  const low = String(raw ?? "").replace(/\?/g, "").trim().toLowerCase();
  return low === "charater" ? "Character" : TYPE_BY_LOWER.get(low) || "";
}

// Rows of the value sheet with a price: name, type, rarity letter, value in coins.
function cleanSheet(data) {
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const name = String(r["Skin Name"] ?? "").trim().slice(0, 40);
    const raw = String(r["Base Value"] ?? r["Hub Value"] ?? "").replace(/[,\s]/g, "");
    const value = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (!name || !(value > 0) || !Number.isSafeInteger(value)) continue;
    out.push({ name, type: sheetType(r["Type"]), rarity: RARITY_LETTER[String(r["Skin Rarity"] ?? "").trim().toLowerCase()] || "", value });
    if (out.length >= 5000) break;
  }
  return out;
}

// The sheet's value replaces the trade average (kept as `trades`); skins only on
// the sheet are added without picture or copies.
function applySheet(list, sheet) {
  if (!sheet.length) return list;
  const key = (name, type) => `${name.toLowerCase()}|${type.toLowerCase()}`;
  const byKey = new Map(sheet.map((r) => [key(r.name, r.type), r]));
  const used = new Set();
  const out = list.map((s) => {
    const r = byKey.get(key(s.name, s.type));
    if (!r) return s;
    used.add(r);
    return { ...s, average: r.value, trades: s.average };
  });
  for (const r of sheet) {
    if (used.has(r) || !r.type) continue;
    out.push({ name: r.name, type: r.type, rarity: r.rarity, average: r.value, trades: 0, lists: { bolt: 0, fate: 0, bros: 0 }, render: "", copies: 0 });
  }
  return out;
}

// One side of a trade: its items (name, rarity, quantity, value of one) and total.
function cleanSide(side) {
  const items = (Array.isArray(side?.items) ? side.items : [])
    .filter((it) => it && typeof it.name === "string")
    .slice(0, 12)
    .map((it) => ({
      name: it.name.trim().slice(0, 40),
      rarity: RARITIES.has(it.rarity) ? it.rarity : "",
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
      value: Math.max(0, Math.round(Number(it.value) || 0)),
    }));
  return { total: Math.max(0, Math.round(Number(side?.total) || 0)), items };
}

// Completed trades, newest first.
function cleanTrades(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter((t) => t && t.trade && Number.isFinite(Number(t.tradeId)))
    .map((t) => ({
      id: Number(t.tradeId),
      offerer: String(t.offerer || "").slice(0, 40),
      accepter: String(t.accepter || "").slice(0, 40),
      at: Number(t.receivedAt) || Date.parse(t.updatedAt) || 0,
      offered: cleanSide(t.trade.offered),
      wanted: cleanSide(t.trade.wanted),
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, KEEP_TRADES);
}

class Prices {
  constructor({ fetch, now = Date.now }) {
    this.fetch = fetch;
    this.now = now;
    this.list = [];
    this.at = 0;
    this.pending = null;
    this.trades = { at: 0, list: [], pending: null };
  }

  // Today's completed trades, downloaded again after 10 minutes.
  async history() {
    const t = this.trades;
    if (t.list.length && this.now() - t.at < TRADES_EVERY) return { ok: true, at: t.at, list: t.list };
    t.pending ||= (async () => {
      try {
        const res = await this.fetch(TRADES);
        if (res.status === 200) {
          const list = cleanTrades(await res.json());
          if (list.length) {
            t.list = list;
            t.at = this.now();
          }
        }
      } catch {}
      t.pending = null;
    })();
    await t.pending;
    return { ok: t.list.length > 0, at: t.at, list: t.list };
  }

  // The list, downloaded again when it is older than 30 minutes. A failed
  // download keeps the last good list.
  async get() {
    if (this.list.length && this.now() - this.at < EVERY) return { ok: true, at: this.at, list: this.list };
    this.pending ||= (async () => {
      const load = async (url, clean) => {
        try {
          const res = await this.fetch(url);
          return res.status === 200 ? clean(await res.json()) : [];
        } catch {
          return [];
        }
      };
      const [list, sheet] = await Promise.all([load(SOURCE, cleanPrices), load(SHEET, cleanSheet)]);
      // Without KirkaTrades a last good list (with pictures) is better than the sheet alone.
      const merged = !list.length && this.list.length ? [] : applySheet(list, sheet);
      if (merged.length) {
        this.list = merged;
        this.at = this.now();
      }
      this.pending = null;
    })();
    await this.pending;
    return { ok: this.list.length > 0, at: this.at, list: this.list };
  }
}

module.exports = { Prices, cleanPrices, cleanSheet, applySheet, cleanTrades, SOURCE, SHEET, TRADES };
