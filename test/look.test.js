"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { applyBlockTexture, KEY, MARK } = require("../src/preload/features/texture");
const { healthColor } = require("../src/preload/features/health");
const { sanitize } = require("../src/main/settings");
const { DEFAULT_SETTINGS } = require("../src/main/defaults");

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

const fakeDataUrl = (file) => `data:image/png;base64,${file}`;
const settings = (over) => ({ ...DEFAULT_SETTINGS, ...over });

test("RITE Dark writes Kirka's texture setting as a JSON string", () => {
  const storage = memoryStorage();
  applyBlockTexture(storage, settings({ blockTexture: "rite-dark" }), fakeDataUrl);
  assert.strictEqual(storage.getItem(KEY), JSON.stringify("data:image/png;base64,textures/rite-dark.png"));
  assert.strictEqual(storage.getItem(MARK), storage.getItem(KEY));
});

test("switching back to Kirka removes only the texture the client wrote", () => {
  const storage = memoryStorage();
  applyBlockTexture(storage, settings({ blockTexture: "rite-dark" }), fakeDataUrl);
  applyBlockTexture(storage, settings({ blockTexture: "kirka" }), fakeDataUrl);
  assert.strictEqual(storage.getItem(KEY), null);
  assert.strictEqual(storage.getItem(MARK), null);
});

test("a texture the player set inside Kirka is never removed", () => {
  const own = JSON.stringify("https://example.com/mine.png");
  const untouched = memoryStorage({ [KEY]: own });
  applyBlockTexture(untouched, settings({ blockTexture: "kirka" }), fakeDataUrl);
  assert.strictEqual(untouched.getItem(KEY), own);

  // Player changed it in Kirka after the client had written one.
  const changed = memoryStorage();
  applyBlockTexture(changed, settings({ blockTexture: "rite-dark" }), fakeDataUrl);
  changed.setItem(KEY, own);
  applyBlockTexture(changed, settings({ blockTexture: "kirka" }), fakeDataUrl);
  assert.strictEqual(changed.getItem(KEY), own);
});

test("custom texture URL is used only when set", () => {
  const storage = memoryStorage();
  applyBlockTexture(storage, settings({ blockTexture: "custom", customTextureUrl: "" }), fakeDataUrl);
  assert.strictEqual(storage.getItem(KEY), null);
  applyBlockTexture(storage, settings({ blockTexture: "custom", customTextureUrl: "https://x.io/t.png" }), fakeDataUrl);
  assert.strictEqual(storage.getItem(KEY), JSON.stringify("https://x.io/t.png"));
});

test("health color follows the configured thresholds", () => {
  const s = settings({ healthHighMin: 70, healthMidMin: 40 });
  assert.strictEqual(healthColor(100, s), s.healthHighColor);
  assert.strictEqual(healthColor(70, s), s.healthHighColor);
  assert.strictEqual(healthColor(69, s), s.healthMidColor);
  assert.strictEqual(healthColor(40, s), s.healthMidColor);
  assert.strictEqual(healthColor(39, s), s.healthLowColor);
  assert.strictEqual(healthColor(0, s), s.healthLowColor);
  // A mid threshold above the high one never hides the high color.
  const odd = settings({ healthHighMin: 50, healthMidMin: 80 });
  assert.strictEqual(healthColor(60, odd), odd.healthHighColor);
  assert.strictEqual(healthColor(45, odd), odd.healthLowColor);
});

test("new look settings are validated", () => {
  assert.strictEqual(sanitize("blockTexture", "rite-dark"), "rite-dark");
  assert.strictEqual(sanitize("blockTexture", "x"), undefined);
  assert.strictEqual(sanitize("customTextureUrl", ""), "");
  assert.strictEqual(sanitize("customTextureUrl", "https://x.io/t.png"), "https://x.io/t.png");
  assert.strictEqual(sanitize("customTextureUrl", "javascript:alert(1)"), undefined);
  assert.strictEqual(sanitize("healthLowColor", "#ff0000"), "#ff0000");
  assert.strictEqual(sanitize("healthLowColor", "red"), undefined);
  assert.strictEqual(sanitize("healthHighMin", 0), 2);
});

test("every left-menu icon is bundled and used by the RITE theme", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { ICONS } = require("../src/preload/features/styles");
  const css = fs.readFileSync(path.join(__dirname, "../src/assets/themes/rite.css"), "utf8");
  for (const name of ICONS) {
    assert.ok(fs.existsSync(path.join(__dirname, `../src/assets/icons/${name}.svg`)), name);
    assert.ok(css.includes(`var(--rite-icon-${name})`), name);
  }
});

test("Kirka's blues move onto the RITE palette and other colours are kept", () => {
  const { mapColor, mapGradient } = require("../src/preload/features/recolor");
  // Kirka's leaderboard row and panel blues become warm dark panels.
  const row = mapColor("rgb(59, 74, 117)", "background");
  const panel = mapColor("rgba(42, 52, 96, 0.9)", "background");
  assert.match(row, /^rgb\(/);
  assert.match(panel, /^rgba\(.*0\.9\)$/);
  // Gold, red, white, black and transparent are left alone.
  for (const keep of ["rgb(224, 179, 74)", "rgb(226, 80, 80)", "rgb(255, 255, 255)", "rgb(0, 0, 0)", "rgba(0, 0, 0, 0)"]) {
    assert.strictEqual(mapColor(keep, "background"), null, keep);
  }
  // A bright blue frame turns gold; green and blue labels turn gold.
  assert.strictEqual(mapColor("rgb(59, 107, 214)", "border"), "rgb(224, 179, 74)");
  assert.strictEqual(mapColor("rgb(46, 204, 113)", "text"), "rgb(224, 179, 74)");
  assert.strictEqual(mapColor("rgb(255, 255, 255)", "text"), null);
  // Gradients only change their blue stops.
  const g = mapGradient("linear-gradient(90deg, rgb(59, 107, 214) 0%, rgb(226, 80, 80) 100%)");
  assert.ok(g.includes("rgb(226, 80, 80)") && !g.includes("rgb(59, 107, 214)"));
  assert.strictEqual(mapGradient("linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))"), null);
});

test("RITE WEB and the Discord invite are allowed links", () => {
  const credits = require("../src/main/credits");
  const urls = credits.links.map((l) => l.url);
  for (const { url } of credits.community) assert.ok(urls.includes(url) && url.startsWith("https://"), url);
});
