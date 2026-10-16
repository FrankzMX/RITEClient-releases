"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SettingsStore, sanitize, migrate } = require("../src/main/settings");
const { DEFAULT_SETTINGS } = require("../src/main/defaults");

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "rite-settings-"));

test("migrate fills defaults and drops unknown or mistyped keys", () => {
  const result = migrate({ fpsCounter: true, crosshairSize: "big", hacker: 1, schemaVersion: 99 });
  assert.strictEqual(result.fpsCounter, true);
  assert.strictEqual(result.crosshairSize, DEFAULT_SETTINGS.crosshairSize);
  assert.ok(!("hacker" in result));
  assert.strictEqual(result.schemaVersion, DEFAULT_SETTINGS.schemaVersion);
});

test("migrate tolerates garbage input", () => {
  for (const input of [null, 42, "x", [1, 2]]) assert.deepStrictEqual(migrate(input), { ...DEFAULT_SETTINGS });
});

test("sanitize validates enums, ranges, colors and URLs", () => {
  assert.strictEqual(sanitize("performanceProfile", "balanced"), "balanced");
  assert.strictEqual(sanitize("performanceProfile", "turbo"), undefined);
  assert.strictEqual(sanitize("crosshairSize", 500), 64);
  assert.strictEqual(sanitize("crosshairSize", NaN), undefined);
  assert.strictEqual(sanitize("crosshairColor", "#AbCdEf"), "#AbCdEf");
  assert.strictEqual(sanitize("crosshairColor", "red; background:url(x)"), undefined);
  assert.strictEqual(sanitize("baseUrl", "https://snipers.io/"), "https://snipers.io/");
  assert.strictEqual(sanitize("baseUrl", "https://evil.example/"), undefined);
  assert.strictEqual(sanitize("baseUrl", "http://kirka.io/"), undefined);
});

test("sanitize only keeps plain file names in script lists", () => {
  assert.deepStrictEqual(sanitize("enabledScripts", ["a.js", "a.js", "../../x.js", "b.css", 3, "c d.js"]), ["a.js", "b.css", "c d.js"]);
});

test("store persists, notifies and rejects invalid values", () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  const changes = [];
  store.onChange((key, value) => changes.push([key, value]));

  assert.strictEqual(store.set("fpsCounter", true), true);
  assert.strictEqual(store.set("fpsCounter", "yes"), false);
  assert.strictEqual(store.set("schemaVersion", 5), false);
  assert.deepStrictEqual(changes, [["fpsCounter", true]]);

  const reopened = new SettingsStore(dir);
  assert.strictEqual(reopened.get("fpsCounter"), true);
});

test("store backs up a corrupt file and starts from defaults", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "settings.json"), "{not json");
  const store = new SettingsStore(dir);
  assert.deepStrictEqual(store.getAll(), { ...DEFAULT_SETTINGS });
  assert.ok(fs.readdirSync(dir).some((name) => name.startsWith("settings.json.corrupt-")));
});

test("export and import round-trip", () => {
  const a = new SettingsStore(tmpDir());
  a.set("crosshairColor", "#123456");
  const b = new SettingsStore(tmpDir());
  b.import(a.export());
  assert.strictEqual(b.get("crosshairColor"), "#123456");
});

test("enabled scripts keep names downloaded from GitHub, never paths", () => {
  assert.deepStrictEqual(sanitize("enabledScripts", ["Custom%20Skin%20Link.js", "Señal (1).js", "../x.js", "a/b.js", ".hidden.js"]), ["Custom%20Skin%20Link.js", "Señal (1).js"]);
});

test("scripts are enabled by file name even when their header has another @name", () => {
  const { listCustomizations } = require("../src/main/userscripts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-scripts-"));
  fs.writeFileSync(path.join(dir, "csl.js"), "// ==UserScript==\n// @name Custom Skin Link\n// ==/UserScript==\n");
  const off = listCustomizations({ scripts: dir, styles: dir }, { enabledScripts: [], enabledStyles: [] });
  assert.strictEqual(off.scripts[0].file, "csl.js");
  assert.strictEqual(off.scripts[0].name, "Custom Skin Link");
  const on = listCustomizations({ scripts: dir, styles: dir }, { enabledScripts: ["csl.js"], enabledStyles: [] });
  assert.strictEqual(on.scripts[0].enabled, true);
});

test("migrate moves the beta.11 'no limit' FPS setting to auto once", () => {
  assert.strictEqual(migrate({ schemaVersion: 1, fpsLimit: "0" }).fpsLimit, "auto");
  assert.strictEqual(migrate({ schemaVersion: 1, fpsLimit: "144" }).fpsLimit, "144");
  assert.strictEqual(migrate({ schemaVersion: 2, fpsLimit: "0" }).fpsLimit, "0");
});

test("beta.18 moves the old competitive/high priority defaults to balanced once", () => {
  const old = migrate({ schemaVersion: 2, performanceProfile: "competitive", highPriority: true });
  assert.strictEqual(old.performanceProfile, "balanced");
  assert.strictEqual(old.highPriority, false);
  const chosen = migrate({ schemaVersion: 3, performanceProfile: "competitive", highPriority: true });
  assert.strictEqual(chosen.performanceProfile, "competitive");
  assert.strictEqual(chosen.highPriority, true);
});

test("performance mode lightens what runs and keeps the player's own choices", () => {
  const { effectiveSettings } = require("../src/main/perf-mode");
  const mine = { ...DEFAULT_SETTINGS, performanceProfile: "competitive", fpsLimit: "0", highPriority: true, healthColors: true, ritePack: "all" };
  assert.strictEqual(effectiveSettings(mine), mine, "off: nothing changes");
  const on = effectiveSettings({ ...mine, performanceMode: true });
  assert.strictEqual(on.performanceProfile, "balanced");
  assert.strictEqual(on.fpsLimit, "auto");
  assert.strictEqual(on.highPriority, false);
  assert.strictEqual(on.healthColors, false);
  assert.strictEqual(on.riteBadges, false);
  assert.strictEqual(on.ritePack, "off");
  assert.strictEqual(on.swapperEnabled, true, "the swapper stays unless asked");
  assert.strictEqual(effectiveSettings({ ...mine, performanceMode: true, performanceModeSwapper: true }).swapperEnabled, false);
  assert.strictEqual(mine.healthColors, true, "the saved settings are untouched");
});
