"use strict";

// Adds K/D, assists, points and headshot % under the kill and death counters
// of the in-game HUD. Only reads what the game already shows the player: the
// counters, the "+ASSIST" / "+POINT" pop-ups and the kill feed.
//
// Since the 26/10/2026 update the HUD is drawn by the mode's script: rows of
// cells inside .script-ui, which Kirka redraws every 250 ms. The kill and death
// counters are the row with a skull cell and a red skull cell. Our cells go in
// a row of our own under it, never inside Kirka's.

const UI = ".script-ui";
const STATS = ["kd", "assists", "points", "hs"];

// The points cell uses a flag instead of Kirka's skull.
const FLAG_SVG = '<svg class="rite-stat-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h2v20H5zM8 3h11l-2.5 4.5L19 12H8z"/></svg>';

// Pop-up text -> which total it counts for.
function popupKind(text) {
  const t = String(text || "").toUpperCase();
  return t.includes("ASSIST") ? "assists" : t.includes("POINT") ? "points" : null;
}

// The kill / death row of the script HUD: its kills cell (plain skull) and
// deaths cell (red skull).
function findKillDeath(root) {
  for (const icon of root?.querySelectorAll?.(".ui-row .cell-icon.icon-red") || []) {
    const deaths = icon.closest(".ui-cell");
    const row = deaths?.closest(".ui-row");
    const kills = [...(row?.querySelectorAll(".cell-icon") || [])].find((el) => !el.classList.contains("icon-red"))?.closest(".ui-cell");
    if (kills) return { row, kills, deaths };
  }
  return null;
}

const CSS = `
${UI} .rite-stats { position: absolute; display: grid; grid-auto-flow: column; grid-auto-columns: auto; row-gap: 0; pointer-events: none; }
${UI} .rite-stats .rite-stat { width: auto !important; min-width: 0; }
${UI} .rite-stats.rite-kirka-kd .rite-stat-kd { display: none !important; }
/* Kirka's teammates panel, pushed down when our row would sit on top of it. */
.script-ui .teammates-widget { translate: 0 var(--rite-stats-extra, 0px); }
${UI} .rite-stats .rite-stat .cell-value { gap: .25rem; }
${UI} .rite-stats .rite-stat-label { font-size: .75rem; opacity: .85; }
${UI} .rite-stats .rite-stat-flag { width: 1em; height: 1em; fill: currentColor; }
${UI} .rite-stats .rite-stat-assists svg, ${UI} .rite-stats .rite-stat-assists svg path { fill: #e0b34a; color: #e0b34a; }
${UI} .rite-stats .rite-stat-points svg, ${UI} .rite-stats .rite-stat-points svg path { fill: #6f8fb8; }
/* The flag only in matches with points (POINT): it shows with the first one. */
${UI} .rite-stats:not(.rite-has-points) .rite-stat-points { display: none !important; }
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
  let ui = null;
  let box = null;
  let cells = null;
  let observers = [];
  let totals = { assists: 0, points: 0, headshots: 0 };
  let last = { kills: 0, deaths: 0 };

  const counters = () => findKillDeath(ui);
  // The player's own name, as the Tab scoreboard highlights it.
  const ownName = () => document.querySelector(".nickname.bolder")?.textContent.trim().replace(/#\w+$/, "").trim();

  // Our row goes right under Kirka's kill / death row, each cell under one of
  // its cells and as wide.
  const place = (found) => {
    if (!box || !found || !ui) return;
    const r = found.row.getBoundingClientRect();
    const u = ui.getBoundingClientRect();
    const theirs = [...found.row.querySelectorAll(":scope > .ui-cell")].map((c) => c.getBoundingClientRect());
    box.style.left = `${Math.round(r.left - u.left)}px`;
    box.style.top = `${Math.round(r.bottom - u.top + 8)}px`;
    if (theirs.length) {
      box.style.gridTemplateColumns = theirs.map((c) => `${Math.round(c.width)}px`).join(" ");
      box.style.columnGap = theirs.length > 1 ? `${Math.max(0, Math.round(theirs[1].left - theirs[0].right))}px` : "";
    }
  };

  // Moves Kirka's teammates panel down by as much as our row overlaps it.
  let extra = 0;
  const makeRoom = () => {
    const panel = document.querySelector(".teammates-widget .team-panel");
    let next = 0;
    if (panel && box?.isConnected && box.style.display !== "none") {
      const p = panel.getBoundingClientRect();
      const s = box.getBoundingClientRect();
      const naturalTop = p.top - extra;
      // Only when the panel sits under our row, not beside it.
      if (p.left < s.right && p.right > s.left && naturalTop > s.top - 1) {
        next = Math.max(0, Math.ceil(s.bottom + 8 - naturalTop));
      }
    }
    if (next === extra) return;
    extra = next;
    document.documentElement.style.setProperty("--rite-stats-extra", `${next}px`);
  };

  const render = () => {
    if (!cells) return;
    const found = counters();
    box.style.display = found ? "" : "none";
    if (!found) return;
    const kills = count(found.kills.querySelector(".cell-value"));
    const deaths = count(found.deaths.querySelector(".cell-value"));
    // A counter that drops back to 0 means a new match (or a new round of warmup).
    if ((last.kills > 0 && kills === 0) || (last.deaths > 0 && deaths === 0)) {
      totals = { assists: 0, points: 0, headshots: 0 };
    }
    box.classList.toggle("rite-has-points", totals.points > 0);
    last = { kills, deaths };
    // Kirka shows its own K/D in that row now; ours only when it doesn't.
    box.classList.toggle("rite-kirka-kd", [...found.row.querySelectorAll(".ui-cell")].some((c) => /\bK\/?D\b/i.test(c.textContent)));
    place(found);
    makeRoom();
    cells.kd.value.textContent = kdRatio(kills, deaths);
    cells.assists.value.textContent = totals.assists;
    cells.points.value.textContent = totals.points;
    cells.hs.value.textContent = hsPercent(totals.headshots, kills);
  };

  // Each cell is a copy of Kirka's kills cell, so it keeps its look.
  const makeCell = (template, name) => {
    const cell = template.cloneNode(true);
    cell.classList.add("rite-stat", `rite-stat-${name}`);
    const value = cell.querySelector(".cell-value") || cell;
    const skull = value.querySelector("svg")?.cloneNode(true);
    cell.querySelectorAll(".cell-label").forEach((el) => el.remove());
    value.textContent = "";
    const number = document.createElement("span");
    number.className = "rite-stat-value";
    number.textContent = "0";
    if (name === "kd" || name === "hs") {
      const label = document.createElement("span");
      label.className = "rite-stat-label";
      label.textContent = name === "kd" ? "K/D" : "HS%";
      value.append(number, label);
    } else if (name === "assists") {
      if (skull) value.append(skull);
      value.append(number);
    } else {
      value.insertAdjacentHTML("beforeend", FLAG_SVG);
      value.append(number);
    }
    return { cell, value: number };
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
      if (!me) return;
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
    box?.remove();
    ach = null;
    box = null;
    makeRoom();
    ui = null;
    cells = null;
  };

  const attach = (next) => {
    const found = findKillDeath(next);
    if (!found) return;
    ui = next;
    box = document.createElement("div");
    box.className = "rite-stats";
    // Kirka's styles only reach elements with its scoped attribute.
    for (const { name } of found.row.attributes) if (name.startsWith("data-v-")) box.setAttribute(name, "");
    cells = Object.fromEntries(STATS.map((name) => [name, makeCell(found.kills, name)]));
    box.append(...STATS.map((name) => cells[name].cell));
    ui.append(box);
    // Kirka rewrites the counters in place or swaps the row: watch the whole HUD.
    const changes = new MutationObserver((mutations) => {
      if (mutations.some((m) => !box.contains(m.target))) render();
    });
    changes.observe(ui, { characterData: true, childList: true, subtree: true });
    observers.push(changes);
    watchPopups();
    watchFeed();
    render();
  };

  // The game rebuilds its HUD between matches; check every second.
  const tick = () => {
    const next = document.querySelector(UI);
    if (next === ui && box?.isConnected) {
      // Kirka may put the pop-up box in after the HUD.
      if (!ach?.isConnected) watchPopups();
      return void render();
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

module.exports = { createMatchStats, kdRatio, hsPercent, popupKind, findKillDeath };
