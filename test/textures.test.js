"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { listTextures, textureDataUrl } = require("../src/main/textures");
const { textureValue } = require("../src/preload/features/texture");
const { currentId } = require("../src/preload/features/texture-panel");
const { sanitize } = require("../src/main/settings");

const folder = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-texturas-"));
  for (const name of ["Zeta.png", "alfa.webp", "notas.txt", ".oculta.png"]) fs.writeFileSync(path.join(dir, name), "x");
  fs.mkdirSync(path.join(dir, "sub.png"));
  return dir;
};

test("the texture folder lists only images, sorted, without the extension", () => {
  const list = listTextures(folder());
  assert.deepStrictEqual(list.map((t) => [t.name, t.label]), [["alfa.webp", "alfa"], ["Zeta.png", "Zeta"]]);
  assert.deepStrictEqual(listTextures(path.join(os.tmpdir(), "no-existe-rite")), []);
});

test("a saved texture is read only from inside its folder", () => {
  const dir = folder();
  assert.strictEqual(textureDataUrl(dir, "alfa.webp"), `data:image/webp;base64,${Buffer.from("x").toString("base64")}`);
  assert.strictEqual(textureDataUrl(dir, "../alfa.webp"), null);
  assert.strictEqual(textureDataUrl(dir, "notas.txt"), null);
  assert.strictEqual(textureDataUrl(dir, "falta.png"), null);
});

test("blockTexture 'file' uses the saved texture, or Kirka's when it is missing", () => {
  const files = { "a.png": "data:image/png;base64,AAA" };
  const value = (s) => textureValue({ blockTexture: "file", blockTextureFile: "", customTextureUrl: "", ...s }, () => "", (n) => files[n]);
  assert.strictEqual(value({ blockTextureFile: "a.png" }), "data:image/png;base64,AAA");
  assert.strictEqual(value({ blockTextureFile: "b.png" }), null);
  assert.strictEqual(value({}), null);
});

test("blockTextureFile takes only an image name, never a path", () => {
  assert.strictEqual(sanitize("blockTextureFile", "Mi pack 2.png"), "Mi pack 2.png");
  assert.strictEqual(sanitize("blockTextureFile", ""), "");
  assert.strictEqual(sanitize("blockTextureFile", "../x.png"), undefined);
  assert.strictEqual(sanitize("blockTextureFile", "x.js"), undefined);
  assert.strictEqual(sanitize("blockTexture", "file"), "file");
});

test("the panel marks the option the settings point at", () => {
  assert.strictEqual(currentId({ blockTexture: "file", blockTextureFile: "a.png" }), "file:a.png");
  assert.strictEqual(currentId({ blockTexture: "file", blockTextureFile: "" }), "kirka");
  assert.strictEqual(currentId({ blockTexture: "custom", customTextureUrl: "" }), "kirka");
  assert.strictEqual(currentId({ blockTexture: "rite-dark" }), "rite-dark");
});
