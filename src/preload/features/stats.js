"use strict";

// Adds K/D, assists, points and headshot % next to the kill and death counters
// of the in-game HUD. Only reads what the game already shows the player: the
// counters, the "+ASSIST" / "+POINT" pop-ups and the kill feed.

const HUD = ".desktop-game-interface .kill-death";
const STATS = ["kd", "assists", "points", "hs"];

// The points cell uses a flag instead of Kirka's skull.
const FLAG_SVG = '<svg class="rite-stat-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h2v20H5zM8 3h11l-2.5 4.5L19 12H8z"/></svg>';

// Pop-up text -> which total it counts for.
function popupKind(text) {
  const t = String(text || "").toUpperCase();
  return t.includes("ASSIST") ? "assists" : t.includes("POINT") ? "points" : null;
}

const CSS = `
${HUD}.rite-stats { display: grid !important; grid-template-columns: repeat(3, auto); row-gap: .5rem; column-gap: .5rem; }
${HUD}.rite-stats .rite-stat { display: flex; align-items: center; justify-content: center; gap: .25rem; }
${HUD}.rite-stats .rite-stat-assists, ${HUD}.rite-stats .rite-stat-points, ${HUD}.rite-stats .rite-stat-hs { grid-row: 2; }
${HUD}.rite-stats .rite-stat-label { font-size: .75rem; opacity: .85; }
${HUD}.rite-stats .rite-stat-flag { width: 1em; height: 1em; }
${HUD}.rite-stats .rite-stat-assists svg, ${HUD}.rite-stats .rite-stat-assists svg path { fill: #e0b34a; }
${HUD}.rite-stats .rite-stat-points svg, ${HUD}.rite-stats .rite-stat-points svg path { fill: #6f8fb8; }
${HUD}.rite-stats { height: auto !important; }
/* Kirka's own K/D line; ours replaces it. */
${HUD}.rite-stats > .kd:not(.rite-stat) { display: none !important; }
/* The flag only in matches with points (POINT): it shows with the first one. */
${HUD}.rite-stats:not(.rite-has-points) .rite-stat-points { display: none !important; }
/* The second row would sit on top of the team list below: push it down. */
.desktop-game-interface .team-players-state { margin-top: var(--rite-stats-extra, 0px) !important; }
`;

// Kills over deaths, with deaths counted as 1 until the first one (like Kirka's
// end screen).
function kdRatio(kills, deaths) {
  return Number((kills / Math.max(deaths, 1)).toFixed(2));
}

function hsPercent(headshots, kills) {
  return kills > 0 ? Math.round((Math.min(headshots, kills) / kills) * 100) : 0;
}

const count = (el) => parseInt(el?.textContent, 10) || 0;

function createMatchStats() {
  const style = document.createElement("style");
  style.id = "rite-match-stats";
  document.head.append(style);

  let enabled = false;
  let timer = null;
  let hud = null;
  let cells = null;
  let observers = [];
  let totals = { assists: 0, points: 0, headshots: 0 };
  let last = { kills: 0, deaths: 0 };

  const killsEl = () => hud?.querySelector(".kill");
  const deathsEl = () => hud?.querySelector("svg.icon-death")?.parentElement;
  // The player's own name, as the Tab scoreboard highlights it.
  const ownName = () => document.querySelector(".nickname.bolder")?.textContent.trim().replace(/#\w+$/, "").trim();

  // Moves the team list down by as much as the second row overlaps it.
  let extra = 0;
  const makeRoom = () => {
    const panel = document.querySelector(".desktop-game-interface .team-players-state");
    let next = 0;
    if (panel && hud && cells?.hs.cell.isConnected) {
      const p = panel.getBoundingClientRect();
      const s = hud.getBoundingClientRect();
      const naturalTop = p.top - extra;
      // Only when the list sits under the stats, not beside them.
      if (p.left < s.right && p.right > s.left && naturalTop > s.top) {
        next = Math.max(0, Math.ceil(cells.hs.cell.getBoundingClientRect().bottom + 8 - naturalTop));
      }
    }
    if (next === extra) return;
    extra = next;
    document.documentElement.style.setProperty("--rite-stats-extra", `${next}px`);
  };

  const render = () => {
    if (!cells) return;
    const kills = count(killsEl());
    const deaths = count(deathsEl());
    // A counter that drops back to 0 means a new match (or the end of warmup).
    if ((last.kills > 0 && kills === 0) || (last.deaths > 0 && deaths === 0)) {
      totals = { assists: 0, points: 0, headshots: 0 };
    }
    hud?.classList.toggle("rite-has-points", totals.points > 0);
    last = { kills, deaths };
    makeRoom();
    cells.kd.value.textContent = kdRatio(kills, deaths);
    cells.assists.value.textContent = totals.assists;
    cells.points.value.textContent = totals.points;
    cells.hs.value.textContent = hsPercent(totals.headshots, kills);
  };

  const makeCell = (template, name) => {
    const cell = template.cloneNode(true);
    cell.classList.remove("kill");
    cell.classList.add("rite-stat", `rite-stat-${name}`);
    cell.textContent = "";
    const value = document.createElement("span");
    value.className = "rite-stat-value";
    value.textContent = "0";
    cell.append(value);
    if (name === "kd" || name === "hs") {
      const label = document.createElement("span");
      label.className = "rite-stat-label";
      label.textContent = name === "kd" ? "K/D" : "HS%";
      cell.append(label);
    } else if (name === "assists") {
      const skull = template.querySelector("svg")?.cloneNode(true);
      if (skull) cell.append(skull);
    } else {
      cell.insertAdjacentHTML("beforeend", FLAG_SVG);
    }
    return { cell, value };
  };

  // Kirka shows a short "+ASSIST" or "+POINT" pop-up for each one. Each one
  // counts once, when it shows up: as a new element, or as a kept one going
  // into its enter transition. The class is checked in the old value too: with
  // animations off (performance mode) Vue adds and drops the enter classes at
  // once, and by the time the observer runs they are gone.
  let ach = null;
  const watchPopups = () => {
    ach = document.querySelector(".ach-cont");
    if (!ach) return;
    const shown = new WeakSet();
    let lastAt = { assists: 0, points: 0 };
    const tally = (el) => {
      if (shown.has(el)) return;
      const key = popupKind(el.querySelector(".text")?.textContent || (el.classList.contains("text") ? el.textContent : ""));
      if (!key) return;
      shown.add(el);
      const now = Date.now();
      if (now - lastAt[key] < 200) return;
      lastAt[key] = now;
      totals[key]++;
      render();
    };
    const observer = new MutationObserver((mutations) => {
      // Each element's classes in order: every old value, then the current one.
      const steps = new Map();
      for (const m of mutations) {
        if (m.type === "childList") {
          for (const node of m.addedNodes) if (node instanceof Element && node.parentElement) tally(node);
        } else if (m.target instanceof Element) {
          if (!steps.has(m.target)) steps.set(m.target, []);
          steps.get(m.target).push(m.oldValue || "");
        }
      }
      for (const [el, list] of steps) {
        for (const cls of [...list, typeof el.className === "string" ? el.className : ""]) {
          if (/slide-fade-leave/.test(cls)) shown.delete(el);
          else if (/slide-fade-enter/.test(cls)) tally(el);
        }
      }
    });
    observer.observe(ach, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    observers.push(observer);
  };

  // A kill in the feed by the player with the skull mark is a headshot.
  const watchFeed = () => {
    const feed = document.querySelector(".kill-bar-cont");
    if (!feed) return;
    const observer = new MutationObserver((mutations) => {
      const me = ownName();
      if (!me || document.querySelector(".warmup-timer")) return;
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          if (!(node instanceof Element) || node.classList.contains("fade-leave-active")) continue;
          const killer = node.querySelector(".killer-name")?.textContent.trim();
          if (killer === me && node.querySelector(".skull")) totals.headshots++;
        }
      }
      render();
    });
    observer.observe(feed, { childList: true });
    observers.push(observer);
  };

  const detach = () => {
    observers.forEach((o) => o.disconnect());
    observers = [];
    if (cells) Object.values(cells).forEach(({ cell }) => cell.remove());
    hud?.classList.remove("rite-stats", "rite-has-points");
    ach = null;
    hud = null;
    cells = null;
    makeRoom();
  };

  const attach = (next) => {
    const kills = next.querySelector(".kill");
    if (!kills) return;
    hud = next;
    hud.classList.add("rite-stats");
    cells = Object.fromEntries(STATS.map((name) => [name, makeCell(kills, name)]));
    const deaths = deathsEl();
    (deaths || kills).after(cells.kd.cell);
    cells.kd.cell.after(cells.assists.cell, cells.points.cell, cells.hs.cell);
    const counters = new MutationObserver(render);
    for (const el of [kills, deaths]) if (el) counters.observe(el, { characterData: true, childList: true, subtree: true });
    observers.push(counters);
    watchPopups();
    watchFeed();
    render();
  };

  // The game rebuilds its HUD between matches; check every second.
  const tick = () => {
    const next = document.querySelector(HUD);
    if (next === hud && (!cells || cells.kd.cell.isConnected)) {
      // Kirka may put the pop-up box in after the HUD.
      if (cells && !ach?.isConnected) watchPopups();
      return void makeRoom();
    }
    detach();
    if (next) attach(next);
  };

  return {
    update(settings) {
      const on = !!settings.matchStats;
      if (on === enabled) return;
      enabled = on;
      style.textContent = on ? CSS : "";
      if (on) {
        timer = setInterval(tick, 1000);
        tick();
      } else {
        clearInterval(timer);
        timer = null;
        detach();
      }
    },
  };
}

module.exports = { createMatchStats, kdRatio, hsPercent, popupKind };
