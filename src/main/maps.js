"use strict";

// Custom maps for the RITE lobby: Kirka can create a match from a map code (the
// one its editor exports). Maps that Kirka doesn't have go in
// Documents/RITEClient/mapas as text files named like the map in the RITE vote
// (for example "Mapa Nuevo.txt"), with the code inside.

const fs = require("node:fs");
const path = require("node:path");

const EXT = /\.(txt|json)$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const norm = (text) => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function mapFiles(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => EXT.test(name))
    .map((name) => ({ name: name.replace(EXT, ""), file: path.join(dir, name) }))
    .filter((m) => {
      try {
        const stat = fs.statSync(m.file);
        return stat.isFile() && stat.size > 0 && stat.size <= MAX_BYTES;
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const listMaps = (dir) => mapFiles(dir).map((m) => m.name);

// The code of the map with that name (spaces, case and symbols don't matter), or "".
function mapCode(dir, name) {
  const want = norm(name);
  const hit = want && mapFiles(dir).find((m) => norm(m.name) === want);
  if (!hit) return "";
  try {
    return fs.readFileSync(hit.file, "utf8").replace(/^﻿/, "").trim();
  } catch {
    return "";
  }
}

module.exports = { listMaps, mapCode };
