"use strict";

// "Mis perfiles": the player saves the performance settings as they are under
// a name (the client's and Kirka's own graphics) and puts them all back with
// one click. Kept in the settings as JSON text ("savedProfiles"), so export
// and import carry them too.

const { ENUMS } = require("./defaults");
const { readKirka } = require("./perf-stats");

const MAX_PROFILES = 10;
const NAME_MAX = 24;
// The client settings a profile holds.
const PROFILE_KEYS = Object.freeze(["performanceProfile", "angleBackend", "fpsLimit", "highPriority", "performanceMode"]);
// The FPS limit that goes with each base profile (the menu moves it).
const PROFILE_FPS = Object.freeze({ competitive: "0", pure: "0", balanced: "auto", quality: "auto" });

const cleanName = (name) => (typeof name === "string" ? name.replace(/[\x00-\x1f<>]/g, "").trim().slice(0, NAME_MAX) : "");

function cleanProfile(p) {
  if (!p || typeof p !== "object") return null;
  const name = cleanName(p.name);
  const s = p.settings && typeof p.settings === "object" ? p.settings : {};
  const settings = {};
  for (const key of PROFILE_KEYS) {
    const value = s[key];
    if (ENUMS[key] ? ENUMS[key].includes(value) : typeof value === "boolean") settings[key] = value;
  }
  if (!name || !settings.performanceProfile) return null;
  return { name, settings, kirka: readKirka(p.kirka) };
}

// The list from its JSON text, cleaned (a bad entry is dropped, not the list).
function parseProfiles(text) {
  let list = [];
  try {
    list = JSON.parse(text || "[]");
  } catch {}
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    const clean = cleanProfile(p);
    if (clean && !out.some((o) => o.name.toLowerCase() === clean.name.toLowerCase())) out.push(clean);
    if (out.length >= MAX_PROFILES) break;
  }
  return out;
}

const stringify = (list) => JSON.stringify(parseProfiles(JSON.stringify(list)));

// What the settings and Kirka look like now, as a profile.
const snapshot = (name, settings, kirka) => cleanProfile({ name, settings: Object.fromEntries(PROFILE_KEYS.map((k) => [k, settings[k]])), kirka });

// Saves (or replaces, same name) a profile. Returns the new JSON text.
function save(text, profile) {
  const list = parseProfiles(text).filter((p) => p.name.toLowerCase() !== profile.name.toLowerCase());
  return stringify([...list, profile].slice(-MAX_PROFILES));
}

const remove = (text, name) => stringify(parseProfiles(text).filter((p) => p.name !== name));

// Whether the settings (and Kirka's, for what the profile holds) are as the profile has them.
function matches(profile, settings, kirka = {}) {
  for (const [key, value] of Object.entries(profile.settings)) if (settings[key] !== value) return false;
  for (const [key, value] of Object.entries(profile.kirka || {})) if (Number(kirka?.[key] ?? 1) !== value) return false;
  return true;
}

// The name to show for what is set now: a saved profile, the base profile
// (when the FPS limit is the one that goes with it), or "Personalizado".
function activeName(settings, kirka, list, baseNames = {}) {
  const saved = list.find((p) => matches(p, settings, kirka));
  if (saved) return saved.name;
  const base = settings.performanceProfile;
  if (PROFILE_FPS[base] === settings.fpsLimit && !settings.highPriority) return baseNames[base] || base;
  return "Personalizado";
}

module.exports = { PROFILE_KEYS, PROFILE_FPS, MAX_PROFILES, parseProfiles, snapshot, save, remove, matches, activeName, cleanName };
