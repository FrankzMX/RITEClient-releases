"use strict";

// The hub's panel layout: where Kirka, VOXARENA, Scrims RITE and the chat sit
// on a 12×8 grid, and the checks that keep a layout valid (inside the grid, at
// least the minimum size, no two panels on top of each other). The hub page
// uses it as window.riteLayout; the settings store requires it to validate the
// saved "hubLayout".

(() => {
  const COLS = 12;
  const ROWS = 8;
  const PANELS = Object.freeze(["kirka", "voxarena", "scrims", "chat"]);
  const MIN = Object.freeze({ kirka: [2, 3], voxarena: [2, 3], scrims: [3, 3], chat: [3, 2] });
  const PRESETS = Object.freeze({
    clasico: { kirka: [0, 0, 4, 5], voxarena: [4, 0, 4, 5], scrims: [8, 0, 4, 8], chat: [0, 5, 8, 3] },
    apilados: { kirka: [0, 0, 4, 4], voxarena: [0, 4, 4, 4], chat: [4, 0, 4, 8], scrims: [8, 0, 4, 8] },
    chat: { kirka: [0, 0, 3, 4], voxarena: [0, 4, 3, 4], chat: [3, 0, 6, 8], scrims: [9, 0, 3, 8] },
  });
  const DEFAULT = "clasico";

  const clone = (layout) => Object.fromEntries(PANELS.map((id) => [id, [...layout[id]]]));
  const preset = (name) => clone(PRESETS[name] || PRESETS[DEFAULT]);

  const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

  // A rect is [x, y, w, h] in grid cells.
  function inside(id, r) {
    return (
      Array.isArray(r) &&
      r.length === 4 &&
      r.every(Number.isInteger) &&
      r[0] >= 0 &&
      r[1] >= 0 &&
      r[2] >= MIN[id][0] &&
      r[3] >= MIN[id][1] &&
      r[0] + r[2] <= COLS &&
      r[1] + r[3] <= ROWS
    );
  }

  // Can panel `id` take rect `r`, with the rest of `layout` where it is?
  function fits(layout, id, r) {
    return inside(id, r) && PANELS.every((other) => other === id || !overlaps(r, layout[other]));
  }

  function isValid(layout) {
    if (!layout || typeof layout !== "object" || Array.isArray(layout)) return false;
    if (Object.keys(layout).length !== PANELS.length) return false;
    if (!PANELS.every((id) => inside(id, layout[id]))) return false;
    return PANELS.every((a, i) => PANELS.slice(i + 1).every((b) => !overlaps(layout[a], layout[b])));
  }

  // The saved setting is JSON text; "" (or anything broken) is the default layout.
  function parse(text) {
    try {
      const layout = JSON.parse(text);
      if (isValid(layout)) return clone(layout);
    } catch {}
    return preset(DEFAULT);
  }

  // The panel at a grid cell, or null.
  function at(layout, x, y) {
    return PANELS.find((id) => overlaps([x, y, 1, 1], layout[id])) || null;
  }

  // Swaps the places of two panels, each keeping its own size, when both still
  // fit. Returns the new layout or null.
  function swap(layout, id, other) {
    if (!other || other === id) return null;
    const mine = layout[id];
    const theirs = layout[other];
    const next = clone(layout);
    next[id] = [theirs[0], theirs[1], mine[2], mine[3]];
    next[other] = [mine[0], mine[1], theirs[2], theirs[3]];
    return isValid(next) ? next : null;
  }

  const api = { COLS, ROWS, PANELS, MIN, PRESETS, DEFAULT, preset, overlaps, fits, isValid, parse, at, swap };
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.riteLayout = api;
})();
