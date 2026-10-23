"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS, ENUMS, RANGES, GAME_HOSTS } = require("./defaults");
const hubLayout = require("../hub/layout");

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// Any file name Windows allows (scripts downloaded from GitHub often keep
// "%20" or accents), but never a path.
const SAFE_FILE_NAME = /^(?!\.)[^\\/:*?"<>|\x00-\x1f]{1,120}\.(js|css)$/i;

function isGameUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GAME_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  if (value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isLayoutJson(value) {
  try {
    return hubLayout.isValid(JSON.parse(value));
  } catch {
    return false;
  }
}

// Returns a sanitized value for `key`, or undefined when the value is invalid.
function sanitize(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return undefined;
  const fallback = DEFAULT_SETTINGS[key];

  if (Array.isArray(fallback)) {
    if (!Array.isArray(value)) return undefined;
    return [...new Set(value.filter((v) => typeof v === "string" && SAFE_FILE_NAME.test(v)))];
  }
  if (typeof value !== typeof fallback) return undefined;
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;

  if (ENUMS[key] && !ENUMS[key].includes(value)) return undefined;
  if (RANGES[key]) {
    const [min, max] = RANGES[key];
    return Math.min(max, Math.max(min, Math.round(value)));
  }
  if (key.endsWith("Color") && !HEX_COLOR.test(value)) return undefined;
  if (key === "baseUrl" && !isGameUrl(value)) return undefined;
  if (key === "customCss" && value.length > 200_000) return undefined;
  if (key === "customTextureUrl" && value !== "" && !isHttpsUrl(value)) return undefined;
  if (key === "hubLayout" && value !== "" && (value.length > 1000 || !isLayoutJson(value))) return undefined;
  if (key === "hubFolded" && value !== "" && !/^[a-z0-9-]{1,20}(,[a-z0-9-]{1,20}){0,7}$/.test(value)) return undefined;
  if (key === "menuKey" && !/^[A-Za-z0-9]{1,20}$/.test(value)) return undefined;
  return value;
}

function migrate(raw) {
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key === "schemaVersion" || !(key in data)) continue;
    const value = sanitize(key, data[key]);
    if (value !== undefined) result[key] = value;
  }
  // v2: the FPS limit came out as "no limit" in beta.11; most players are better
  // off with the new default.
  const version = Number(data.schemaVersion) || 1;
  if (version < 2 && result.fpsLimit === "0") result.fpsLimit = DEFAULT_SETTINGS.fpsLimit;
  // v3 (beta.18): "competitive" and high priority were the defaults, not a
  // choice; most players run smoother with the new balanced defaults.
  if (version < 3) {
    if (result.performanceProfile === "competitive") result.performanceProfile = DEFAULT_SETTINGS.performanceProfile;
    result.highPriority = DEFAULT_SETTINGS.highPriority;
  }
  result.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
  return result;
}

class SettingsStore {
  constructor(dir) {
    this.file = path.join(dir, "settings.json");
    this.listeners = new Set();
    this.data = migrate(this.read());
    this.write();
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        // Keep a copy of a corrupt file instead of silently losing it.
        try {
          fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        } catch {}
      }
      return {};
    }
  }

  write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }

  get(key) {
    return this.data[key];
  }

  getAll() {
    return { ...this.data };
  }

  // Returns true when the value was accepted.
  set(key, value) {
    if (key === "schemaVersion") return false;
    const clean = sanitize(key, value);
    if (clean === undefined) return false;
    this.data[key] = clean;
    this.write();
    for (const listener of this.listeners) listener(key, clean);
    return true;
  }

  reset() {
    this.data = { ...DEFAULT_SETTINGS };
    this.write();
    for (const listener of this.listeners) listener(null, null);
  }

  // Imports a previously exported JSON string. Unknown or invalid keys are ignored.
  import(json) {
    this.data = migrate(JSON.parse(json));
    this.write();
    for (const listener of this.listeners) listener(null, null);
  }

  export() {
    return JSON.stringify(this.data, null, 2);
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

module.exports = { SettingsStore, sanitize, migrate, isGameUrl };
