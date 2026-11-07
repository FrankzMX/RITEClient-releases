"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStreak, streakName } = require("../src/preload/features/autoclip");

test("3 kills within the window save one clip, a moment after the last", () => {
  const s = createStreak({ need: 3, windowMs: 10000, settleMs: 2500 });
  assert.equal(s.update(0, 0), null);
  assert.equal(s.update(1, 1000), null);
  assert.equal(s.update(2, 6000), null);
  assert.equal(s.update(3, 9000), null);
  // A fourth kill before it's saved makes it a bigger one.
  assert.equal(s.update(4, 10000), null);
  assert.equal(s.update(4, 12000), null);
  assert.equal(s.update(4, 12600), 4);
  assert.equal(s.update(4, 13000), null);
});

test("kills spread wider than the window are no clip", () => {
  const s = createStreak({ need: 3, windowMs: 10000, settleMs: 0 });
  s.update(0, 0);
  s.update(1, 1000);
  s.update(2, 8000);
  assert.equal(s.update(3, 12000), null); // the first one is 11 s back
  assert.equal(s.update(4, 13000), 3);
});

test("the window and the kills needed can change; a new match starts over", () => {
  const s = createStreak({ need: 3, windowMs: 10000, settleMs: 0 });
  s.update(0, 0);
  s.need = 2;
  s.windowMs = 30000;
  s.update(1, 1000);
  assert.equal(s.update(2, 25000), 2);
  s.update(0, 26000);
  assert.equal(s.update(1, 27000), null);
  assert.equal(streakName(3), "triple kill");
  assert.equal(streakName(7), "7 kills");
});
