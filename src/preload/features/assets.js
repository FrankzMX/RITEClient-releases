"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ASSETS = path.join(__dirname, "../../assets");
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const cache = new Map();

// Bundled assets are inlined because the game page cannot load file:// URLs.
function dataUrl(relative) {
  if (!cache.has(relative)) {
    const file = path.join(ASSETS, relative);
    const mime = MIME[path.extname(file)] || "application/octet-stream";
    cache.set(relative, `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`);
  }
  return cache.get(relative);
}

function text(relative) {
  return fs.readFileSync(path.join(ASSETS, relative), "utf8");
}

module.exports = { dataUrl, text };
