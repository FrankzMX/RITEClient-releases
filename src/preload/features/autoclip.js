"use strict";

// Automatic clips: with clips on (src/main/clips.js), a good moment saves a
// clip by itself: `need` kills (clipsAutoKills) within `windowMs`
// (clipsAutoWindow, never longer than the clip itself, so every kill is in
// it). It's saved a moment after the last kill, so the clip shows how it ends,
// and more kills before then only make it a bigger one. It reads the kill
// counter of Kirka's HUD, like the match stats (features/stats.js).

const { findKillDeath } = require("./stats");

const SETTLE_MS = 2500;
const TICK_MS = 250;
const NAMES = { 2: "doble kill", 3: "triple kill", 4: "cuádruple kill", 5: "5 kills" };
const streakName = (n) => NAMES[n] || `${n} kills`;

// The counting, apart from the page (test/autoclip.test.js).
function createStreak({ need = 3, windowMs = 10000, settleMs = SETTLE_MS } = {}) {
  let kills = null;
  let times = [];
  let pending = null;
  return {
    set need(n) {
      need = n;
    },
    set windowMs(ms) {
      windowMs = ms;
    },
    // Returns how many kills the clip shows when it's due, else null.
    update(k, now) {
      if (kills === null || k < kills) {
        // First reading, or a new match: nothing to count yet.
        kills = k;
        times = [];
        return this.tick(now);
      }
      const killed = k > kills;
      for (let i = kills; i < k; i++) times.push(now);
      kills = k;
      // From the first kill of the clip, or the last `windowMs`.
      const from = pending ? pending.from : now - windowMs;
      times = times.filter((t) => t >= from);
      if (killed && times.length >= need) pending = { at: now + settleMs, from: times[0], count: times.length };
      return this.tick(now);
    },
    tick(now) {
      if (!pending || now < pending.at) return null;
      const done = pending.count;
      pending = null;
      times = [];
      return done;
    },
  };
}

function createAutoClip({ ipc, getSettings }) {
  const streak = createStreak();
  const count = (el) => parseInt(el?.textContent, 10) || 0;
  setInterval(() => {
    const s = getSettings();
    if (!s.clipsEnabled || !s.clipsAuto || !/^\/games\//.test(location.pathname)) return;
    streak.need = Number(s.clipsAutoKills) || 3;
    // Every kill has to be in the clip: the window fits in it with the settle time.
    const clipMs = (Number(s.clipsSeconds) || 30) * 1000;
    streak.windowMs = Math.min((Number(s.clipsAutoWindow) || 10) * 1000, clipMs - SETTLE_MS - 500);
    const found = findKillDeath(document.querySelector(".script-ui"));
    const now = performance.now();
    const due = found ? streak.update(count(found.kills.querySelector(".cell-value")), now) : streak.tick(now);
    if (due) ipc.invoke("clips:auto", streakName(due)).catch(() => {});
  }, TICK_MS);
}

module.exports = { createAutoClip, createStreak, streakName };
