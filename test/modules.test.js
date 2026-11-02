"use strict";

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { RemoteModules, verifyList, compareVersions } = require("../src/main/modules");

const keys = crypto.generateKeyPairSync("ed25519");
const PUBLIC = keys.publicKey.export({ type: "spki", format: "pem" });
const other = crypto.generateKeyPairSync("ed25519");

const CODE = "console.log('csl');";
const SHA = crypto.createHash("sha256").update(CODE).digest("hex");

function signed(manifest, key = keys.privateKey) {
  const text = JSON.stringify(manifest);
  return JSON.stringify({ manifiesto: text, firma: crypto.sign(null, Buffer.from(text), key).toString("base64") });
}

const mod = (extra = {}) => ({ id: "custom-skin-link", nombre: "Custom Skin Link", version: "4.0.1", archivo: "modulos/custom-skin-link/4.0.1.js", sha256: SHA, activo: true, ...extra });

// A fake GitHub: the list (with ETag) and the module files.
function server() {
  const s = { list: null, files: { "modulos/custom-skin-link/4.0.1.js": CODE }, calls: [], down: false };
  s.fetch = async (url, init = {}) => {
    s.calls.push(url);
    if (s.down) throw new Error("offline");
    const res = (status, body = "", headers = {}) => ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (k) => headers[k.toLowerCase()] || null },
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    });
    if (url.includes("modulos.json")) {
      if (s.list === null) return res(404);
      const etag = `"${crypto.createHash("md5").update(s.list).digest("hex")}"`;
      if (init.headers?.["If-None-Match"] === etag) return res(304);
      return res(200, s.list, { etag });
    }
    const file = Object.keys(s.files).find((f) => url.endsWith(f));
    return file ? res(200, s.files[file]) : res(404);
  };
  return s;
}

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-mod-"));
  const srv = server();
  let now = 1_000_000;
  const changes = [];
  const make = () => new RemoteModules({ dir, fetch: srv.fetch, publicKey: PUBLIC, clientVersion: opts.version || "0.1.0-beta.27", onChange: () => changes.push(1), now: () => now });
  return { dir, srv, make, changes, tick: (ms) => (now += ms) };
}

const base = { remoteModules: true, remoteModulesOff: [], tournamentMode: false };

test("only a list signed with RITE's key is accepted", () => {
  assert.ok(verifyList(signed({ secuencia: 1, modulos: [mod()] }), PUBLIC));
  assert.strictEqual(verifyList(signed({ secuencia: 1, modulos: [mod()] }, other.privateKey), PUBLIC), null);
  const tampered = JSON.parse(signed({ secuencia: 1, modulos: [mod()] }));
  tampered.manifiesto = tampered.manifiesto.replace("4.0.1", "4.0.2");
  assert.strictEqual(verifyList(JSON.stringify(tampered), PUBLIC), null);
  assert.strictEqual(verifyList(signed({ secuencia: 1, modulos: [mod()] }), ""), null);
});

test("an active module is downloaded and runs; the author's switch takes it away on the next load", async () => {
  const { srv, make, tick } = setup();
  srv.list = signed({ secuencia: 1, modulos: [mod()] });
  const m = make();
  await m.fresh();
  assert.deepStrictEqual(m.scripts(base).scripts.map((s) => s.code), [CODE]);

  srv.list = signed({ secuencia: 2, modulos: [mod({ activo: false })] });
  tick(5000);
  await m.fresh();
  assert.deepStrictEqual(m.scripts(base).scripts, []);
  assert.deepStrictEqual(m.list(base), []);

  srv.list = signed({ secuencia: 3, modulos: [mod()] });
  tick(5000);
  await m.fresh();
  assert.strictEqual(m.scripts(base).scripts.length, 1);
});

test("the player, the master switch and tournament mode turn modules off", async () => {
  const { srv, make } = setup();
  srv.list = signed({ secuencia: 1, modulos: [mod()] });
  const m = make();
  await m.refresh();
  assert.strictEqual(m.scripts({ ...base, remoteModulesOff: ["custom-skin-link"] }).scripts.length, 0);
  assert.strictEqual(m.list({ ...base, remoteModulesOff: ["custom-skin-link"] })[0].enabled, false);
  assert.strictEqual(m.scripts({ ...base, remoteModules: false }).scripts.length, 0);
  assert.strictEqual(m.scripts({ ...base, tournamentMode: true }).scripts.length, 0);
});

test("an older signed list is refused, and a bad file is never run", async () => {
  const { srv, make, tick } = setup();
  srv.list = signed({ secuencia: 5, modulos: [mod()] });
  const m = make();
  await m.refresh();
  srv.list = signed({ secuencia: 4, modulos: [mod({ activo: false })] });
  tick(5000);
  await m.refresh();
  assert.strictEqual(m.scripts(base).scripts.length, 1);
  assert.match(m.status().error, /vieja/);

  const { srv: srv2, make: make2 } = setup();
  srv2.files["modulos/custom-skin-link/4.0.1.js"] = "alert('otro código')";
  srv2.list = signed({ secuencia: 1, modulos: [mod()] });
  const m2 = make2();
  await m2.refresh();
  assert.strictEqual(m2.scripts(base).scripts.length, 0);
});

test("offline, the last verified list and files are used", async () => {
  const { srv, make, tick } = setup();
  srv.list = signed({ secuencia: 1, modulos: [mod()] });
  await make().refresh();
  srv.down = true;
  const m = make();
  tick(5000);
  await m.fresh();
  assert.strictEqual(m.scripts(base).scripts.length, 1);
});

test("a module can replace a local userscript and can ask for a newer client", async () => {
  const { srv, make } = setup({ version: "0.1.0-beta.26" });
  srv.list = signed({ secuencia: 1, modulos: [mod({ reemplaza: ["CustomSkinLink.js"] })] });
  const m = make();
  await m.refresh();
  assert.deepStrictEqual(m.scripts(base).replaces, ["CustomSkinLink.js"]);

  srv.list = signed({ secuencia: 2, modulos: [mod({ minClient: "0.1.0-beta.27" })] });
  await m.refresh();
  assert.strictEqual(m.scripts(base).scripts.length, 0);
  assert.strictEqual(m.list(base)[0].compatible, false);
});

test("a refresh before a page load doesn't ask the player to refresh again", async () => {
  const { srv, make, changes, tick } = setup();
  srv.list = signed({ secuencia: 1, modulos: [mod()] });
  const m = make();
  await m.fresh();
  assert.strictEqual(changes.length, 0);
  srv.list = signed({ secuencia: 2, modulos: [mod({ activo: false })] });
  tick(5000);
  await m.refresh();
  assert.strictEqual(changes.length, 1);
});

test("without a public key nothing is asked", async () => {
  const { srv, dir } = setup();
  const m = new RemoteModules({ dir, fetch: srv.fetch, publicKey: "", clientVersion: "1.0.0" });
  await m.fresh();
  assert.strictEqual(srv.calls.length, 0);
  assert.deepStrictEqual(m.scripts(base).scripts, []);
});

test("versions compare like releases and betas", () => {
  assert.strictEqual(compareVersions("0.1.0-beta.27", "0.1.0-beta.26"), 1);
  assert.strictEqual(compareVersions("0.1.0-beta.9", "0.1.0-beta.10"), -1);
  assert.strictEqual(compareVersions("0.1.0", "0.1.0-beta.30"), 1);
  assert.strictEqual(compareVersions("0.2.0-beta.1", "0.1.0"), 1);
  assert.strictEqual(compareVersions("0.1.0", "0.1.0"), 0);
});
