"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { cleanList } = require("../src/main/badges");
const { createMatcher } = require("../src/preload/features/badges");

test("the badge list from RITE WEB is cleaned up", () => {
  const list = cleanList({ kirka: [{ name: " Santi ", tag: "marage" }, { name: "", tag: "" }, { name: 3 }, null] });
  assert.deepStrictEqual(list, [{ name: "Santi", tag: "MARAGE" }]);
  assert.deepStrictEqual(cleanList(null), []);
});

test("RITE Client users are recognized by their Kirka ID only", () => {
  const match = createMatcher([{ name: "Santi", tag: "MARAGE" }, { name: "Solo", tag: "" }]);
  assert.ok(match("SANTI#MARAGE"));
  assert.ok(match("#MARAGE"));
  assert.ok(match("  Santi #marage "));
  // A bare name could be anyone (or a menu word): no badge.
  assert.ok(!match("Santi"));
  assert.ok(!match("Solo"));
  assert.ok(!match("Santi#OTHER1"));
  assert.ok(!match("Santi killed Solo"));
  assert.ok(!match(""));
});
