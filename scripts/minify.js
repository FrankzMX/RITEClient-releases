"use strict";

// Release builds only: minifies every .js in src/ in place (no comments, short
// names) so the code inside the installer is hard to read, and drops the
// private repository link from package.json. Run it on a throwaway checkout,
// never on your working copy.
const fs = require("node:fs");
const path = require("node:path");
const { transformSync } = require("esbuild");

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".js") ? [full] : [];
  });

let before = 0;
let after = 0;
for (const file of walk("src")) {
  const code = fs.readFileSync(file, "utf8");
  const out = transformSync(code, { loader: "js", format: "cjs", platform: "node", target: "node22", minify: true, legalComments: "none" }).code;
  fs.writeFileSync(file, out);
  before += code.length;
  after += out.length;
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
delete pkg.repository;
fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`src minificado: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
