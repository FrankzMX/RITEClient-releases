"use strict";

// RITE Light brings what matters from RITE Client, so the player doesn't set
// it all up again: the crosshair, the block texture, the swapper, scripts and
// styles, the FPS counter, the menu key, profiles. Not the GPU profile or the
// FPS limit: Light keeps its own (balanced, at the monitor's Hz).
//
// The first time Light opens it also copies Kirka's own storage (sensitivity,
// keys, graphics and the session) from RITE Client, so the game is as the
// player had it. Later, «Traer ajustes de RITE Client» in the menu copies the
// client's settings again (Kirka's can't be copied while the game is open:
// Kirka has its own import for those).
//
// @author FRANKZ

const fs = require("node:fs");
const path = require("node:path");

const FULL_NAME = "RITE Client";

const ESSENTIAL_KEYS = Object.freeze([
  "crosshairEnabled",
  "crosshairStyle",
  "crosshairColor",
  "crosshairSize",
  "crosshairThickness",
  "crosshairDotSize",
  "crosshairGap",
  "crosshairOutline",
  "crosshairOpacity",
  "fpsCounter",
  "fpsCounterSize",
  "fpsCounterDetail",
  "blockTexture",
  "blockTextureFile",
  "customTextureUrl",
  "swapperEnabled",
  "userscriptsEnabled",
  "enabledScripts",
  "userstylesEnabled",
  "enabledStyles",
  "customCss",
  "menuKey",
  "language",
  "autoFullscreen",
  "angleBackend",
  "baseUrl",
  "savedProfiles",
]);

const fullDir = (appData) => path.join(appData, FULL_NAME);

// RITE Client's saved settings, or null when it was never installed here.
function readFullSettings(appData) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(fullDir(appData), "settings.json"), "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function pickEssentials(data) {
  const out = {};
  if (!data) return out;
  for (const key of ESSENTIAL_KEYS) if (key in data) out[key] = data[key];
  return out;
}

// Copies the essentials into `settings` (a SettingsStore, which checks each
// value). Returns how many were taken.
function importInto(settings, appData) {
  let taken = 0;
  for (const [key, value] of Object.entries(pickEssentials(readFullSettings(appData)))) {
    if (JSON.stringify(settings.get(key)) === JSON.stringify(value)) continue;
    if (settings.set(key, value)) taken++;
  }
  return taken;
}

// Before the store and the session exist: true when Light has never run
// here. Then Kirka's "Local Storage" from RITE Client is copied over (best
// effort: if RITE Client is open, a half-written copy is simply rebuilt by
// Chromium, and Light starts as a fresh browser).
function firstRun(appData, lightDir) {
  if (fs.existsSync(path.join(lightDir, "settings.json"))) return false;
  const from = path.join(fullDir(appData), "Local Storage");
  const to = path.join(lightDir, "Local Storage");
  try {
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.mkdirSync(lightDir, { recursive: true });
      fs.cpSync(from, to, { recursive: true, filter: (src) => path.basename(src) !== "LOCK" });
    }
  } catch (error) {
    console.error("[RITE] Light: no se pudo copiar el almacenamiento de Kirka:", error.message);
    try {
      fs.rmSync(to, { recursive: true, force: true });
    } catch {}
  }
  return true;
}

module.exports = { ESSENTIAL_KEYS, readFullSettings, pickEssentials, importInto, firstRun, FULL_NAME };
