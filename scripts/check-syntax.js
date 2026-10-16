"use strict";

// Fails if any JavaScript file in src/, test/ or scripts/ has a syntax error.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const roots = ["src", "test", "scripts"];
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
};
for (const root of roots) if (fs.existsSync(root)) walk(root);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failed++;
    process.stderr.write(error.stderr.toString());
  }
}
console.log(`${files.length - failed}/${files.length} archivos OK`);
process.exit(failed ? 1 : 0);
