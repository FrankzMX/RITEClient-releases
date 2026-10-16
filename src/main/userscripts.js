"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveInside } = require("./paths");

const MAX_SIZE = 2 * 1024 * 1024;

function listFiles(dir, extension) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.toLowerCase().endsWith(extension))
    .filter((name) => {
      try {
        const stat = fs.statSync(path.join(dir, name));
        return stat.isFile() && stat.size <= MAX_SIZE;
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b));
}

function readFile(dir, name) {
  const file = resolveInside(dir, name);
  if (!file) return null;
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

// Reads a `// ==UserScript==` header, if any, for display in the menu.
function parseMeta(code) {
  const meta = {};
  const block = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/.exec(code);
  if (!block) return meta;
  for (const line of block[1].split("\n")) {
    const match = /\/\/\s*@(\w+)\s+(.+)/.exec(line);
    if (match && ["name", "description", "author", "version"].includes(match[1])) {
      meta[match[1]] = match[2].trim().slice(0, 200);
    }
  }
  return meta;
}

// Lists scripts and styles with their enabled state, without their source.
function listCustomizations(paths, settings) {
  // `file` is what gets saved as enabled; `name` is only for display (the
  // script's @name when it has one).
  const scripts = listFiles(paths.scripts, ".js").map((file) => {
    const meta = parseMeta(readFile(paths.scripts, file) || "");
    return { ...meta, file, name: meta.name || file, enabled: settings.enabledScripts.includes(file) };
  });
  const styles = listFiles(paths.styles, ".css").map((file) => ({
    file,
    name: file,
    enabled: settings.enabledStyles.includes(file),
  }));
  return { scripts, styles };
}

// Returns the source of every enabled script and style, in a stable order.
function loadEnabled(paths, settings) {
  const pick = (dir, ext, enabled) =>
    listFiles(dir, ext)
      .filter((name) => enabled.includes(name))
      .map((name) => ({ name, code: readFile(dir, name) }))
      .filter((item) => item.code !== null);

  return {
    scripts: settings.userscriptsEnabled ? pick(paths.scripts, ".js", settings.enabledScripts) : [],
    styles: settings.userstylesEnabled ? pick(paths.styles, ".css", settings.enabledStyles) : [],
  };
}

module.exports = { listCustomizations, loadEnabled, parseMeta, listFiles };
