"use strict";

const os = require("node:os");

// Forced GPU choices: they help a strong PC, but on a weak or blocklisted GPU
// they can cost frames or stability, so only the competitive profile uses them.
const GPU_SWITCHES = [["ignore-gpu-blocklist"], ["enable-gpu-rasterization"], ["enable-zero-copy"], ["force_high_performance_gpu"]];

// Full speed with the window hidden or minimized. Without them Chromium slows
// a hidden window down, which saves CPU and GPU for whatever else is open.
const NO_BACKGROUND_THROTTLING = [["disable-background-timer-throttling"], ["disable-renderer-backgrounding"], ["disable-backgrounding-occluded-windows"]];

// Uncapped frame rate and no vsync: only competitive without an FPS limit.
const UNCAPPED_SWITCHES = [["disable-frame-rate-limit"], ["disable-gpu-vsync"]];

const PROFILE_SWITCHES = {
  // Forced GPU and no throttling; without an FPS limit also no vsync and no
  // frame rate limit (see uncapped): lowest input latency.
  competitive: [...GPU_SWITCHES, ...NO_BACKGROUND_THROTTLING],
  // Chromium's frame pacing (vsync) with the client's FPS limit (the monitor's Hz by default).
  balanced: [],
  // Chromium defaults.
  quality: [],
  // Only the uncapped switches (see uncapped), nothing else: like Helium.
  pure: [],
};

const profileOf = (settings) => settings.performanceProfile;

// Competitive with "sin límite": Chromium draws as fast as it can, without
// vsync. With an FPS limit, competitive keeps Chromium's own frame pacing
// (vsync) and the page skips frames down to the limit, like the other
// profiles. Holding frames back without vsync either hitched ~20 ms each time
// (beta.33 and before) or kept the page's thread busy waiting (beta.34 to 36):
// hundreds of stutters a minute in RITE Bench, and on a 4-core laptop the game
// froze and the ping went up to 2000 ms while shooting.
const uncapped = (settings) => ["competitive", "pure"].includes(profileOf(settings)) && String(settings.fpsLimit) === "0";

const ANGLE_BACKENDS = {
  win32: ["d3d11", "d3d9", "gl", "vulkan"],
  darwin: ["metal", "gl"],
  linux: ["gl", "vulkan"],
};

// Returns the list of [switch, value?] pairs for the given settings and platform.
function getSwitches(settings, platform = process.platform) {
  const switches = [...(uncapped(settings) ? UNCAPPED_SWITCHES : []), ...(PROFILE_SWITCHES[profileOf(settings)] || PROFILE_SWITCHES.balanced)];
  const backend = settings.angleBackend;
  if (backend !== "default" && (ANGLE_BACKENDS[platform] || []).includes(backend)) {
    switches.push(["use-angle", backend]);
  }
  return switches;
}

function applySwitches(app, settings) {
  for (const [name, value] of getSwitches(settings)) {
    if (value === undefined) app.commandLine.appendSwitch(name);
    else app.commandLine.appendSwitch(name, value);
  }
}

// Raises the priority of all the client's processes together. The network
// service runs in a utility process: leaving it behind a busy GPU and game
// process delays the game's packets (shots that don't register, ping spikes).
// Best effort: some platforms need elevated rights for this.
function raiseProcessPriority(app) {
  const priority = os.constants.priority.PRIORITY_ABOVE_NORMAL;
  const pids = new Set([process.pid]);
  for (const metric of app.getAppMetrics()) {
    if (["GPU", "Tab", "Utility"].includes(metric.type)) pids.add(metric.pid);
  }
  for (const pid of pids) {
    try {
      os.setPriority(pid, priority);
    } catch {}
  }
}

// The frame cap the page's frame counter applies ("auto" = the monitor's Hz).
// With vsync on (every profile but competitive without a limit) Chromium already draws at most
// once per refresh, so a cap at the monitor's rate or above does nothing but
// harm: Windows rounds the rate (59.94 Hz shows as 59 or 60) and frames that
// come a hair early were skipped, a stutter every second or so. Then: no cap.
function frameCap(settings, hz) {
  const rate = Number(hz) || 0;
  const limit = settings.fpsLimit === "auto" ? rate : Number(settings.fpsLimit) || 0;
  if (!limit) return 0;
  if (rate && limit >= rate - 1) return 0;
  return limit;
}

// Whether the window keeps running at full speed when hidden.
const backgroundThrottling = (settings) => profileOf(settings) !== "competitive";

module.exports = { getSwitches, applySwitches, raiseProcessPriority, backgroundThrottling, profileOf, frameCap, uncapped, ANGLE_BACKENDS };
