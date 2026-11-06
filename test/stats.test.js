"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { kdRatio, hsPercent } = require("../src/preload/features/stats");
const { DEFAULT_SETTINGS } = require("../src/main/defaults");

test("K/D counts deaths as 1 until the first one", () => {
  assert.strictEqual(kdRatio(52, 35), 1.49);
  assert.strictEqual(kdRatio(7, 0), 7);
  assert.strictEqual(kdRatio(0, 0), 0);
});

test("HS% is headshots over kills, rounded, and never above 100", () => {
  assert.strictEqual(hsPercent(29, 52), 56);
  assert.strictEqual(hsPercent(0, 0), 0);
  assert.strictEqual(hsPercent(5, 3), 100);
});

test("match stats are on by default", () => {
  assert.strictEqual(DEFAULT_SETTINGS.matchStats, true);
});

test("the +ASSIST and +POINT pop-ups count for their total", () => {
  const { popupKind } = require("../src/preload/features/stats");
  assert.strictEqual(popupKind("+ASSIST"), "assists");
  assert.strictEqual(popupKind("+point"), "points");
  assert.strictEqual(popupKind("DOUBLE KILL"), null);
});

test("the kill / death counters are the script HUD row with a skull and a red skull", () => {
  const { findKillDeath } = require("../src/preload/features/stats");
  const el = (classes, parent) => {
    const node = { classes, parent, children: [], classList: { contains: (c) => classes.includes(c) } };
    node.closest = (sel) => { for (let n = node; n; n = n.parent) if (n.classes.includes(sel.slice(1))) return n; return null; };
    node.querySelectorAll = (sel) => {
      const parts = sel.split(" ");
      const want = parts.at(-1).split(".").filter(Boolean);
      const all = [];
      const walk = (n) => n.children.forEach((c) => { all.push(c); walk(c); });
      walk(node);
      return all.filter((n) => want.every((c) => n.classes.includes(c)) && parts.slice(0, -1).every((p) => n.closest(p)));
    };
    if (parent) parent.children.push(node);
    return node;
  };
  const ui = el(["script-ui"]);
  const timer = el(["widget", "ui-row"], ui);
  el(["cell-icon"], el(["cell-value"], el(["ui-cell"], timer)));
  const row = el(["widget", "ui-row"], ui);
  const kills = el(["ui-cell"], row);
  el(["cell-icon"], el(["cell-value"], kills));
  const deaths = el(["ui-cell"], row);
  el(["cell-icon", "icon-red"], el(["cell-value"], deaths));
  assert.deepStrictEqual(findKillDeath(ui), { row, kills, deaths });
  assert.strictEqual(findKillDeath(el(["script-ui"])), null);
});
