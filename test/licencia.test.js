"use strict";

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Licencia, verifyEntry, normalizeCode } = require("../src/main/licencia");

const keys = crypto.generateKeyPairSync("ed25519");
const PUBLIC = keys.publicKey.export({ type: "spki", format: "pem" });
const other = crypto.generateKeyPairSync("ed25519");

const CODE = "console.log('grabador');";
const SHA = crypto.createHash("sha256").update(CODE).digest("hex");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// A signed entry, as the panel publishes it and the server hands it out.
function entry(extra = {}, { key = keys.privateKey, wrap = {} } = {}) {
  const e = { id: "grabador", version: "1.0.0", nombre: "Grabador RITE", tipo: "utilidad", sha256: SHA, ...extra };
  const entrada = JSON.stringify(e);
  return { id: e.id, version: e.version, entrada, firma: crypto.sign(null, Buffer.from(entrada), key).toString("base64"), sha256: e.sha256, activo: true, archivo: `/archivo/${e.id}/${e.version}.js`, ...wrap };
}

// A fake license server.
function server() {
  const s = { licenses: { "RITE-AAAA-BBBB-CCCC": { pc: null, active: true } }, passes: {}, modules: [entry()], files: { "grabador/1.0.0": CODE }, calls: [], down: false, rotate: "" };
  s.fetch = async (url, init = {}) => {
    s.calls.push(url);
    if (s.down) throw new Error("offline");
    const res = (status, body, headers = {}) => ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (k) => headers[k.toLowerCase()] || null },
      text: async () => body,
      json: async () => JSON.parse(body),
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    });
    const u = new URL(url);
    const huella = init.headers["X-RITE-Huella"];
    if (u.pathname === "/activar") {
      const { codigo } = JSON.parse(init.body);
      const lic = s.licenses[codigo];
      if (!lic) return res(403, JSON.stringify({ error: "licencia-invalida" }));
      if (!lic.active) return res(403, JSON.stringify({ error: "revocada" }));
      if (lic.pc && lic.pc !== huella) return res(403, JSON.stringify({ error: "otra-pc" }));
      lic.pc = huella;
      const pase = "pase_" + crypto.randomBytes(16).toString("hex");
      s.passes[pase] = codigo;
      return res(200, JSON.stringify({ pase, nombre: "Admin de prueba", modulos: ["*"] }));
    }
    const pase = (init.headers.Authorization || "").slice(7);
    const codigo = s.passes[pase];
    const lic = s.licenses[codigo];
    if (!lic) return res(401, JSON.stringify({ error: "pase-invalido" }));
    if (lic.pc !== huella) return res(403, JSON.stringify({ error: "otra-pc" }));
    if (!lic.active) return res(403, JSON.stringify({ error: "revocada" }));
    if (u.pathname === "/modulos") {
      const body = JSON.stringify({ licencia: { nombre: "Admin de prueba", modulos: ["*"] }, modulos: s.modules });
      const etag = `"${sha(body).slice(0, 16)}"`;
      const headers = { etag };
      if (s.rotate) {
        headers["x-rite-pase"] = s.rotate;
        s.passes[s.rotate] = codigo;
        delete s.passes[pase];
      }
      if (init.headers["If-None-Match"] === etag) return res(304, "", headers);
      return res(200, body, headers);
    }
    const m = /^\/archivo\/([^/]+)\/(.+)\.js$/.exec(u.pathname);
    if (m && s.files[`${m[1]}/${m[2]}`] !== undefined) return res(200, s.files[`${m[1]}/${m[2]}`]);
    return res(404, JSON.stringify({ error: "no-existe" }));
  };
  return s;
}

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-lic-"));
  const srv = server();
  let now = 1_000_000;
  const changes = [];
  const make = (extra = {}) =>
    new Licencia({ dir, fetch: srv.fetch, publicKey: PUBLIC, clientVersion: opts.version || "0.1.0-beta.31", server: "https://lic.test", machineId: async () => opts.pc || "PC-1", onChange: () => changes.push(1), now: () => now, ...extra });
  return { dir, srv, make, changes, tick: (ms) => (now += ms) };
}

const base = { remoteModules: true, remoteModulesOff: [], tournamentMode: false };

test("only an entry signed with RITE's key, matching the server's id and version, is accepted", () => {
  assert.ok(verifyEntry(entry(), PUBLIC));
  assert.strictEqual(verifyEntry(entry({}, { key: other.privateKey }), PUBLIC), null);
  assert.strictEqual(verifyEntry(entry({}, { wrap: { version: "9.9.9" } }), PUBLIC), null);
  const tampered = entry();
  tampered.entrada = tampered.entrada.replace("1.0.0", "1.0.1");
  tampered.version = "1.0.1";
  assert.strictEqual(verifyEntry(tampered, PUBLIC), null);
  assert.strictEqual(verifyEntry(entry(), ""), null);
  assert.strictEqual(normalizeCode(" rite-aaaa bbbb-cccc "), "RITE-AAAABBBB-CCCC");
});

test("a code ties the license to this PC and its modules run; the same code on another PC is refused", async () => {
  const { srv, make } = setup();
  const lic = make();
  assert.strictEqual(lic.active, false);
  const r = await lic.activar("rite-aaaa-bbbb-cccc");
  assert.deepStrictEqual([r.ok, r.nombre], [true, "Admin de prueba"]);
  assert.strictEqual(lic.active, true);
  assert.deepStrictEqual(lic.scripts(base).scripts.map((s) => [s.code, s.module]), [[CODE, "grabador"]]);
  assert.strictEqual(lic.list(base)[0].privado, true);
  assert.strictEqual(lic.status().nombre, "Admin de prueba");

  const { make: makeOther } = { make: (o) => new Licencia({ ...o }) };
  const otherPc = makeOther({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "rite-lic2-")), fetch: srv.fetch, publicKey: PUBLIC, clientVersion: "1.0.0", server: "https://lic.test", machineId: async () => "PC-2" });
  const r2 = await otherPc.activar("RITE-AAAA-BBBB-CCCC");
  assert.deepStrictEqual([r2.ok, r2.error], [false, "otra-pc"]);
  assert.match(r2.message, /otra PC/);
  assert.strictEqual((await otherPc.activar("RITE-NOEX-ISTE-0000")).error, "licencia-invalida");
});

test("the license survives a restart, uses the ETag and keeps a renewed pass", async () => {
  const { srv, make, tick } = setup();
  await make().activar("RITE-AAAA-BBBB-CCCC");
  const lic = make();
  assert.strictEqual(lic.active, true);
  assert.strictEqual(lic.scripts(base).scripts.length, 1);
  tick(5000);
  srv.calls.length = 0;
  await lic.fresh();
  assert.strictEqual(srv.calls.filter((u) => u.endsWith("/modulos")).length, 1);
  assert.strictEqual(lic.status().error, "");

  srv.rotate = "pase_nuevo_0123456789abcdef";
  tick(5000);
  await lic.refresh();
  srv.rotate = "";
  tick(5000);
  await lic.refresh();
  assert.strictEqual(lic.status().error, "");
  assert.strictEqual(make().state.pase, "pase_nuevo_0123456789abcdef");
});

test("a revoked license is cut on the next load; a tampered or unsigned module never runs", async () => {
  const { srv, make, tick, changes } = setup();
  const lic = make();
  await lic.activar("RITE-AAAA-BBBB-CCCC");
  srv.licenses["RITE-AAAA-BBBB-CCCC"].active = false;
  tick(5000);
  await lic.fresh();
  assert.strictEqual(lic.active, false);
  assert.deepStrictEqual(lic.scripts(base).scripts, []);
  assert.strictEqual(lic.status().error, "revocada");
  assert.ok(changes.length >= 1);
  assert.ok(!fs.existsSync(path.join(lic.dir, "licencia.json")));
  assert.ok(!fs.existsSync(path.join(lic.dir, "grabador@1.0.0.js")));

  const { srv: srv2, make: make2 } = setup();
  srv2.modules = [entry({}, { key: other.privateKey }), entry({ id: "otro", version: "2.0.0", sha256: SHA })];
  srv2.files["otro/2.0.0"] = "alert('otro código')";
  const lic2 = make2();
  await lic2.activar("RITE-AAAA-BBBB-CCCC");
  assert.deepStrictEqual(lic2.scripts(base).scripts, []);
  assert.deepStrictEqual(lic2.list(base).map((m) => m.id), ["otro"]);
});

test("the author's switch, the player's switch, the master switch and tournament mode", async () => {
  const { srv, make, tick } = setup();
  const lic = make();
  await lic.activar("RITE-AAAA-BBBB-CCCC");
  assert.strictEqual(lic.scripts({ ...base, remoteModulesOff: ["grabador"] }).scripts.length, 0);
  assert.strictEqual(lic.scripts({ ...base, remoteModules: false }).scripts.length, 0);
  assert.strictEqual(lic.scripts({ ...base, tournamentMode: true }).scripts.length, 0);
  srv.modules = [entry({}, { wrap: { activo: false } })];
  tick(5000);
  await lic.fresh();
  assert.strictEqual(lic.scripts(base).scripts.length, 0);
  assert.deepStrictEqual(lic.list(base), []);
});

test("offline, the last copy runs for a day and then pauses", async () => {
  const { srv, make, tick } = setup();
  const lic = make();
  await lic.activar("RITE-AAAA-BBBB-CCCC");
  srv.down = true;
  tick(5000);
  await lic.fresh();
  assert.strictEqual(lic.scripts(base).scripts.length, 1);
  assert.strictEqual(lic.active, true);
  tick(25 * 60 * 60 * 1000);
  await lic.fresh();
  assert.strictEqual(lic.scripts(base).scripts.length, 0);
  assert.strictEqual(lic.status().enGracia, true);
  srv.down = false;
  tick(5000);
  await lic.fresh();
  assert.strictEqual(lic.scripts(base).scripts.length, 1);
});

test("the player can remove the license from this PC; without a key nothing is asked", async () => {
  const { srv, make } = setup();
  const lic = make();
  await lic.activar("RITE-AAAA-BBBB-CCCC");
  lic.quitar();
  assert.strictEqual(lic.active, false);
  assert.deepStrictEqual(lic.list(base), []);
  assert.strictEqual(make().active, false);

  srv.calls.length = 0;
  const none = make({ publicKey: "" });
  assert.strictEqual((await none.activar("RITE-AAAA-BBBB-CCCC")).ok, false);
  await none.fresh();
  assert.strictEqual(srv.calls.length, 0);
});
