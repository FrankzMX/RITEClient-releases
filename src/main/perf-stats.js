"use strict";

// RITE Bench: how well the game really runs on this PC, match by match, and
// with which settings. The page counts its frames (hookFrames in
// preload/game.js); the preload keeps a histogram of the frame times while the
// player is actually playing (preload/features/perf.js) and, when the match
// ends, sends the summary here. Each one is a line in
// Documentos/RITEClient/rendimiento/sesiones.jsonl, together with the settings
// that matter for performance and the PC it ran on, so the menu can compare
// "Competitivo + D3D11" with "Equilibrado + Automático" on the same machine.
// It stays on the PC unless the player agrees to share it with RITE,
// anonymously ("perfShare", asked once); "perfStats" turns it all off.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Frame times are kept in 0.1 ms buckets up to 250 ms (4 fps); slower frames go to the last one.
const BUCKET_MS = 0.1;
const BUCKETS = 2500;

const bucketOf = (ms) => Math.min(BUCKETS - 1, Math.max(0, Math.round(ms / BUCKET_MS)));
const msOf = (bucket) => bucket * BUCKET_MS;

// The frame time that `share` (0.01 = 1 %) of the frames are slower than.
function slowest(hist, total, share) {
  let need = Math.max(1, Math.ceil(total * share));
  for (let b = hist.length - 1; b >= 0; b--) {
    need -= hist[b];
    if (need <= 0) return msOf(b);
  }
  return 0;
}

// { frames, seconds, fps, low1, low01, worstMs, hitches } from a histogram and
// the seconds actually played. "1 % low" = the FPS of the slowest 1 % frame.
function summarize(hist, seconds, hitches = 0) {
  let frames = 0;
  let worst = 0;
  for (let b = 0; b < hist.length; b++) {
    if (!hist[b]) continue;
    frames += hist[b];
    worst = b;
  }
  if (!frames || !(seconds > 0)) return null;
  const fpsOf = (ms) => (ms > 0 ? Math.round(1000 / ms) : 0);
  return {
    frames,
    seconds: Math.round(seconds),
    fps: Math.round(frames / seconds),
    low1: fpsOf(slowest(hist, frames, 0.01)),
    low01: fpsOf(slowest(hist, frames, 0.001)),
    worstMs: Math.round(msOf(worst) * 10) / 10,
    hitches,
    hitchesPerMin: Math.round((hitches / seconds) * 600) / 10,
  };
}

// The settings that change how the game runs. Two matches with the same ones
// are the same "configuration" in the comparison.
const CONFIG_KEYS = ["performanceProfile", "angleBackend", "fpsLimit", "performanceMode", "highPriority"];
const EXTRA_KEYS = ["tournamentMode", "riteTheme", "ritePack", "swapperEnabled", "userscriptsEnabled", "remoteModules", "tradeEar", "matchStats", "healthColors", "blockTexture", "frameHook"];

const pick = (s, keys) => Object.fromEntries(keys.map((k) => [k, s?.[k]]));
const configOf = (s) => pick(s, CONFIG_KEYS);
// Clips (src/main/clips.js) film the game the whole time, so matches with them
// on are their own group: "1080p60" or "" (off, and matches from before clips).
const clipsOf = (s) => (s?.clipsEnabled ? `${s.clipsQuality}p${s.clipsFps}` : "");
const configKey = (config) => [...CONFIG_KEYS.map((k) => String(config?.[k])), config?.clips || "", config?.kirka || ""].join("|");

// Kirka's own graphics settings, as the game keeps them in localStorage
// ("SETTINGS___SETTING/GRAPHICS___SETTING/MAIN_RESOLUTION___SETTING" = "1").
const KIRKA_SETTINGS = Object.freeze({
  resolution: "GRAPHICS/MAIN_RESOLUTION",
  shadows: "GRAPHICS/RENDER_SHADOWS",
  shadowResolution: "GRAPHICS/SHADOW_RESOLUTION",
  emissive: "GRAPHICS/EMISSIVE_LIGHT",
  ao: "BLOCKS/BAKE_AO",
  bullets: "EFFECTS/RENDER_BULLETS",
  cases: "EFFECTS/RENDER_CASES",
  decals: "EFFECTS/RENDER_DECALS",
  smoke: "EFFECTS/RENDER_SMOKE",
});
const kirkaStorageKey = (setting) => `SETTINGS___SETTING/${setting.split("/").map((p) => `${p}___SETTING`).join("/")}`;
// Only numbers (Kirka keeps its switches as 0/1), anything else is dropped.
function readKirka(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  for (const key of Object.keys(KIRKA_SETTINGS)) {
    const n = Number(input[key]);
    if (input[key] !== null && input[key] !== "" && Number.isFinite(n) && n >= 0 && n <= 16384) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}
// What of Kirka's settings weighs the most, for grouping matches: the render
// resolution and the shadows. "" = Kirka's defaults (100 %, no shadows), so
// matches from before this was recorded group with them.
function kirkaOf(k) {
  if (!k) return "";
  const parts = [];
  if (k.resolution != null && Math.abs(k.resolution - 1) > 0.001) parts.push(`resolución ${Math.round(k.resolution * 100)} %`);
  if (k.shadows) parts.push(`sombras${k.shadowResolution ? ` ${k.shadowResolution}` : ""}`);
  return parts.join(", ");
}

const PROFILE = { competitive: "Competitivo", pure: "Puro", balanced: "Equilibrado", quality: "Calidad" };
const ANGLE = { default: "Automático", d3d11: "D3D11", d3d9: "D3D9", gl: "OpenGL", vulkan: "Vulkan", metal: "Metal" };
function configLabel(config) {
  const fps = config.fpsLimit === "auto" ? "FPS auto" : config.fpsLimit === "0" ? "sin límite" : `${config.fpsLimit} FPS`;
  return [PROFILE[config.performanceProfile] || config.performanceProfile, ANGLE[config.angleBackend] || config.angleBackend, fps, config.performanceMode ? "modo rendimiento" : "", config.highPriority ? "prioridad alta" : "", config.clips ? `clips ${config.clips}` : "", config.kirka ? `Kirka: ${config.kirka}` : ""]
    .filter(Boolean)
    .join(" · ");
}

// All the matches of each configuration together, best first (by 1 % low,
// then average FPS). Averages are weighted by the time played.
function compare(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    if (!s?.result || !s.config) continue;
    const key = configKey(s.config);
    if (!groups.has(key)) groups.set(key, { key, label: configLabel(s.config), config: s.config, list: [] });
    groups.get(key).list.push(s);
  }
  const rows = [...groups.values()].map(({ key, label, config, list }) => {
    const seconds = list.reduce((n, s) => n + s.result.seconds, 0);
    const avg = (get) => {
      const vals = list.filter((s) => Number.isFinite(get(s)));
      const w = vals.reduce((n, s) => n + s.result.seconds, 0);
      return w ? Math.round(vals.reduce((n, s) => n + get(s) * s.result.seconds, 0) / w) : null;
    };
    const hitches = list.reduce((n, s) => n + (s.result.hitches || 0), 0);
    return {
      key,
      label,
      config,
      matches: list.length,
      minutes: Math.round(seconds / 6) / 10,
      fps: avg((s) => s.result.fps),
      low1: avg((s) => s.result.low1),
      low01: avg((s) => s.result.low01),
      hitchesPerMin: seconds ? Math.round((hitches / seconds) * 600) / 10 : 0,
      ramMB: avg((s) => s.process?.ramMB),
      cpu: avg((s) => s.process?.cpu),
      last: list.reduce((a, s) => (s.at > a ? s.at : a), ""),
    };
  });
  rows.sort((a, b) => (b.low1 ?? 0) - (a.low1 ?? 0) || (b.fps ?? 0) - (a.fps ?? 0));
  return rows;
}

// RAM (MB) and CPU (% of one core) of all the client's processes, and by kind.
function processMetrics(metrics) {
  const byType = {};
  let ram = 0;
  let cpu = 0;
  for (const m of metrics || []) {
    const mb = (m.memory?.workingSetSize || 0) / 1024;
    const c = m.cpu?.percentCPUUsage || 0;
    ram += mb;
    cpu += c;
    const t = (byType[m.type] ??= { count: 0, ramMB: 0, cpu: 0 });
    t.count++;
    t.ramMB += mb;
    t.cpu += c;
  }
  for (const t of Object.values(byType)) {
    t.ramMB = Math.round(t.ramMB);
    t.cpu = Math.round(t.cpu * 10) / 10;
  }
  return { ramMB: Math.round(ram), cpu: Math.round(cpu * 10) / 10, byType };
}

// Only what helps compare PCs: no names, paths or ids.
async function hardwareInfo(app) {
  let gpu = "";
  try {
    const info = await app.getGPUInfo("basic");
    const d = info?.gpuDevice?.find((g) => g.active) || info?.gpuDevice?.[0];
    gpu = info?.auxAttributes?.glRenderer || (d ? `vendor ${d.vendorId?.toString(16)} device ${d.deviceId?.toString(16)}` : "");
  } catch {}
  return {
    cpu: os.cpus()?.[0]?.model?.trim() || "",
    cores: os.cpus()?.length || 0,
    ramGB: Math.round(os.totalmem() / 1024 ** 3),
    gpu,
    os: `${os.platform()} ${os.release()}`,
  };
}

// What goes to RITE when the player said yes: the measurements, the settings
// and the kind of PC. No name, account, Kirka id, IP-derived data, licence or
// machine id: two matches of the same PC can't even be tied together.
function shareable(session) {
  const { at, client, electron, chrome, config, extras, hardware, result, process: proc, hz, width, height, kirka } = session;
  return { day: String(at || "").slice(0, 10), client, electron, chrome, config, extras, hardware, result, process: proc, hz, width, height, kirka };
}

const MAX_KEPT = 500;

class PerfStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, "sesiones.jsonl");
  }

  list() {
    let text = "";
    try {
      text = fs.readFileSync(this.file, "utf8");
    } catch {
      return [];
    }
    const out = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {}
    }
    return out.slice(-MAX_KEPT);
  }

  add(session) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(session)}\n`);
    // Trimmed now and then so the file never grows without end.
    const list = this.list();
    if (list.length >= MAX_KEPT) fs.writeFileSync(this.file, list.slice(-Math.floor(MAX_KEPT * 0.8)).map((s) => JSON.stringify(s)).join("\n") + "\n");
  }

  clear() {
    fs.rmSync(this.file, { force: true });
  }
}

// Checks what the preload sends: numbers in range, a histogram as [bucket, count] pairs.
function readSession(input) {
  if (!input || typeof input !== "object") return null;
  const seconds = Number(input.seconds);
  if (!(seconds >= 1 && seconds < 6 * 3600)) return null;
  const hist = new Array(BUCKETS).fill(0);
  if (!Array.isArray(input.hist) || input.hist.length > BUCKETS) return null;
  for (const pair of input.hist) {
    if (!Array.isArray(pair)) return null;
    const [b, n] = pair.map(Number);
    if (!Number.isInteger(b) || b < 0 || b >= BUCKETS || !Number.isInteger(n) || n < 0 || n > 1e8) return null;
    hist[b] += n;
  }
  const hitches = Math.max(0, Math.min(1e6, Math.round(Number(input.hitches) || 0)));
  const result = summarize(hist, seconds, hitches);
  if (!result) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  return {
    result,
    process: input.process ? { ramMB: num(input.process.ramMB), cpu: num(input.process.cpu) } : null,
    hz: num(input.hz),
    width: num(input.width),
    height: num(input.height),
    kirka: readKirka(input.kirka),
  };
}

module.exports = { KIRKA_SETTINGS, kirkaStorageKey, readKirka, kirkaOf, clipsOf, shareable, BUCKET_MS, BUCKETS, bucketOf, summarize, configOf, configKey, configLabel, compare, processMetrics, hardwareInfo, PerfStore, readSession, CONFIG_KEYS, EXTRA_KEYS, pick };
