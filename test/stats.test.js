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
