"use strict";

// Reference prices for the Trade Helper, from KirkaTrades (kirka.lukeskywalk.com,
// by skywalk). Its price list is public, needs no key and lists every skin with
// its price in the BOLT, FATE and BROS lists and their average, in coins. The client downloads it at most every 30 minutes
// and hands the page a short version (name, type, rarity, average, copies).

const SOURCE = "https://kirka.lukeskywalk.com/priceList.json";
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
      try {
        const res = await this.fetch(SOURCE);
        if (res.status === 200) {
          const list = cleanPrices(await res.json());
          if (list.length) {
            this.list = list;
            this.at = this.now();
          }
        }
      } catch {}
      this.pending = null;
    })();
    await this.pending;
    return { ok: this.list.length > 0, at: this.at, list: this.list };
  }
}

module.exports = { Prices, cleanPrices, cleanTrades, SOURCE, TRADES };
