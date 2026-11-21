"use strict";

// RITE Client badge: RITE WEB lists the Kirka names of players who use the
// client (linked to their Discord). The list is public and refreshed every
// few minutes; the page marks those names (see src/preload/features/badges.js).

const { API } = require("./scrims");

const EVERY = 10 * 60 * 1000;

// Kirka names are "Name#TAG". Keeps what looks valid and drops the rest.
function cleanList(data) {
  const list = Array.isArray(data?.kirka) ? data.kirka : [];
  return list
    .filter((p) => p && typeof p.name === "string" && typeof p.tag === "string")
    .map((p) => ({ name: p.name.trim().slice(0, 32), tag: p.tag.trim().toUpperCase().slice(0, 12) }))
    .filter((p) => p.name.length >= 2 || /^[A-Z0-9]{4,12}$/.test(p.tag))
    .slice(0, 5000);
}

class Badges {
  constructor({ fetch, onList }) {
    this.fetch = fetch;
    this.onList = onList;
    this.list = [];
    this.timer = null;
    this.sent = null; // what the page has, so the same list isn't sent again
  }

  send(list) {
    const key = JSON.stringify(list);
    if (key === this.sent) return;
    this.sent = key;
    this.onList(list);
  }

  setEnabled(on) {
    clearInterval(this.timer);
    this.timer = null;
    if (!on) return this.send([]);
    this.send(this.list);
    this.refresh();
    this.timer = setInterval(() => this.refresh(), EVERY);
  }

  async refresh() {
    try {
      const res = await this.fetch(new URL("badges", API).href);
      if (res.status !== 200) return;
      this.list = cleanList(await res.json());
      if (this.timer) this.send(this.list);
    } catch {}
  }
}

module.exports = { Badges, cleanList };
