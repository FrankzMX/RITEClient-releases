"use strict";

// Helpers shared by the RITE modules (src/main/licencia.js is where they are
// downloaded): the shape of a module entry and how client versions compare.
// Every module lives on RITE's server; none is published on GitHub.

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const SHA = /^[0-9a-f]{64}$/;
const TYPES = ["visual", "utilidad", "info"];
const SAFE_NAME = /^(?!\.)[^\\/:*?"<>|\x00-\x1f]{1,120}\.js$/i;
const MAX_FILE = 2 * 1024 * 1024;

const text = (value, max) => (typeof value === "string" ? value.replace(/[\x00-\x1f]/g, " ").trim().slice(0, max) : "");

// Compares "0.1.0-beta.26" style versions: -1, 0 or 1. A release is newer than
// its own betas.
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = ""] = String(v || "0").split("-", 2);
    return { core: core.split(".").map((n) => Number(n) || 0), pre: pre ? pre.split(".") : [] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] || 0) - (y.core[i] || 0);
    if (d) return Math.sign(d);
  }
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const np = /^\d+$/.test(p);
    const nq = /^\d+$/.test(q);
    if (np && nq && Number(p) !== Number(q)) return Math.sign(Number(p) - Number(q));
    if (np !== nq) return np ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

// One module entry (the signed `entrada` the author publishes), checked and
// trimmed, or null. The client builds the file's address from id and version.
function cleanModule(m) {
  if (!m || !ID.test(m.id) || !VERSION.test(m.version) || !SHA.test(m.sha256)) return null;
  return {
    id: m.id,
    nombre: text(m.nombre, 60) || m.id,
    descripcion: text(m.descripcion, 200),
    cambios: text(m.cambios, 300),
    autor: text(m.autor, 60),
    version: m.version,
    tipo: TYPES.includes(m.tipo) ? m.tipo : "visual",
    minClient: typeof m.minClient === "string" && VERSION.test(m.minClient) ? m.minClient : "",
    sha256: m.sha256,
    activo: m.activo === true,
    reemplaza: Array.isArray(m.reemplaza) ? m.reemplaza.filter((n) => typeof n === "string" && SAFE_NAME.test(n)).slice(0, 10) : [],
  };
}

module.exports = { cleanModule, compareVersions, MAX_FILE };
