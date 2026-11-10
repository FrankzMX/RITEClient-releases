"use strict";

// "Modo rendimiento" also lightens Kirka's own graphics: no shadows, bullet
// marks or shell cases, and the render resolution down to 100 % when it was
// higher. What the player had is kept, and turning the mode off puts it back.
// Kirka reads these on load, so they apply with F5.

const { KIRKA_SETTINGS, kirkaStorageKey } = require("../../main/perf-stats");

const BACKUP_KEY = "rite-kirka-respaldo";
const LIGHT = Object.freeze({ shadows: 0, decals: 0, cases: 0 });

// The values to write for the light setup, from the current ones (only the
// ones that change). Kirka's defaults when a value was never set: 1 (on, 100 %).
function lightChanges(current = {}) {
  const out = {};
  for (const [name, value] of Object.entries(LIGHT)) if (Number(current[name] ?? 1) !== value) out[name] = value;
  const resolution = Number(current.resolution ?? 1);
  if (resolution > 1) out.resolution = 1;
  return out;
}

function read(storage, name) {
  try {
    const raw = storage.getItem(kirkaStorageKey(KIRKA_SETTINGS[name]));
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(storage, name, value) {
  try {
    const key = kirkaStorageKey(KIRKA_SETTINGS[name]);
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Applies the light setup and keeps what was there. Returns how many changed.
function applyLight(storage) {
  const current = {};
  for (const name of Object.keys(KIRKA_SETTINGS)) current[name] = read(storage, name);
  const changes = lightChanges(current);
  const names = Object.keys(changes);
  if (!names.length) return 0;
  // A backup already there (the mode was on before) is the player's own: keep it.
  let backup = null;
  try {
    backup = JSON.parse(storage.getItem(BACKUP_KEY) || "null");
  } catch {}
  if (!backup) backup = Object.fromEntries(names.map((name) => [name, current[name]]));
  else for (const name of names) if (!(name in backup)) backup[name] = current[name];
  try {
    storage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {}
  for (const name of names) write(storage, name, changes[name]);
  return names.length;
}

// Puts back what the player had before the mode. Returns how many changed.
function restore(storage) {
  let backup = null;
  try {
    backup = JSON.parse(storage.getItem(BACKUP_KEY) || "null");
  } catch {}
  if (!backup || typeof backup !== "object") return 0;
  let n = 0;
  for (const [name, value] of Object.entries(backup)) {
    if (!KIRKA_SETTINGS[name]) continue;
    write(storage, name, value);
    n++;
  }
  try {
    storage.removeItem(BACKUP_KEY);
  } catch {}
  return n;
}

module.exports = { lightChanges, applyLight, restore, BACKUP_KEY, LIGHT };
