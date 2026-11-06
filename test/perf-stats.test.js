"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { BUCKETS, bucketOf, summarize, compare, configOf, configLabel, processMetrics, readSession, PerfStore } = require("../src/main/perf-stats");

const histOf = (times) => {
  const hist = new Array(BUCKETS).fill(0);
  for (const ms of times) hist[bucketOf(ms)]++;
  return hist;
};

test("summarize: steady 240 FPS", () => {
  const times = new Array(2400).fill(1000 / 240);
  const s = summarize(histOf(times), 10);
  assert.equal(s.fps, 240);
  assert.ok(Math.abs(s.low1 - 240) <= 3, `low1 ${s.low1}`);
  assert.equal(s.hitches, 0);
});

test("summarize: a few slow frames pull the 1 % low down, not the average", () => {
  const times = [...new Array(990).fill(1000 / 240), ...new Array(10).fill(25)];
  const s = summarize(histOf(times), times.reduce((a, b) => a + b, 0) / 1000, 10);
  assert.ok(s.fps > 200, `fps ${s.fps}`);
  assert.equal(s.low1, 40);
  assert.equal(s.worstMs, 25);
});

test("summarize: nothing measured", () => {
  assert.equal(summarize(new Array(BUCKETS).fill(0), 10), null);
});

test("bucketOf: very slow frames land in the last bucket", () => {
  assert.equal(bucketOf(10_000), BUCKETS - 1);
  assert.equal(bucketOf(-1), 0);
});

test("readSession: rejects bad input and summarizes good input", () => {
  assert.equal(readSession(null), null);
  assert.equal(readSession({ seconds: 60, hist: [[BUCKETS, 1]] }), null);
  assert.equal(readSession({ seconds: 60, hist: [["x", 1]] }), null);
  const s = readSession({ seconds: 10, hist: [[bucketOf(1000 / 144), 1440]], hitches: 2, process: { ramMB: 900.4, cpu: 55.6 } });
  assert.equal(s.result.fps, 144);
  assert.equal(s.result.hitches, 2);
  assert.deepEqual(s.process, { ramMB: 900, cpu: 56 });
});

test("compare: groups by settings, best 1 % low first", () => {
  const base = { performanceProfile: "balanced", angleBackend: "default", fpsLimit: "auto", performanceMode: false, highPriority: false };
  const comp = { ...base, performanceProfile: "competitive", angleBackend: "d3d11", fpsLimit: "240" };
  const rows = compare([
    { at: "1", config: base, result: { seconds: 60, fps: 140, low1: 90, low01: 60, hitches: 6 } },
    { at: "2", config: base, result: { seconds: 120, fps: 146, low1: 96, low01: 70, hitches: 0 } },
    { at: "3", config: comp, result: { seconds: 60, fps: 236, low1: 180, low01: 120, hitches: 1 } },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, configLabel(comp));
  assert.equal(rows[1].matches, 2);
  assert.equal(rows[1].low1, 94);
  assert.equal(rows[1].hitchesPerMin, 2);
});

test("configOf / configLabel", () => {
  const c = configOf({ performanceProfile: "competitive", angleBackend: "d3d11", fpsLimit: "0", performanceMode: false, highPriority: true, riteTheme: true });
  assert.deepEqual(Object.keys(c), ["performanceProfile", "angleBackend", "fpsLimit", "performanceMode", "highPriority"]);
  assert.equal(configLabel(c), "Competitivo · D3D11 · sin límite · prioridad alta");
});

test("processMetrics: adds up RAM and CPU by process kind", () => {
  const m = processMetrics([
    { type: "Browser", memory: { workingSetSize: 102400 }, cpu: { percentCPUUsage: 2 } },
    { type: "GPU", memory: { workingSetSize: 307200 }, cpu: { percentCPUUsage: 20 } },
    { type: "Tab", memory: { workingSetSize: 512000 }, cpu: { percentCPUUsage: 40 } },
    { type: "Tab", memory: { workingSetSize: 102400 }, cpu: { percentCPUUsage: 1 } },
  ]);
  assert.equal(m.ramMB, 1000);
  assert.equal(m.cpu, 63);
  assert.deepEqual(m.byType.Tab, { count: 2, ramMB: 600, cpu: 41 });
});

test("PerfStore: adds, lists and clears", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-bench-"));
  const store = new PerfStore(dir);
  assert.deepEqual(store.list(), []);
  store.add({ at: "a", result: { seconds: 40 } });
  store.add({ at: "b", result: { seconds: 50 } });
  assert.deepEqual(store.list().map((s) => s.at), ["a", "b"]);
  store.clear();
  assert.deepEqual(store.list(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("shareable: nothing that identifies the player or the PC", () => {
  const { shareable } = require("../src/main/perf-stats");
  const out = shareable({ at: "2026-11-05T21:15:00.000Z", client: "0.1.0", config: { performanceProfile: "balanced" }, hardware: { cpu: "x", gpu: "y", ramGB: 16 }, result: { fps: 200 }, name: "Frankz", huella: "abc", path: "/games/EU~1" });
  assert.equal(out.day, "2026-11-05");
  assert.equal(out.at, undefined);
  for (const key of ["name", "huella", "path"]) assert.equal(out[key], undefined);
  assert.equal(out.result.fps, 200);
});
