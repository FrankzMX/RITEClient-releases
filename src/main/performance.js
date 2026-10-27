"use strict";

const os = require("node:os");

// Forced GPU choices: they help a strong PC, but on a weak or blocklisted GPU
// they can cost frames or stability, so only the competitive profile uses them.
const GPU_SWITCHES = [["ignore-gpu-blocklist"], ["enable-gpu-rasterization"], ["enable-zero-copy"], ["force_high_performance_gpu"]];

// Full speed with the window hidden or minimized. Without them Chromium slows
// a hidden window down, which saves CPU and GPU for whatever else is open.
const NO_BACKGROUND_THROTTLING = [["disable-background-timer-throttling"], ["disable-renderer-backgrounding"], ["disable-backgrounding-occluded-windows"]];

const PROFILE_SWITCHES = {
  // Uncapped frame rate and no vsync, forced GPU and no throttling: lowest input latency.
  competitive: [["disable-frame-rate-limit"], ["disable-gpu-vsync"], ...GPU_SWITCHES, ...NO_BACKGROUND_THROTTLING],
  // Chromium's frame pacing (vsync) with the client's FPS limit (the monitor's Hz by default).
  balanced: [],
  // Chromium defaults.
  quality: [],
};

const profileOf = (settings) => settings.performanceProfile;

const ANGLE_BACKENDS = {
  win32: ["d3d11", "d3d9", "gl", "vulkan"],
  darwin: ["metal", "gl"],
  linux: ["gl", "vulkan"],
};

// Returns the list of [switch, value?] pairs for the given settings and platform.
function getSwitches(settings, platform = process.platform) {
  const switches = [...(PROFILE_SWITCHES[profileOf(settings)] || PROFILE_SWITCHES.balanced)];
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

// Whether the window keeps running at full speed when hidden.
const backgroundThrottling = (settings) => profileOf(settings) !== "competitive";

module.exports = { getSwitches, applySwitches, raiseProcessPriority, backgroundThrottling, profileOf, ANGLE_BACKENDS };
