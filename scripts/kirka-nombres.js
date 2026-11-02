"use strict";

// Kirka's app.js comes obfuscated, and its obfuscator renames most fields (the
// store module of the lobby, its mutations, Vue's __vue__...) with each build.
// The RITE lobby (src/preload/features/lobby-page.js) talks to that store, so
// after a Kirka update its names table K has to be brought up to date. This
// script makes that quick:
//
//   npm run kirka-nombres -- ruta/a/app.js [carpeta-de-salida]
//
// 1. Deobfuscates app.js (webcrack, plus Kirka's own string table) and writes
//    app.legible.js, which can be read and searched.
// 2. Finds the lobby's store module, its state and its mutations / actions, and
//    guesses the new name of each entry of K from what the code does.
// 3. Checks every name K uses today against the new code and writes
//    kirka-nombres.txt with the table, the guesses and what is missing.
//
// app.js is in DevTools (Sources, kirka.io/assets/js/app.<hash>.js) or in the
// client's cache. A guess is only a lead: check it in app.legible.js before
// changing K, and then run the tests.

const fs = require("node:fs");
const path = require("node:path");

const LOBBY = path.join(__dirname, "..", "src", "preload", "features", "lobby-page.js");

async function deobfuscate(code) {
  let webcrack;
  try {
    ({ webcrack } = await import("webcrack"));
  } catch {
    throw new Error("falta webcrack: corre `npm install` primero");
  }
  const result = await webcrack(code, { unpack: false, deobfuscate: true, mangle: false, jsx: false, unminify: true });
  return resolveStrings(result.code);
}

// Kirka's obfuscator keeps its texts in one big array, rotated at start-up, and
// reads them through a decoder: X(1234). webcrack leaves part of those calls;
// this runs the decoder and puts the texts back in place.
function resolveStrings(code) {
  const lines = code.split("\n");
  const rotate = lines.findIndex((l) => /^\}\)\(\w+, \d+\);$/.test(l));
  if (rotate < 0) return code;
  const arrayFn = lines[rotate].match(/^\}\)\((\w+),/)[1];
  let rotateStart = rotate;
  while (rotateStart >= 0 && !/^\(function \(\w+, \w+\) \{$/.test(lines[rotateStart])) rotateStart--;
  const block = (start) => {
    const end = lines.findIndex((l, i) => i > start && l === "}");
    return lines.slice(start, end + 1).join("\n");
  };
  const arrayStart = lines.findIndex((l) => l.startsWith(`function ${arrayFn}() {`));
  const decoderStart = lines.findIndex((l, i) => /^function \w+\(\w+, \w+\) \{$/.test(l) && lines[i + 1]?.includes(`= ${arrayFn}();`));
  if (arrayStart < 0 || decoderStart < 0 || rotateStart < 0) return code;
  const decoder = lines[decoderStart].match(/^function (\w+)/)[1];
  let decode;
  try {
    const source = `${block(arrayStart)}\n${block(decoderStart)}\n${lines.slice(rotateStart, rotate + 1).join("\n")}\nreturn ${decoder};`;
    decode = new Function(source)();
  } catch {
    return code;
  }
  // Every local alias of the decoder (var Dk = g; var a = Dk; ...).
  const aliases = new Set([decoder]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [, name, of] of code.matchAll(/\b(?:var|let|const) ([\w$]+) = ([\w$]+);/g)) {
      if (aliases.has(of) && !aliases.has(name)) {
        aliases.add(name);
        grew = true;
      }
    }
  }
  const names = [...aliases].sort((a, b) => b.length - a.length).map((n) => n.replace(/\$/g, "\\$"));
  const call = new RegExp(`\\b(${names.join("|")})\\((\\d+)\\)`, "g");
  return code
    .replace(call, (all, _, n) => {
      try {
        const text = decode(Number(n));
        return typeof text === "string" ? JSON.stringify(text) : all;
      } catch {
        return all;
      }
    })
    .replace(/(\?\.)?\[("[A-Za-z_$][\w$]*")\]/g, (_, optional, key) => `${optional || "."}${JSON.parse(key)}`);
}

// The lines of a block that opens on line `start`, up to the line that closes
// it at the same indentation.
function blockAt(lines, start) {
  const indent = lines[start].match(/^ */)[0];
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^${indent}\\}`).test(l));
  return lines.slice(start, end + 1);
}

const mostCommon = (matches) => {
  const counts = new Map();
  for (const m of matches) counts.set(m, (counts.get(m) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};

// The store module with the lobby: the one whose state has currentRegion,
// mods and maps. Returns its state fields and its groups of functions
// (getters, mutations, actions, each under a renamed key).
function findModule(code) {
  const lines = code.split("\n");
  const at = lines.findIndex((l, i) => /^\s+currentRegion: /.test(l) && lines.slice(Math.max(0, i - 400), i + 400).some((x) => /^\s+mods: /.test(x)));
  if (at < 0) return null;
  const fieldIndent = lines[at].match(/^ */)[0];
  let stateLine = at;
  while (stateLine > 0 && !/^\s+state: function \(\) \{$/.test(lines[stateLine])) stateLine--;
  const state = blockAt(lines, stateLine);
  const fields = state.filter((l) => l.startsWith(fieldIndent) && !l.startsWith(`${fieldIndent} `)).map((l) => l.trim().match(/^([\w$]+):/)?.[1]).filter(Boolean);
  const keyIndent = lines[stateLine].match(/^ */)[0];
  const groups = {};
  for (let i = stateLine + state.length; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith(keyIndent) && line.trim()) break;
    const open = line.match(new RegExp(`^${keyIndent}([\\w$]+): \\{$`));
    if (!open) continue;
    const group = blockAt(lines, i);
    const memberIndent = `${keyIndent}  `;
    const members = {};
    for (let j = 1; j < group.length; j++) {
      const m = group[j].match(new RegExp(`^${memberIndent}([\\w$]+): function \\(`));
      if (m) members[m[1]] = blockAt(group, j).join("\n");
    }
    groups[open[1]] = members;
    i += group.length - 1;
  }
  return { fields, groups };
}

// What each entry of K does, as code that only it has. Each one returns the
// new name or null.
function guess(code, mod) {
  const all = Object.assign({}, ...Object.values(mod.groups));
  const find = (test) => Object.keys(all).find((name) => test(all[name])) || null;
  const out = {};
  out.vue = mostCommon([...code.matchAll(/\.\$el\.([\w$]+) = /g)].map((m) => m[1]));
  out.setMode = find((b) => /\.mods\[\w+\], "activeCreate"/.test(b));
  out.setMap = find((b) => /\.maps\[\w+\], "activeCreate"/.test(b));
  const weapon = Object.entries(all).map(([name, b]) => [name, b.match(/\b\w+\.([\w$]+)\[\w+\]\.([\w$]+) = \w+;\s*\w+\(\w+\);/)]).find(([, m]) => m && m[2] !== "active");
  if (weapon) Object.assign(out, { setWeapon: weapon[0], weapons: weapon[1][1], weaponOn: weapon[1][2] });
  out.setMaxPlayers = find((b) => /Math\.max\(0, \w+ - 1\)/.test(b) && /\.bots\b/.test(b));
  out.maxPlayers = out.setMaxPlayers && all[out.setMaxPlayers].match(/\w+\.([\w$]+) = \w+;/)?.[1];
  out.setMinutes = find((b) => /^\s*setMinutes: /.test(b)) || null;
  const region = Object.entries(all).find(([, b]) => /localStorage\.removeItem\("region"\)/.test(b) && /\.currentRegion\b/.test(b));
  if (region) {
    out.useRegion = region[0];
    out.pickRegion = region[1].match(/\w+\("([\w$]+)", false\)/)?.[1] || null;
    out.regions = region[1].match(/\w+\.([\w$]+)\[\w+\];/)?.[1] || null;
  }
  // The map code sits right before modeMapJson in the state, and its mutation
  // only stores it.
  const mapCodeAt = mod.fields.indexOf("modeMapJson") - 1;
  out.mapCode = mapCodeAt >= 0 ? mod.fields[mapCodeAt] : null;
  out.setMapCode = out.mapCode && find((b) => new RegExp(`^\\s*[\\w$]+: function \\(\\w+, (\\w+)\\) \\{\\n.*\\n?\\s*\\w+\\.${out.mapCode.replace(/\$/g, "\\$")} = \\1;`).test(b));
  out.switchTeam = find((b) => /^\s*switchTeamLobby: /.test(b));
  return out;
}

function currentNames() {
  const source = fs.readFileSync(LOBBY, "utf8");
  const table = source.match(/const K = (\{[\s\S]*?\n {2}\});/);
  if (!table) throw new Error("no encontré la tabla K en lobby-page.js");
  return new Function(`return ${table[1]};`)();
}

async function main() {
  const [input, outDir = path.dirname(input || ".")] = process.argv.slice(2);
  if (!input) {
    console.error("Uso: npm run kirka-nombres -- ruta/a/app.js [carpeta-de-salida]");
    process.exit(1);
  }
  console.log("Desofuscando (tarda un par de minutos)...");
  const code = await deobfuscate(fs.readFileSync(input, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const legible = path.join(outDir, "app.legible.js");
  fs.writeFileSync(legible, code);

  const moduleKey = mostCommon([...code.matchAll(/\.(?:commit|dispatch)\("([\w$]+)\/[\w$]+"/g)].map((m) => m[1]));
  const mod = findModule(code);
  if (!mod) throw new Error("no encontré el módulo del lobby (el state con currentRegion, mods y maps)");
  const guesses = { modules: moduleKey, ...guess(code, mod) };
  const K = currentNames();
  const members = new Set([...mod.fields, ...Object.values(mod.groups).flatMap(Object.keys)]);
  const used = (name) => members.has(name) || new RegExp(`[."]${name.replace(/\$/g, "\\$")}\\b`).test(code);

  const report = [];
  report.push(`Kirka: ${path.basename(input)}  ->  ${legible}`, "");
  report.push(`Módulo del store: ${moduleKey}   (state.${moduleKey}, commits "${moduleKey}/...")`, "");
  report.push("Tabla K de lobby-page.js contra el código nuevo:");
  report.push("  clave           hoy en K              ¿sigue?   propuesta");
  const missing = [];
  for (const [key, value] of Object.entries(K)) {
    const now = Array.isArray(value) ? value.filter((v) => v !== "game" && v !== "__vue__")[0] : value;
    const ok = now ? used(now) : false;
    const proposal = guesses[key] ?? "";
    if (!ok || (proposal && proposal !== now)) missing.push(key);
    report.push(`  ${key.padEnd(15)} ${String(now).padEnd(21)} ${(ok ? "sí" : "NO").padEnd(9)} ${proposal && proposal !== now ? proposal : ""}`);
  }
  report.push("");
  report.push(`State del módulo (${mod.fields.length} campos): ${mod.fields.join(", ")}`, "");
  for (const [group, list] of Object.entries(mod.groups)) {
    report.push(`--- ${group} (${Object.keys(list).length}) ---`);
    for (const [name, body] of Object.entries(list)) {
      const lines = body.split("\n").slice(1, 7).map((l) => l.trim()).filter((l) => !/^var \w+ = \w+;$/.test(l));
      report.push(`${name}: ${lines.join(" ").slice(0, 220)}`);
    }
    report.push("");
  }
  const reportPath = path.join(outDir, "kirka-nombres.txt");
  fs.writeFileSync(reportPath, report.join("\n"));

  console.log(report.slice(0, Object.keys(K).length + 6).join("\n"));
  console.log("");
  if (missing.length) {
    console.log(`Revisa: ${missing.join(", ")}. Las propuestas son pistas; confírmalas en app.legible.js.`);
  } else {
    console.log("Todos los nombres de K siguen en el código nuevo.");
  }
  console.log(`Reporte completo (state, mutaciones y acciones del módulo): ${reportPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { resolveStrings, findModule, guess };
