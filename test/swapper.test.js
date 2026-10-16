"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { scanSwapFolder, findSwap } = require("../src/main/swapper");
const { resolveInside } = require("../src/main/paths");

function makeSwapDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-swap-"));
  fs.mkdirSync(path.join(dir, "assets", "img"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "img", "logo.png"), "x");
  fs.writeFileSync(path.join(dir, "assets", "img", "mi skin.png"), "x");
  return dir;
}

test("scan maps files to URL paths", () => {
  const files = scanSwapFolder(makeSwapDir());
  assert.deepStrictEqual([...files.keys()].sort(), ["/assets/img/logo.png", "/assets/img/mi skin.png"]);
});

test("findSwap matches game hosts only and ignores query strings", () => {
  const files = scanSwapFolder(makeSwapDir());
  assert.strictEqual(findSwap(files, "https://kirka.io/assets/img/logo.png?v=3"), "rite-swap://local/assets/img/logo.png");
  assert.strictEqual(findSwap(files, "https://cdn.kirka.io/assets/img/logo.png"), null);
  assert.strictEqual(findSwap(files, "https://snipers.io/assets/img/mi%20skin.png"), "rite-swap://local/assets/img/mi%20skin.png");
  assert.strictEqual(findSwap(files, "https://example.com/assets/img/logo.png"), null);
  assert.strictEqual(findSwap(files, "https://kirka.io/assets/img/other.png"), null);
  assert.strictEqual(findSwap(files, "not a url"), null);
});

test("resolveInside blocks path traversal", () => {
  const base = path.join(os.tmpdir(), "rite-base");
  assert.strictEqual(resolveInside(base, "a/b.png"), path.join(base, "a", "b.png"));
  assert.strictEqual(resolveInside(base, "../secret.txt"), null);
  assert.strictEqual(resolveInside(base, "a/../../secret.txt"), null);
  assert.strictEqual(resolveInside(base, path.resolve("/etc/passwd")), null);
  assert.strictEqual(resolveInside(base, ""), null);
});
