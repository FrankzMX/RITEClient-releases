"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { classify, recolor, isCandidate, withMark, MARK } = require("../src/main/rite-pack");

test("pack RITE: solo texturas del juego, sin el fogonazo ni la interfaz", () => {
  assert.ok(isCandidate("/assets/img/__ar9__.1a2b3c.png"));
  assert.ok(isCandidate("/assets/models/weatie.webp"));
  assert.ok(!isCandidate("/assets/img/__shooting-fire__.effa20af.png"));
  assert.ok(!isCandidate("/assets/img/logo.png"));
  assert.ok(!isCandidate("/js/app.js"));
});

test("pack RITE: armas por nombre, personajes 64×64 solo con 'all'", () => {
  assert.strictEqual(classify("/assets/img/__ar9__.1a2b.png", 128, 128, "weapons"), "weapon");
  assert.strictEqual(classify("/assets/img/Weatie.png", 128, 64, "weapons"), "weapon");
  assert.strictEqual(classify("/assets/img/skin-default.png", 64, 64, "weapons"), null);
  assert.strictEqual(classify("/assets/img/skin-default.png", 64, 64, "all"), null);
  assert.strictEqual(classify("/assets/img/blocks.png", 512, 512, "all"), null);
  assert.strictEqual(classify("/assets/img/__ar9__.png", 128, 128, "off"), null);
  // Model textures (texture.<hash>.webp): weapons, 64×64 skins, never atlases or menu previews.
  assert.strictEqual(classify("/assets/img/texture.f90a7614.webp", 128, 128, "weapons"), "weapon");
  assert.strictEqual(classify("/assets/img/texture.f90a7614.webp", 64, 64, "weapons"), null);
  assert.strictEqual(classify("/assets/img/texture.f90a7614.webp", 64, 64, "all"), "character");
  assert.strictEqual(classify("/assets/img/texture.f90a7614.webp", 1024, 1024, "weapons"), "weapon");
  assert.strictEqual(classify("/assets/img/texture-mini.c43d85e4.webp", 128, 128, "all"), null);
  assert.strictEqual(classify("/assets/img/__up__.0f517324.png", 256, 256, "all"), null);
  // "lar" is a weapon, but not inside other words.
  assert.strictEqual(classify("/assets/img/solar-panel.png", 32, 32, "weapons"), null);
});

test("pack RITE: personajes en un tono oscuro parejo, armas en negro y dorado", () => {
  // BGRA: a light pixel (face), a dark pixel (body), a transparent one.
  const px = () => Buffer.from([230, 230, 230, 255, 30, 30, 30, 255, 255, 255, 255, 0]);
  const skin = recolor(px(), "character");
  const lum = (b, i) => 0.114 * b[i] + 0.587 * b[i + 1] + 0.299 * b[i + 2];
  assert.ok(lum(skin, 0) < 90, "nothing on a character gets bright");
  assert.ok(lum(skin, 0) - lum(skin, 4) < 60, "low contrast: the head does not stand out");
  assert.deepStrictEqual([...skin.subarray(8)], [255, 255, 255, 0], "transparent pixels untouched");
  const gun = recolor(px(), "weapon");
  assert.ok(gun[2] > gun[0], "light parts of weapons turn gold (more red than blue)");
  const rgba = recolor(Buffer.from([230, 230, 230, 255]), "weapon", "rgba");
  assert.ok(rgba[0] > rgba[2], "RGBA order: red stays first");
});

test("pack RITE: la petición del original lleva la marca para no volver al pack", () => {
  assert.strictEqual(withMark("https://kirka.io/assets/a.png"), `https://kirka.io/assets/a.png?${MARK}`);
  assert.strictEqual(withMark("https://kirka.io/assets/a.png?v=2"), `https://kirka.io/assets/a.png?v=2&${MARK}`);
});

test("pack RITE: una textura ya hecha sale del disco si Kirka dice que no cambió", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { RitePack } = require("../src/main/rite-pack");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-pack-"));
  const calls = [];
  const net = {
    fetch: async (url, init = {}) => {
      calls.push(init.headers || {});
      if (init.headers?.["if-none-match"] === '"v1"') return { ok: false, status: 304, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) };
      return { ok: true, status: 200, headers: new Map([["etag", '"v1"'], ["content-type", "image/png"]]), arrayBuffer: async () => new ArrayBuffer(4) };
    },
  };
  const image = { getSize: () => ({ width: 2, height: 1 }), toBitmap: () => Buffer.from([230, 230, 230, 255, 0, 0, 0, 0]) };
  const nativeImage = { createFromBuffer: () => image, createFromBitmap: (bitmap) => ({ toPNG: () => Buffer.from(bitmap) }) };
  const url = "https://kirka.io/assets/img/__ar9__.1a2b.png";
  const first = new RitePack({ net, nativeImage, cacheDir: dir });
  first.setMode("weapons");
  const made = await first.render(url);
  await new Promise((r) => setTimeout(r, 50));
  const second = new RitePack({ net, nativeImage, cacheDir: dir });
  second.setMode("weapons");
  const again = await second.render(url);
  assert.strictEqual(calls.at(-1)["if-none-match"], '"v1"');
  assert.deepStrictEqual([...again.body], [...made.body]);
});
