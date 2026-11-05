"use strict";

// Prepares a module for publishing: keeps the ==UserScript== header (only its
// @ lines) and minifies the rest with esbuild, so what goes to GitHub or to the
// license server carries no comments and no readable names. The file you keep
// in Documentos\RITEClient\modulos is the source; this is only what gets out.
//
//   node scripts/compactar.js Modulo.js > Modulo.min.js
//
// Used by scripts/modulos.js and scripts/licencias.js (default; --con-comentarios
// publishes the file as is).

const HEADER = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/;

function compactar(code) {
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch {
    throw new Error("falta esbuild: corre `npm install` primero");
  }
  const text = String(code);
  const block = HEADER.exec(text);
  const header = block
    ? ["// ==UserScript==", ...block[1].split("\n").map((l) => l.trim().replace(/^\/\/\s*/, "// ")).filter((l) => /^\/\/ @\w+/.test(l)), "// ==/UserScript==", ""].join("\n")
    : "";
  const body = block ? text.slice(block.index + block[0].length) : text;
  // No `format`: the script keeps its top-level names (they may be globals the
  // page or other scripts use); only what is local gets short names.
  const out = esbuild.transformSync(body, { loader: "js", target: "es2022", minify: true, legalComments: "none", charset: "utf8" }).code;
  return `${header}${out}`;
}

module.exports = { compactar };

if (require.main === module) {
  const fs = require("node:fs");
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("Dime el archivo: node scripts/compactar.js Modulo.js > Modulo.min.js");
    process.exit(1);
  }
  process.stdout.write(compactar(fs.readFileSync(file, "utf8")));
}
