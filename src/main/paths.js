"use strict";

const fs = require("node:fs");
const path = require("node:path");

// User-facing folders live in Documents/RITEClient so players can find them easily.
function getPaths(app) {
  const root = path.join(app.getPath("documents"), "RITEClient");
  const paths = {
    root,
    swapper: path.join(root, "swapper"),
    scripts: path.join(root, "scripts"),
    styles: path.join(root, "styles"),
    screenshots: path.join(root, "screenshots"),
    maps: path.join(root, "mapas"),
  };
  for (const dir of Object.values(paths)) fs.mkdirSync(dir, { recursive: true });
  return paths;
}

// Resolves `relative` inside `base`, or returns null if it would escape it.
function resolveInside(base, relative) {
  const resolved = path.resolve(base, relative);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  return resolved.startsWith(prefix) ? resolved : null;
}

module.exports = { getPaths, resolveInside };
