"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseMap, saveBackup, KEEP } = require("../src/main/editor-backups");

const map = (name, blocks = [0, 1]) => JSON.stringify({ mapName___DATA: name, chunks___DATA: { "0,0,0": blocks } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rite-respaldos-"));

test("only editor maps with chunks count as maps", () => {
  assert.ok(parseMap(map("Fundición")));
  assert.strictEqual(parseMap("{}"), null);
  assert.strictEqual(parseMap("no es json"), null);
  assert.strictEqual(parseMap(""), null);
  assert.strictEqual(parseMap(null), null);
});

test("saves a backup named after the map and skips an unchanged copy", () => {
  const dir = tmp();
  const when = new Date(2026, 10, 1, 9, 30, 5);
  const file = saveBackup(dir, map("La Cripta: v1/6"), when);
  assert.strictEqual(path.basename(file), "La Cripta v16 2026-11-01 09-30-05.json");
  assert.strictEqual(fs.readFileSync(file, "utf8"), map("La Cripta: v1/6"));
  assert.strictEqual(saveBackup(dir, map("La Cripta: v1/6"), when), "");
  const second = saveBackup(dir, map("La Cripta: v1/6", [0, 2]), when);
  assert.ok(second.endsWith("(2).json"));
  assert.strictEqual(saveBackup(dir, "{}", when), "");
});

test("keeps only the newest backups", () => {
  const dir = tmp();
  for (let i = 0; i < KEEP + 5; i++) {
    const file = saveBackup(dir, map("M", [i]), new Date(2026, 10, 1, 0, 0, i));
    const t = new Date(2026, 10, 1, 0, 0, i);
    fs.utimesSync(file, t, t);
  }
  const left = fs.readdirSync(dir);
  assert.strictEqual(left.length, KEEP);
  assert.ok(!left.some((n) => n.includes("00-00-00")));
});
