"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assessPc } = require("../src/main/pc-check");

test("a school PC with Intel UHD and 8 GB is modest, capped at 60 FPS", () => {
  const r = assessPc({ ramGB: 8, cores: 4, gpu: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)" });
  assert.equal(r.modest, true);
  assert.deepEqual(r.suggest, { performanceMode: true, fpsLimit: "60" });
  assert.deepEqual(r.kirka, { shadows: 0, decals: 0, cases: 0 });
  assert.ok(r.reasons.includes("gráficos integrados de Intel"));
});

test("a gaming PC is left alone", () => {
  const r = assessPc({ ramGB: 32, cores: 16, gpu: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" });
  assert.equal(r.modest, false);
});

test("8 GB with a real graphics card and many cores is not modest", () => {
  assert.equal(assessPc({ ramGB: 8, cores: 12, gpu: "ANGLE (AMD, AMD Radeon RX 6600 Direct3D11)" }).modest, false);
});

test("Iris Xe is not the weak Intel graphics", () => {
  assert.equal(assessPc({ ramGB: 16, cores: 8, gpu: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)" }).modest, false);
});

test("no graphics acceleration, or 4 GB, is modest", () => {
  assert.equal(assessPc({ ramGB: 16, cores: 8, gpu: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)" }).modest, true);
  const four = assessPc({ ramGB: 4, cores: 8, gpu: "ANGLE (NVIDIA, GeForce GTX 1050)" });
  assert.equal(four.modest, true);
  assert.deepEqual(four.suggest, { performanceMode: true });
});
