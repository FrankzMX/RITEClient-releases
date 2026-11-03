"use strict";

// Backups of the Kirka map editor. Before TEST MODE, Kirka keeps the whole map
// as JSON in localStorage ("editorTestMapJson") and replays it chunk by chunk
// when the player presses Back to Editor. If the editor autosaves during that
// replay (for example after going back in the browser), the account autosave
// and the linked map in My Maps keep only the half that had loaded. The client
// copies that JSON to Documents/RITEClient/respaldos-editor each time it
// changes, so the map can be brought back with IMPORT.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_BYTES = 20 * 1024 * 1024;
const KEEP = 30;
const EXT = ".json";

// The map JSON, if `text` looks like an editor map with blocks; otherwise null.
function parseMap(text) {
  if (typeof text !== "string" || !text || text.length > MAX_BYTES || text[0] !== "{") return null;
  try {
    const map = JSON.parse(text);
    if (!map || typeof map !== "object" || !map.chunks___DATA || typeof map.chunks___DATA !== "object") return null;
    return map;
  } catch {
    return null;
  }
}

const safeName = (name) =>
  String(name || "")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40) || "mapa";

const stamp = (date) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
};

const hash = (text) => crypto.createHash("sha1").update(text).digest("hex");

function backups(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(EXT))
    .map((name) => {
      const file = path.join(dir, name);
      try {
        return { file, time: fs.statSync(file).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time);
}

// Saves `text` as a new backup unless it is not a map or is the same as the
// newest backup. Keeps the newest KEEP files. Returns the file written or "".
function saveBackup(dir, text, now = new Date()) {
  const map = parseMap(text);
  if (!map) return "";
  fs.mkdirSync(dir, { recursive: true });
  const list = backups(dir);
  const digest = hash(text);
  if (list.length) {
    try {
      if (hash(fs.readFileSync(list[0].file, "utf8")) === digest) return "";
    } catch {}
  }
  const base = `${safeName(map.mapName___DATA)} ${stamp(now)}`;
  let file = path.join(dir, base + EXT);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i})${EXT}`);
  fs.writeFileSync(file, text, "utf8");
  for (const old of backups(dir).slice(KEEP)) {
    try {
      fs.unlinkSync(old.file);
    } catch {}
  }
  return file;
}

module.exports = { parseMap, saveBackup, KEEP };
