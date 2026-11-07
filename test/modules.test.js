"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { cleanModule, compareVersions } = require("../src/main/modules");

test("versions compare by number, then by prerelease", () => {
  assert.strictEqual(compareVersions("1.2.0", "1.10.0") < 0, true);
  assert.strictEqual(compareVersions("0.1.0-beta.31", "0.1.0") < 0, true);
  assert.strictEqual(compareVersions("0.1.0-beta.31", "0.1.0-beta.4") > 0, true);
  assert.strictEqual(compareVersions("2.0.0", "2.0.0"), 0);
});

test("a module entry is cleaned: bad ids, versions or hashes are refused", () => {
  const sha = "a".repeat(64);
  const m = cleanModule({ id: "custom-skin-link", version: "5.0.0", nombre: "Custom Skin Link", tipo: "visual", sha256: sha, reemplaza: ["CustomSkinLink.js"], extra: 1 });
  assert.deepStrictEqual([m.id, m.version, m.tipo, m.reemplaza, "extra" in m], ["custom-skin-link", "5.0.0", "visual", ["CustomSkinLink.js"], false]);
  assert.strictEqual(cleanModule({ id: "Bad Id", version: "1", nombre: "x", sha256: sha }), null);
  assert.strictEqual(cleanModule({ id: "ok", version: "1.0.0", nombre: "x", sha256: "nope" }), null);
  assert.strictEqual(cleanModule(null), null);
});
