"use strict";

// Kirka's file names carry a hash that changes with every patch
// (assets/media/__use__.6f884eb5.mp3). The swapper helper needs today's names,
// so this reads them from the text of Kirka's app.js: the per-weapon context
// maps ('./AR-9/__sounds__/__use__.mp3': <module>) and the string table the
// game keeps its texts in. Only the text is read; no code from the game runs.

// Finds the bracket that closes the one at src[start], skipping strings.
function matchBracket(src, start) {
  const open = src[start];
  const close = { "{": "}", "(": ")", "[": "]" }[open];
  if (!close) return -1;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return -1;
}

// Reads one JS string literal that starts at src[i] (a quote). Returns [text, end].
function readString(src, i) {
  const q = src[i];
  let out = "";
  let j = i + 1;
  for (; j < src.length && src[j] !== q; j++) {
    if (src[j] !== "\\") {
      out += src[j];
      continue;
    }
    const d = src[++j];
    if (d === "x") {
      out += String.fromCharCode(parseInt(src.slice(j + 1, j + 3), 16));
      j += 2;
    } else if (d === "u") {
      out += String.fromCharCode(parseInt(src.slice(j + 1, j + 5), 16));
      j += 4;
    } else out += { n: "\n", t: "\t", r: "\r", 0: "\0" }[d] ?? d;
  }
  return [out, j];
}

// Tiny calculator for the check that tells how far the string table is
// rotated: numbers, parseInt(alias(0x…)), + - * / and parentheses only.
function calc(expr, value) {
  const tokens = expr.match(/parseInt\([\w$]+\(0x[0-9a-f]+\)\)|0x[0-9a-f]+|\d+|[-+*/()]/g) || [];
  let i = 0;
  const atom = () => {
    const t = tokens[i++];
    if (t === "(") {
      const v = sum();
      i++;
      return v;
    }
    if (t === "-") return -atom();
    if (t === "+") return atom();
    if (t.startsWith("parseInt")) return parseInt(value(parseInt(t.match(/0x[0-9a-f]+/)[0], 16)), 10);
    return Number(t);
  };
  const product = () => {
    let v = atom();
    while (tokens[i] === "*" || tokens[i] === "/") v = tokens[i++] === "*" ? v * atom() : v / atom();
    return v;
  };
  const sum = () => {
    let v = product();
    while (tokens[i] === "+" || tokens[i] === "-") v = tokens[i++] === "+" ? v + product() : v - product();
    return v;
  };
  return sum();
}

// Rebuilds the string table: returns { decode(n), size, off } or null.
function buildDecoder(src) {
  const re = /function ([A-Za-z_$][\w$]*)\(a,b\)\{var c=([A-Za-z_$][\w$]*)\(\);return \1=function\(d,e\)\{d=d-(0x[0-9a-f]+);var h=c\[d\];return h;\}/g;
  let m;
  while ((m = re.exec(src))) {
    const fName = m[2];
    const off = parseInt(m[3], 16);
    const fStart = src.indexOf(`function ${fName}(){var `);
    if (fStart < 0) continue;
    let i = src.indexOf("=[", fStart) + 1;
    if (i <= 0) continue;
    const arr = [];
    let broken = false;
    for (;;) {
      i++;
      while (src[i] === " " || src[i] === "," || src[i] === "\n") i++;
      if (src[i] === "]") break;
      if (src[i] !== "'" && src[i] !== '"') {
        broken = true;
        break;
      }
      const [text, end] = readString(src, i);
      arr.push(text);
      i = end;
    }
    if (broken || !arr.length) continue;
    const rot = src.slice(m.index, m.index + 4000).match(/var e=(.*?);if\(e===b\)break;[\s\S]*?\}\(\w+,(0x[0-9a-f]+)\)/);
    if (rot) {
      const target = parseInt(rot[2], 16);
      let ok = false;
      for (let k = 0; k < arr.length && !ok; k++) {
        try {
          if (calc(rot[1], (n) => arr[n - off]) === target) ok = true;
        } catch {}
        if (!ok) arr.push(arr.shift());
      }
      if (!ok) continue;
    }
    return { decode: (n) => arr[n - off], size: arr.length, off };
  }
  return null;
}

// Replaces `alias(0x…)` calls in a snippet with their strings.
function decodeSnippet(snippet, decode) {
  return snippet.replace(/[A-Za-z_$][\w$]{0,5}\((0x[0-9a-f]+)\)/g, (all, hex) => {
    const v = decode(parseInt(hex, 16));
    return typeof v === "string" ? JSON.stringify(v) : all;
  });
}

// Body of the webpack module `id` ('90d7':function(e,h,i){...} or 1234:function...).
function moduleBody(src, id) {
  const keys = typeof id === "number" ? [`0x${id.toString(16)}:function(`, `${id}:function(`] : [`'${id}':function(`, `"${id}":function(`];
  for (const key of keys) {
    let at = src.indexOf(key);
    while (at > 0 && /[\w$]/.test(src[at - 1])) at = src.indexOf(key, at + 1);
    if (at < 0) continue;
    const end = matchBracket(src, src.indexOf("{", at + key.length));
    if (end > 0) return src.slice(src.indexOf("{", at + key.length), end + 1);
  }
  return null;
}

// A module id as written in a context map: 'bb32' | alias(0x3d0b) | 1234 | 0x4d2.
function resolveId(raw, decode) {
  raw = raw.trim();
  let m = raw.match(/^['"]([^'"]+)['"]$/);
  if (m) return /^\d+$/.test(m[1]) ? Number(m[1]) : m[1];
  m = raw.match(/^[\w$]+\((0x[0-9a-f]+)\)$/);
  if (m) {
    const v = decode(parseInt(m[1], 16));
    if (typeof v !== "string") return null;
    return /^\d+$/.test(v) ? Number(v) : v; // numeric ids are written in hex: 6591 → 0x19bf
  }
  if (/^0x[0-9a-f]+$/.test(raw)) return parseInt(raw, 16);
  if (/^\d+$/.test(raw)) return Number(raw);
  return null;
}

const ASSET = /assets\/(?:media|img|glb)\/[\w.\- ]+?\.(?:mp3|wav|ogg|webp|png|jpg|glb)/;

// Asset path behind a context-map key such as './AR-9/__sounds__/__use__.mp3'.
function assetForKey(src, key, decode) {
  const re = new RegExp(`'${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}':([^,}]+)`, "g");
  let m;
  while ((m = re.exec(src))) {
    const id = resolveId(m[1], decode);
    if (id === null || id === undefined) continue;
    const body = moduleBody(src, id);
    if (!body) continue;
    const found = decodeSnippet(body, decode).match(ASSET);
    if (found) return found[0];
  }
  return null;
}

// What the swapper helper needs from app.js:
//   weapons: { "AR-9": { use: "assets/media/__use__.6f884eb5.mp3", texture: "assets/img/texture.1794de31.webp" } }
//   media:   { "__reload__": "assets/media/__reload__.fed3e0ac.mp3", "__hit__": ..., ... }
function extractKirkaAssets(src) {
  const decoder = buildDecoder(src);
  if (!decoder) return null;
  const { decode } = decoder;
  const names = new Set();
  for (const m of src.matchAll(/'\.\/([\w\- ]+)\/__sounds__\/__use__\.mp3'/g)) names.add(m[1]);
  const weapons = {};
  for (const weapon of [...names].sort()) {
    weapons[weapon] = {
      use: assetForKey(src, `./${weapon}/__sounds__/__use__.mp3`, decode),
      texture: assetForKey(src, `./${weapon}/__skins__/${weapon}/texture.webp`, decode),
    };
  }
  const media = {};
  const addMedia = (text) => {
    for (const hit of String(text).matchAll(/assets\/media\/(__[\w\- ]+?__ ?)\.([0-9a-f]{8})\.(mp3|wav|ogg)/g)) {
      if (!media[hit[1]]) media[hit[1]] = hit[0];
    }
  };
  addMedia(src);
  for (let i = 0; i < decoder.size; i++) {
    const v = decode(decoder.off + i);
    if (typeof v === "string" && v.includes("assets/media/")) addMedia(v);
  }
  // Sounds behind a context map: './__share__/__sounds__/__reload__.mp3', './__Concrete__.mp3' (steps)…
  for (const m of new Set([...src.matchAll(/'(\.\/(?:__share__\/__sounds__\/)?(__[\w\-]+__)\.(?:mp3|wav|ogg))':/g)].map((x) => `${x[1]}|${x[2]}`))) {
    const [key, name] = m.split("|");
    if (media[name]) continue;
    const p = assetForKey(src, key, decode);
    if (p) media[name] = p;
  }
  delete media.__use__; // one per weapon: those live in `weapons`
  return { weapons, media };
}

module.exports = { extractKirkaAssets, buildDecoder, matchBracket, calc, readString };
