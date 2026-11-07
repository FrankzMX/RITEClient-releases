"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { frameCap } = require("../src/main/performance");

test("frameCap: with vsync, no cap at the monitor's rate (Windows rounds 59.94 to 59 or 60)", () => {
  assert.equal(frameCap({ performanceProfile: "balanced", fpsLimit: "auto" }, 59), 0);
  assert.equal(frameCap({ performanceProfile: "balanced", fpsLimit: "auto" }, 144), 0);
  assert.equal(frameCap({ performanceProfile: "quality", fpsLimit: "144" }, 144), 0);
  assert.equal(frameCap({ performanceProfile: "balanced", fpsLimit: "240" }, 144), 0);
});

test("frameCap: with vsync, a cap below the monitor's rate stays", () => {
  assert.equal(frameCap({ performanceProfile: "balanced", fpsLimit: "60" }, 144), 60);
});

test("frameCap: competitive (no vsync) keeps the cap, auto = monitor's rate", () => {
  assert.equal(frameCap({ performanceProfile: "competitive", fpsLimit: "auto" }, 144), 144);
  assert.equal(frameCap({ performanceProfile: "competitive", fpsLimit: "240" }, 144), 240);
  assert.equal(frameCap({ performanceProfile: "competitive", fpsLimit: "0" }, 144), 0);
});

test("frameCap: unknown monitor rate", () => {
  assert.equal(frameCap({ performanceProfile: "balanced", fpsLimit: "auto" }, 0), 0);
  assert.equal(frameCap({ performanceProfile: "balanced", fpsLimit: "120" }, 0), 120);
});
