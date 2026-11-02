"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { classifyNavigation, isGameOrigin } = require("../src/main/navigation");
const { getSwitches } = require("../src/main/performance");
const { stateForUrl } = require("../src/main/discord");
const { parseMeta } = require("../src/main/userscripts");
const { DEFAULT_SETTINGS } = require("../src/main/defaults");

test("navigation keeps Kirka and login providers in the window", () => {
  assert.strictEqual(classifyNavigation("https://kirka.io/games/abc"), "internal");
  assert.strictEqual(classifyNavigation("https://accounts.google.com/o/oauth2"), "internal");
  assert.strictEqual(classifyNavigation("https://www.youtube.com/watch?v=1"), "external");
  assert.strictEqual(classifyNavigation("http://kirka.io/"), "external");
  assert.strictEqual(classifyNavigation("file:///C:/Windows/system32/calc.exe"), "block");
  assert.strictEqual(classifyNavigation("javascript:alert(1)"), "block");
  assert.strictEqual(classifyNavigation("https://kirka.io.evil.com/"), "external");
});

test("isGameOrigin only accepts Kirka hosts over https", () => {
  assert.ok(isGameOrigin("https://kirka.io/"));
  assert.ok(!isGameOrigin("https://accounts.google.com/"));
  assert.ok(!isGameOrigin("about:blank"));
});

test("performance profiles map to Chromium switches", () => {
  const names = (settings, platform) => getSwitches({ ...DEFAULT_SETTINGS, ...settings }, platform).map((s) => s.join("="));
  assert.ok(names({ performanceProfile: "competitive" }).includes("disable-gpu-vsync"));
  assert.ok(!names({ performanceProfile: "quality" }).includes("disable-frame-rate-limit"));
  assert.ok(names({ angleBackend: "d3d11" }, "win32").includes("use-angle=d3d11"));
  assert.ok(!names({ angleBackend: "d3d11" }, "linux").some((s) => s.startsWith("use-angle")));
  // in-process-gpu left a black window on some PCs: the old setting is ignored.
  assert.ok(!names({ inProcessGpu: true }).includes("in-process-gpu"));
});

test("Discord presence state follows the page", () => {
  assert.strictEqual(stateForUrl("https://kirka.io/games/xyz"), "En partida");
  assert.strictEqual(stateForUrl("https://kirka.io/"), "En el lobby");
  assert.strictEqual(stateForUrl("garbage"), "En el lobby");
});

test("userscript metadata is parsed", () => {
  const code = "// ==UserScript==\n// @name  Mi script\n// @author yo\n// @grant none\n// ==/UserScript==\nalert(1)";
  assert.deepStrictEqual(parseMeta(code), { name: "Mi script", author: "yo" });
});

test("forced GPU flags and full speed in the background only in competitive", () => {
  const { backgroundThrottling } = require("../src/main/performance");
  const names = (settings) => getSwitches({ ...DEFAULT_SETTINGS, ...settings }, "win32").map((s) => s.join("="));
  assert.strictEqual(DEFAULT_SETTINGS.performanceProfile, "balanced");
  assert.ok(!names({}).includes("ignore-gpu-blocklist"));
  assert.ok(!names({}).includes("disable-renderer-backgrounding"));
  assert.ok(names({ performanceProfile: "competitive" }).includes("force_high_performance_gpu"));
  assert.strictEqual(backgroundThrottling(DEFAULT_SETTINGS), true);
  assert.strictEqual(backgroundThrottling({ ...DEFAULT_SETTINGS, performanceProfile: "competitive" }), false);
});
