"use strict";

// RITE Panel: a local page (only on this PC) to run the author's chores with
// buttons instead of commands:
//   - RITE modules (all on the license server, scripts/licencias.js): list,
//     turn on/off, open to every client or keep for licenses only, publish a
//     new version, remove;
//   - saved module versions: a folder (Documentos/RITEClient/modulos) where
//     every version is kept, to open, pick from and publish again;
//   - licenses: create, revoke, free and delete;
//   - the client: update the repo and publish a signed version.
//
//   npm run panel        (or double-click scripts/RITE-Panel.bat)
//
// It only listens on 127.0.0.1 and every request needs the random token that is
// in the address it opens, so web pages can't use it. Each action runs the same
// commands as by hand (scripts/licencias.js, scripts/publicar.js, git) and shows
// their output.

const { spawn, execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const token = crypto.randomBytes(24).toString("hex");
const win = process.platform === "win32";

// One action at a time; its output is kept for the page to read.
let job = null;
function startJob(title, steps) {
  if (job && !job.done) return false;
  job = { id: crypto.randomUUID(), title, log: "", done: false, code: null };
  const current = job;
  (async () => {
    for (const [cmd, args] of steps) {
      current.log += `\n> ${cmd} ${args.join(" ")}\n`;
      const code = await new Promise((resolve) => {
        const quote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
        // npm is a .cmd on Windows and needs a shell: one quoted command line (Node 24
        // warns about passing arguments next to shell: true).
        const viaShell = win && cmd === "npm";
        const env = { ...process.env, FORCE_COLOR: "0" };
        const child = viaShell ? spawn([cmd, ...args.map(quote)].join(" "), { cwd: root, shell: true, env }) : spawn(cmd, args, { cwd: root, env });
        child.stdout.on("data", (d) => (current.log += d));
        child.stderr.on("data", (d) => (current.log += d));
        child.on("error", (e) => {
          current.log += `${e.message}\n`;
          resolve(1);
        });
        child.on("close", resolve);
      });
      if (code !== 0) {
        current.code = code;
        current.done = true;
        current.log += `\n✖ Terminó con error (${code}).\n`;
        return;
      }
    }
    current.code = 0;
    current.done = true;
    current.log += "\n✔ Listo.\n";
  })();
  return true;
}

const node = (script, ...args) => [process.execPath, [path.join("scripts", script), ...args]];
const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

function status() {
  let key = "";
  try {
    delete require.cache[require.resolve("../src/main/modules-key")];
    key = require("../src/main/modules-key").PUBLIC_KEY;
  } catch {}
  const privateKey = fs.existsSync(path.join(os.homedir(), ".rite-modulos", "llave-privada.pem"));
  const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = sh("git", ["status", "--porcelain"]);
  const tags = releaseTags();
  const lastTag = tags.at(-1) || "";
  return {
    publicKey: Boolean(key),
    privateKey,
    gh: sh("gh", ["auth", "status"]) !== null,
    branch,
    dirty: Boolean(dirty),
    lastTag,
    nextTag: nextTag(lastTag),
    windows: win,
  };
}

// Version tags as GitHub has them (the local ones can be behind), oldest first.
function releaseTags() {
  const remote = sh("git", ["ls-remote", "--tags", "origin"]);
  const source = remote !== null ? remote : sh("git", ["tag", "-l", "v*"]) || "";
  const tags = [...new Set([...source.matchAll(/(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?:\^\{\})?$/gm)].map((m) => m[1]))];
  const key = (t) => {
    const m = /^v(\d+)\.(\d+)\.(\d+)(?:-[A-Za-z]+\.?(\d+))?/.exec(t);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])] : [0, 0, 0, 0];
  };
  return tags.sort((a, b) => {
    const x = key(a), y = key(b);
    for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  });
}

// v0.1.0-beta.26 → v0.1.0-beta.27; v0.2.0 → v0.2.1.
function nextTag(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z]+)\.(\d+))?$/.exec(tag || "");
  if (!m) return "";
  return m[4] ? `v${m[1]}.${m[2]}.${m[3]}-${m[4]}.${Number(m[5]) + 1}` : `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

// Asks the license server through scripts/licencias.js (signed with this PC's key).
function serverRead(cmd) {
  const out = execFileSync(process.execPath, [path.join("scripts", "licencias.js"), cmd, "--json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 });
  const line = out.trim().split("\n").pop();
  return line.startsWith("{") ? JSON.parse(line) : {};
}

// The modules as the server has them: the signed entry (name, type, changes…)
// plus what the server decides (on/off, open to everyone or licenses only).
function modules() {
  try {
    const list = (serverRead("modulos").modulos || []).map((m) => {
      let e = {};
      try {
        e = JSON.parse(m.entrada);
      } catch {}
      return { id: m.id, version: m.version, sha256: m.sha256, activo: m.activo, abierto: m.abierto, publicado: m.publicado, tamano: m.tamano, nombre: e.nombre || m.id, tipo: e.tipo || "", cambios: e.cambios || "", descripcion: e.descripcion || "" };
    });
    return { ok: true, modulos: list };
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message).trim().slice(0, 500) };
  }
}

// RITE Bench: what players who agreed to share sent, grouped by graphics card and settings.
function rendimiento() {
  try {
    return { ok: true, grupos: serverRead("rendimiento").grupos || [] };
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message).trim().slice(0, 500) };
  }
}

// Licenses, as the license server has them.
function licencias() {
  try {
    return { ok: true, licencias: serverRead("lista").licencias || [] };
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message).trim().slice(0, 500) };
  }
}

// The player's Documents folder (Windows moves it, e.g. to OneDrive).
function documentsDir() {
  if (win) {
    const dir = sh("powershell", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('MyDocuments')"]);
    if (dir) return dir;
  }
  return path.join(os.homedir(), "Documents");
}
const VERSIONS_DIR = path.join(documentsDir(), "RITEClient", "modulos");

function header(code) {
  const meta = {};
  const block = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/.exec(code);
  for (const line of block ? block[1].split("\n") : []) {
    const m = /\/\/\s*@(\w+)\s+(.+)/.exec(line);
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

const slug = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

// Every .js in the versions folder (and one level of subfolders), with the
// module it belongs to: its subfolder, else the published module with the
// same @name, else its @name as an id.
function savedVersions(published) {
  const byName = new Map(published.map((m) => [String(m.nombre || "").toLowerCase(), m.id]));
  const files = [];
  const add = (file, folderId) => {
    let data;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return;
      data = fs.readFileSync(file);
    } catch {
      return;
    }
    const meta = header(data.toString("utf8"));
    const id = folderId || byName.get(String(meta.name || "").toLowerCase()) || slug(meta.name || path.basename(file, ".js"));
    const version = String(meta.version || "").split(/\s/)[0] || "";
    files.push({ path: file, file: path.relative(VERSIONS_DIR, file), id, version, name: meta.name || "", sha256: sha256(data), modified: fs.statSync(file).mtimeMs });
  };
  let entries = [];
  try {
    fs.mkdirSync(VERSIONS_DIR, { recursive: true });
    entries = fs.readdirSync(VERSIONS_DIR, { withFileTypes: true });
  } catch {}
  // Subfolders first: their names also tell which module a loose file is.
  for (const e of entries) {
    if (!e.isDirectory() || !ID.test(e.name)) continue;
    for (const f of fs.readdirSync(path.join(VERSIONS_DIR, e.name))) if (f.toLowerCase().endsWith(".js")) add(path.join(VERSIONS_DIR, e.name, f), e.name);
  }
  for (const f of files) if (f.name && !byName.has(f.name.toLowerCase())) byName.set(f.name.toLowerCase(), f.id);
  for (const e of entries) if (e.isFile() && e.name.toLowerCase().endsWith(".js")) add(path.join(VERSIONS_DIR, e.name), "");
  return files;
}

// Keeps a copy of a published file as modulos/<id>/<id>-<version>.js.
function keepCopy(id, version, data) {
  if (!ID.test(id) || !VERSION.test(version)) return;
  const dir = path.join(VERSIONS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}-${version}.js`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, data);
}

// Downloads the current version of every published module (the server keeps
// only the current one) into the versions folder.
function fetchPublished() {
  const list = modules();
  if (!list.ok) throw new Error(list.error);
  let count = 0;
  for (const m of list.modulos) {
    if (!ID.test(m.id) || !VERSION.test(m.version)) continue;
    const target = path.join(VERSIONS_DIR, m.id, `${m.id}-${m.version}.js`);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    execFileSync(process.execPath, [path.join("scripts", "licencias.js"), "codigo", m.id, "--salida", target], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
    count++;
  }
  return count;
}

function openFolder() {
  fs.mkdirSync(VERSIONS_DIR, { recursive: true });
  const opener = win ? ["explorer", [VERSIONS_DIR]] : process.platform === "darwin" ? ["open", [VERSIONS_DIR]] : ["xdg-open", [VERSIONS_DIR]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

const PUBLIC_REPO = "FrankzMX/RITEClient-releases";
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const TAG = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const LIC = /^lic_[a-z0-9]{10}$/;
const clean = (v, max = 300) => String(v || "").replace(/[\x00-\x1f]/g, " ").trim().slice(0, max);

function action(body) {
  const { type } = body;
  if (["prender", "apagar", "abrir", "cerrar", "quitar"].includes(type)) {
    if (!ID.test(body.id)) return "Id no válido.";
    return startJob(`${type} ${body.id}`, [node("licencias.js", type, body.id)]) || "Hay otra acción corriendo.";
  }
  // Licenses (scripts/licencias.js): the code of a new one shows in the output, once.
  if (type === "lic-crear") {
    const nombre = clean(body.nombre, 60);
    if (!nombre) return "Dime para quién es la licencia.";
    const args = ["crear", "--nombre", nombre, "--modulos", clean(body.modulos, 500) || "*"];
    if (clean(body.nota, 200)) args.push("--nota", clean(body.nota, 200));
    return startJob(`crear licencia para ${nombre}`, [node("licencias.js", ...args)]) || "Hay otra acción corriendo.";
  }
  if (["lic-revocar", "lic-reactivar", "lic-liberar", "lic-borrar"].includes(type)) {
    if (!LIC.test(body.id)) return "Id de licencia no válido.";
    return startJob(`${type.slice(4)} licencia ${body.id}`, [node("licencias.js", type.slice(4), body.id)]) || "Hay otra acción corriendo.";
  }
  if (type === "publicar-modulo") {
    const name = path.basename(clean(body.fileName, 120));
    if (!/\.js$/i.test(name) || typeof body.code !== "string" || !body.code.length || body.code.length > 2 * 1024 * 1024) return "Elige un archivo .js (máx. 2 MB).";
    if (body.id && !ID.test(body.id)) return "Id no válido: minúsculas, números y guiones.";
    if (body.version && !VERSION.test(body.version)) return "Versión no válida.";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-panel-"));
    const file = path.join(dir, name);
    fs.writeFileSync(file, body.code);
    // A copy stays in the versions folder, to pick it again later.
    const meta = header(body.code);
    const keepId = clean(body.id) || (modules().modulos || []).find((m) => String(m.nombre).toLowerCase() === String(meta.name || "").toLowerCase())?.id || slug(meta.name || name.replace(/\.js$/i, ""));
    try {
      keepCopy(keepId, clean(body.version) || String(meta.version || "").split(/\s/)[0], body.code);
    } catch {}
    const args = ["publicar", file];
    for (const k of ["id", "version", "nombre", "descripcion", "cambios", "reemplaza", "tipo"]) if (clean(body[k])) args.push(`--${k}`, clean(body[k]));
    if (body.apagado) args.push("--apagado");
    // Open to every client; without it a new module is for licenses only and
    // a republished one keeps what it had.
    if (body.abierto) args.push("--abierto");
    return startJob(`publicar módulo ${name}`, [node("licencias.js", ...args)]) || "Hay otra acción corriendo.";
  }
  if (type === "publicar-guardada") {
    const file = path.resolve(VERSIONS_DIR, String(body.file || ""));
    if (!file.startsWith(VERSIONS_DIR + path.sep) || !file.toLowerCase().endsWith(".js") || !fs.existsSync(file)) return "No encuentro ese archivo en la carpeta de versiones.";
    if (!ID.test(body.id || "")) return "Id no válido.";
    if (!VERSION.test(body.version || "")) return "Ese archivo no dice su versión (@version). Publícalo con el formulario.";
    const extra = clean(body.cambios) ? ["--cambios", clean(body.cambios)] : [];
    if (body.abierto) extra.push("--abierto");
    if (["visual", "utilidad", "info"].includes(body.tipo)) extra.push("--tipo", body.tipo);
    return startJob(`publicar ${body.id} ${body.version}`, [node("licencias.js", "publicar", file, "--id", body.id, "--version", body.version, ...extra)]) || "Hay otra acción corriendo.";
  }
  if (type === "abrir-carpeta") {
    openFolder();
    return true;
  }
  if (type === "llave") return startJob("crear llave", [node("licencias.js", "llave")]) || "Hay otra acción corriendo.";
  // The old public branch of modules (clients up to 0.1.0-beta.31 read it).
  if (type === "borrar-rama-github") return startJob("borrar la rama pública modulos", [["gh", ["api", "-X", "DELETE", `repos/${PUBLIC_REPO}/git/refs/heads/modulos`]]]) || "Hay otra acción corriendo.";
  if (type === "actualizar-repo") {
    return startJob("actualizar repo", [["git", ["checkout", "main"]], ["git", ["pull", "origin", "main"]], ["git", ["fetch", "--tags"]], ["npm", ["install", "--no-audit", "--no-fund"]]]) || "Hay otra acción corriendo.";
  }
  if (type === "publicar-cliente") {
    if (!TAG.test(body.tag || "")) return "Versión no válida (ej. v0.1.0-beta.27).";
    if (releaseTags().includes(body.tag)) return `La versión ${body.tag} ya existe. Usa la siguiente.`;
    return startJob(`publicar cliente ${body.tag}`, [node("publicar.js", body.tag)]) || "Hay otra acción corriendo.";
  }
  return "Acción desconocida.";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 3 * 1024 * 1024) reject(new Error("too big"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  // Only this PC, only with the token, and never from another site.
  const host = req.headers.host || "";
  if (!/^127\.0\.0\.1:\d+$/.test(host)) return send(403, { error: "host" });
  if (url.searchParams.get("t") !== token && req.headers["x-token"] !== token) return send(403, { error: "token" });
  if (req.method === "POST" && req.headers.origin !== `http://${host}`) return send(403, { error: "origin" });

  try {
    if (req.method === "GET" && url.pathname === "/") return send(200, PAGE.replace("__TOKEN__", token), "text/html");
    if (req.method === "GET" && url.pathname === "/api/estado") return send(200, status());
    if (req.method === "GET" && url.pathname === "/api/modulos") return send(200, modules());
    if (req.method === "GET" && url.pathname === "/api/licencias") return send(200, licencias());
    if (req.method === "GET" && url.pathname === "/api/rendimiento") return send(200, rendimiento());
    if (req.method === "GET" && url.pathname === "/api/versiones") {
      const list = modules();
      return send(200, { dir: VERSIONS_DIR, files: savedVersions(list.ok ? list.modulos : []), published: list.ok ? list.modulos.map((m) => ({ id: m.id, version: m.version, sha256: m.sha256 })) : [] });
    }
    if (req.method === "POST" && url.pathname === "/api/traer-publicadas") {
      return send(200, { ok: true, count: fetchPublished() });
    }
    if (req.method === "GET" && url.pathname === "/api/job") return send(200, job || {});
    if (req.method === "POST" && url.pathname === "/api/accion") {
      const result = action(JSON.parse(await readBody(req)));
      return send(200, result === true ? { ok: true } : { ok: false, error: result });
    }
    send(404, { error: "no existe" });
  } catch (error) {
    send(500, { error: error.message });
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = `http://127.0.0.1:${server.address().port}/?t=${token}`;
  console.log(`RITE Panel abierto en ${address}`);
  console.log("Deja esta ventana abierta mientras lo usas. Ciérrala para apagar el panel.");
  const opener = win ? ["cmd", ["/c", "start", "", address]] : process.platform === "darwin" ? ["open", [address]] : ["xdg-open", [address]];
  if (!process.env.RITE_PANEL_NO_OPEN) spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
});

const PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RITE Panel</title>
<style>
  :root { --bg:#0e0f13; --card:#171920; --line:#272a35; --text:#e8e9ee; --dim:#9aa0b0; --accent:#e0303f; --ok:#3ddc84; --warn:#f3d48a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.45 system-ui, "Segoe UI", sans-serif; }
  main { max-width:960px; margin:0 auto; padding:24px 16px 60px; }
  h1 { font-size:22px; margin:0 0 4px; } h1 span { color:var(--accent); }
  h2 { font-size:16px; margin:0 0 12px; }
  .sub { color:var(--dim); margin:0 0 20px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { padding:4px 10px; border-radius:999px; border:1px solid var(--line); color:var(--dim); }
  .chip.ok { color:var(--ok); border-color:#245c3c; } .chip.bad { color:var(--accent); border-color:#5c2430; } .chip.warn { color:var(--warn); border-color:#5c5024; }
  table { width:100%; border-collapse:collapse; }
  td, th { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:middle; }
  th { color:var(--dim); font-weight:500; font-size:12px; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; background:#555; margin-right:6px; } .dot.on { background:var(--ok); }
  button { background:#262a36; color:var(--text); border:1px solid #363b4a; border-radius:7px; padding:7px 12px; font:inherit; cursor:pointer; }
  button:hover { border-color:#596078; } button.main { background:var(--accent); border-color:var(--accent); color:#fff; } button.danger { color:#ff8a94; }
  button:disabled { opacity:.5; cursor:default; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; }
  label { display:flex; flex-direction:column; gap:4px; color:var(--dim); font-size:12px; }
  input, select { background:#0f1117; color:var(--text); border:1px solid var(--line); border-radius:7px; padding:7px 9px; font:inherit; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; }
  .check { flex-direction:row; align-items:center; gap:6px; font-size:14px; color:var(--text); }
  pre { background:#08090c; border:1px solid var(--line); border-radius:8px; padding:12px; max-height:360px; overflow:auto; white-space:pre-wrap; font:12px/1.4 Consolas, monospace; margin:0; }
  .hint { color:var(--dim); font-size:12px; margin:8px 0 0; }
  .empty { color:var(--dim); padding:8px 0; }
  .mod { border-top:1px solid var(--line); padding:12px 0; } .mod:first-child { border-top:0; }
  .mod-head { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .mod-head b { font-size:15px; } .grow { flex:1; }
  .badge { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid #245c3c; color:var(--ok); }
  .old { margin:8px 0 0 0; } .old td { font-size:13px; }
</style>
</head>
<body>
<main>
  <h1><span>RITE</span> Panel</h1>
  <p class="sub">Módulos y versiones del cliente, sin comandos. Solo funciona en esta PC.</p>

  <section><h2>Estado</h2><div class="chips" id="estado">Revisando…</div><div class="row" id="estado-acciones"></div></section>

  <section>
    <h2>Módulos RITE</h2>
    <div id="modulos" class="empty">Cargando…</div>
    <p class="hint">Todos viven en el servidor de licencias, ninguno en GitHub. «Para todos» le llega a cualquier cliente RITE; «con licencia» solo a las licencias que lo abren. Prender, apagar, abrir o cerrar se ve en el siguiente F5 de cada jugador. Lo que publicas sale sin comentarios y minificado; tu fuente queda en la carpeta de versiones.</p>
    <div class="row"><button id="m-borrar-rama">Borrar la rama pública de GitHub</button></div>
    <p class="hint">Borra la rama «modulos» de RITEClient-releases, donde antes se publicaban. Los clientes viejos (hasta la beta.31) todavía leen de ahí: cuando la borres, se quedan sin módulos hasta que actualicen.</p>
  </section>

  <section>
    <h2>Licencias</h2>
    <div id="licencias" class="empty">Cargando…</div>
    <div class="grid" style="margin-top:12px">
      <label>Para quién<input id="l-nombre" placeholder="Admin X"></label>
      <label>Módulos que abre<input id="l-modulos" placeholder="* (todos) o ids separados por coma"></label>
      <label>Nota<input id="l-nota" placeholder="(opcional)"></label>
    </div>
    <div class="row"><button class="main" id="l-crear">Crear licencia</button></div>
    <p class="hint">El código sale una sola vez en «Salida»: cópialo y pásaselo. Lo pega en el cliente (Módulos RITE → Licencia) y queda ligado a esa PC. Revocar corta al siguiente F5; liberar la suelta de su PC para activarla en otra. Una licencia abre los módulos «con licencia» que le pongas; los «para todos» no la necesitan.</p>
  </section>

  <section>
    <h2>Rendimiento</h2>
    <div id="rendimiento" class="empty">Cargando…</div>
    <div class="row"><button id="r-actualizar">Actualizar</button></div>
    <p class="hint">Partidas de los últimos 30 días que mandaron los jugadores que aceptaron compartir (RITE Bench), agrupadas por tarjeta de video y ajustes. «1 % lento» es lo que más importa: mientras más alto, menos tirones. Es anónimo: no hay nombres ni PCs.</p>
  </section>

  <section>
    <h2>Publicar</h2>
    <div class="row" style="margin-top:0">
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--text);font-size:14px">Módulo <select id="v-mod"></select></label>
      <span class="grow"></span>
      <button id="v-abrir">Abrir carpeta</button>
      <button id="v-traer">Traer las publicadas</button>
      <button id="v-recargar">Recargar</button>
    </div>
    <div id="versiones" class="empty">Cargando…</div>
    <p class="hint" id="v-dir"></p>
  </section>

  <section id="nuevo" hidden>
    <h2>Módulo nuevo</h2>
    <div class="grid">
      <label>Archivo .js<input type="file" id="m-file" accept=".js"></label>
      <label>Id<input id="m-id" placeholder="custom-skin-link"></label>
      <label>Versión<input id="m-version" placeholder="4.0.1"></label>
      <label>Nombre<input id="m-nombre" placeholder="Custom Skin Link"></label>
      <label>Descripción<input id="m-descripcion"></label>
      <label>Cambios<input id="m-cambios" placeholder="Qué arregla esta versión"></label>
      <label>Tipo<select id="m-tipo"><option value="">(igual que antes)</option><option>visual</option><option>utilidad</option><option>info</option></select></label>
      <label>Reemplaza (userscripts locales)<input id="m-reemplaza" placeholder="CustomSkinLink.js,CustomSkinLink-RITE.js"></label>
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" id="m-apagado"> Subirlo apagado</label>
      <label class="check"><input type="checkbox" id="m-abierto"> Para todo cliente RITE (sin licencia)</label>
      <button class="main" id="m-publicar">Publicar módulo</button>
    </div>
    <p class="hint">Si no pones id, nombre o versión, se toman del encabezado ==UserScript== del archivo. Sin «Para todo cliente RITE» marcado, un módulo nuevo queda solo con licencia (uno ya publicado conserva lo que tenía; cámbialo con Abrir/Cerrar).</p>
  </section>

  <section>
    <h2>Cliente</h2>
    <p style="margin:0 0 4px">Última versión publicada: <b id="c-last" style="font-size:16px">…</b></p>
    <div class="row">
      <button id="c-actualizar">Actualizar repo (main)</button>
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--text);font-size:14px">Siguiente <input id="c-tag" size="18" readonly title="Se calcula sola"></label>
      <button id="c-editar" title="Cambiar el número a mano">✎</button>
      <button class="main" id="c-publicar">Publicar versión firmada</button>
    </div>
    <p class="hint">Publicar necesita SimplySign Desktop conectado. Tarda varios minutos y sigue aunque cierres esta pestaña (no cierres la ventana negra).</p>
  </section>

  <section><h2 id="job-title">Salida</h2><pre id="log">Aquí sale lo que va pasando.</pre></section>
</main>
<script>
const T = "__TOKEN__";
const api = (p, body) => fetch(p, body ? { method: "POST", headers: { "Content-Type": "application/json", "X-Token": T }, body: JSON.stringify(body) } : { headers: { "X-Token": T } }).then((r) => r.json());
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let busy = false;

async function loadEstado() {
  const s = await api("/api/estado");
  const chip = (ok, yes, no, warn) => '<span class="chip ' + (ok ? "ok" : warn ? "warn" : "bad") + '">' + (ok ? yes : no) + "</span>";
  $("estado").innerHTML = [
    chip(s.publicKey, "Llave pública en el cliente", "Sin llave pública"),
    chip(s.privateKey, "Llave privada en esta PC", "Sin llave privada en esta PC"),
    chip(s.gh, "GitHub CLI con sesión", "GitHub CLI sin sesión (gh auth login)"),
    chip(s.branch === "main", "Rama main", "Rama " + esc(s.branch), true),
    chip(!s.dirty, "Sin cambios pendientes", "Hay cambios sin commit", true),
    '<span class="chip">Última versión: ' + esc(s.lastTag || "?") + "</span>",
  ].join("");
  $("estado-acciones").innerHTML = !s.publicKey && !s.privateKey ? '<button id="llave">Crear llave</button>' : "";
  if ($("llave")) $("llave").onclick = () => run({ type: "llave" });
  $("c-last").textContent = s.lastTag || "(no la encuentro)";
  // The next number is always worked out again, unless it is being edited by hand.
  if ($("c-tag").readOnly) $("c-tag").value = s.nextTag || "";
}

async function loadModulos() {
  const r = await api("/api/modulos");
  if (!r.ok) return ($("modulos").innerHTML = '<div class="empty">No pude leer la lista: ' + esc(r.error) + "</div>");
  if (!r.modulos.length) return ($("modulos").innerHTML = '<div class="empty">Todavía no hay módulos publicados.</div>');
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");
  $("modulos").innerHTML =
    "<table><tr><th>Módulo</th><th>Versión</th><th>Tipo</th><th>Quién</th><th></th></tr>" +
    r.modulos.map((m) =>
      "<tr><td><span class=\\"dot " + (m.activo ? "on" : "") + "\\"></span><b>" + esc(m.nombre) + "</b><br><span class=hint>" + esc(m.id) + (m.cambios ? " · " + esc(m.cambios) : "") + (m.publicado ? " · " + esc(when(m.publicado)) : "") + "</span></td>" +
      "<td>" + esc(m.version) + "</td><td>" + esc(m.tipo) + "</td><td>" + (m.abierto ? '<span class="badge">para todos</span>' : "con licencia") + "</td><td style=\\"text-align:right;white-space:nowrap\\">" +
      (m.activo ? '<button data-a="apagar" data-id="' + esc(m.id) + '">Apagar</button>' : '<button class="main" data-a="prender" data-id="' + esc(m.id) + '">Prender</button>') +
      (m.abierto ? ' <button data-a="cerrar" data-id="' + esc(m.id) + '">Solo con licencia</button>' : ' <button data-a="abrir" data-id="' + esc(m.id) + '">Para todos</button>') +
      ' <button class="danger" data-a="quitar" data-id="' + esc(m.id) + '">Quitar</button></td></tr>'
    ).join("") + "</table>";
  for (const b of $("modulos").querySelectorAll("button")) {
    b.onclick = () => {
      const ask = {
        quitar: "¿Quitar " + b.dataset.id + " del servidor? Desaparece para todos al siguiente F5.",
        abrir: "¿Abrir " + b.dataset.id + " a todo cliente RITE, con o sin licencia?",
        cerrar: "¿Dejar " + b.dataset.id + " solo para licencias? A quien no tenga una se le va al siguiente F5.",
      }[b.dataset.a];
      if (ask && !confirm(ask)) return;
      run({ type: b.dataset.a, id: b.dataset.id });
    };
  }
}

async function loadLicencias() {
  const r = await api("/api/licencias");
  if (!r.ok) return ($("licencias").innerHTML = '<div class="empty">No pude leer las licencias: ' + esc(r.error) + "</div>");
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");
  $("licencias").innerHTML = !r.licencias.length
    ? '<div class="empty">Todavía no hay licencias.</div>'
    : "<table><tr><th>Licencia</th><th>Abre</th><th>PC</th><th></th></tr>" +
      r.licencias.map((l) =>
        "<tr><td><span class=\\"dot " + (l.activa ? "on" : "") + "\\"></span><b>" + esc(l.nombre) + "</b><br><span class=hint>" + esc(l.id) + (l.activa ? "" : " · revocada") + (l.nota ? " · " + esc(l.nota) : "") + "</span></td>" +
        "<td>" + esc(l.modulos.join(", ")) + "</td>" +
        "<td>" + (l.activacion ? "PC " + esc(l.activacion.pc) + "<br><span class=hint>cliente " + esc(l.activacion.cliente || "?") + " · " + esc(when(l.activacion.ultima)) + "</span>" : "<span class=hint>sin activar</span>") + "</td>" +
        "<td style=\\"text-align:right;white-space:nowrap\\">" +
        (l.activa ? '<button data-a="lic-revocar" data-id="' + esc(l.id) + '">Revocar</button>' : '<button class="main" data-a="lic-reactivar" data-id="' + esc(l.id) + '">Reactivar</button>') +
        (l.activacion ? ' <button data-a="lic-liberar" data-id="' + esc(l.id) + '">Liberar</button>' : "") +
        ' <button class="danger" data-a="lic-borrar" data-id="' + esc(l.id) + '">Borrar</button></td></tr>'
      ).join("") + "</table>";
  for (const b of $("licencias").querySelectorAll("button")) {
    b.onclick = () => {
      const ask = {
        "lic-revocar": "¿Revocar " + b.dataset.id + "? Al siguiente F5 se le van los módulos con licencia.",
        "lic-borrar": "¿Borrar la licencia " + b.dataset.id + "? Quien la tenga se queda sin los módulos con licencia.",
      }[b.dataset.a];
      if (ask && !confirm(ask)) return;
      run({ type: b.dataset.a, id: b.dataset.id });
    };
  }
}

async function loadRendimiento() {
  const r = await api("/api/rendimiento");
  if (!r.ok) return ($("rendimiento").innerHTML = '<div class="empty">No pude leer las mediciones: ' + esc(r.error) + "</div>");
  const PERFIL = { competitive: "Competitivo", balanced: "Equilibrado", quality: "Calidad" };
  const LIMITE = (l) => (l === "auto" ? "auto" : l === "0" ? "sin límite" : l);
  // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" → "NVIDIA GeForce RTX 3060".
  const GPU = (g) => {
    const m = /^ANGLE \\([^,]*, (.*?)(?: Direct3D\\S*| \\(0x[0-9A-Fa-f]+\\))*(?: vs_\\S+ ps_\\S+)?, [^,]*\\)$/.exec(g || "");
    return m ? m[1] : g || "?";
  };
  const total = r.grupos.reduce((n, g) => n + g.partidas, 0);
  $("rendimiento").innerHTML = !r.grupos.length
    ? '<div class="empty">Todavía no hay mediciones compartidas.</div>'
    : "<p class=hint>" + total + " partidas en " + r.grupos.length + " combinaciones</p>" +
      "<table><tr><th>Tarjeta de video</th><th>Ajustes</th><th>Partidas</th><th>FPS</th><th>1 % lento</th><th>Tirones/min</th></tr>" +
      r.grupos.map((g) =>
        "<tr><td title=\\"" + esc(g.gpu) + "\\">" + esc(GPU(g.gpu)) + "</td>" +
        "<td>" + esc((PERFIL[g.perfil] || g.perfil || "?") + " · " + (g.backend || "?") + " · " + LIMITE(g.limite || "?") + (g.clips ? " · clips " + g.clips : "") + (g.kirka ? " · Kirka: " + g.kirka : "")) + "</td>" +
        "<td>" + esc(g.partidas) + "</td><td>" + esc(g.fps ?? "–") + "</td><td><b>" + esc(g.bajo1 ?? "–") + "</b></td><td>" + esc(g.tirones_min ?? "–") + "</td></tr>"
      ).join("") + "</table>";
}
$("r-actualizar").onclick = () => loadRendimiento();

const cmpVer = (a, b) => {
  const pa = String(a).split(/[.-]/), pb = String(b).split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "", y = pb[i] ?? "";
    const nx = /^\\d+$/.test(x), ny = /^\\d+$/.test(y);
    if (nx && ny && Number(x) !== Number(y)) return Number(x) - Number(y);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};
const openVersions = new Set();

let versionsData = null;
async function loadVersiones() {
  const r = await api("/api/versiones");
  const mods = await api("/api/modulos");
  await loadLicencias();
  versionsData = { ...r, modulos: mods.ok ? mods.modulos : [] };
  $("v-dir").textContent = "Carpeta de versiones: " + r.dir + " (pon ahí los .js nuevos que te paso; cada uno que publicas también se guarda).";
  const ids = new Map();
  for (const m of versionsData.modulos) ids.set(m.id, m.nombre || m.id);
  for (const f of r.files) if (!ids.has(f.id)) ids.set(f.id, f.name || f.id);
  const sel = $("v-mod");
  const prev = sel.value;
  sel.innerHTML = [...ids].map(([id, name]) => '<option value="' + esc(id) + '">' + esc(name) + (name !== id ? " (" + esc(id) + ")" : "") + "</option>").join("") + '<option value="__nuevo">+ Módulo nuevo…</option>';
  sel.value = prev && [...sel.options].some((o) => o.value === prev) ? prev : ids.size ? [...ids.keys()][0] : "__nuevo";
  showModule();
}

function showModule() {
  const id = $("v-mod").value;
  $("nuevo").hidden = id !== "__nuevo";
  if (id === "__nuevo") return ($("versiones").innerHTML = '<div class="empty">Llena el formulario de «Módulo nuevo» de abajo.</div>');
  const r = versionsData;
  const p = r.modulos.find((m) => m.id === id);
  const files = r.files.filter((f) => f.id === id).sort((a, b) => cmpVer(b.version, a.version) || b.modified - a.modified);
  const row = (f) => {
    const live = p && p.sha256 === f.sha256;
    const used = p && !live && cmpVer(f.version, p.version) <= 0;
    return "<tr><td><b>" + esc(f.version || "sin versión") + "</b>" + (live ? ' <span class="badge">publicada</span>' : "") + '<br><span class="hint">' + esc(f.file) + " · " + new Date(f.modified).toLocaleString() + "</span></td>" +
      '<td style="text-align:right">' + (live ? "" : '<button class="' + (used ? "" : "main") + '" data-file="' + esc(f.file) + '" data-version="' + esc(f.version) + '">' + (used ? "Volver a esta" : "Publicar") + "</button>") + "</td></tr>";
  };
  const [last, ...older] = files;
  const open = openVersions.has(id);
  $("versiones").innerHTML =
    '<p class="hint" style="margin-top:0">' + (p ? "Publicada: <b>" + esc(p.version) + "</b> · " + (p.activo ? "prendido" : "apagado") + " · " + esc(p.tipo) + (p.abierto ? " · para todo cliente RITE" : " · <b>solo con licencia</b>") : "Todavía no publicado: marca «Para todo cliente RITE» si no requiere licencia") + "</p>" +
    (last
      ? '<label style="margin:8px 0">Cambios (opcional)<input id="v-cambios" placeholder="Qué arregla esta versión"></label>' +
        (p ? "" : '<div class="row" style="margin:0 0 8px"><label class="check"><input type="checkbox" id="v-abierto"> Para todo cliente RITE (sin licencia)</label>' +
          '<label style="flex-direction:row;align-items:center;gap:8px;color:var(--text);font-size:14px">Tipo <select id="v-tipo"><option>visual</option><option>utilidad</option><option>info</option></select></label></div>') +
        "<table>" + row(last) + "</table>" +
        (older.length ? '<div class="row"><button id="v-toggle">' + (open ? "Ocultar versiones" : "Versiones (" + older.length + ")") + "</button></div>" : "") +
        (open ? '<table class="old">' + older.map(row).join("") + "</table>" : "")
      : '<div class="empty">No hay versiones de este módulo en la carpeta. Pon el .js ahí o usa «Traer las publicadas».</div>');
  if ($("v-toggle")) $("v-toggle").onclick = () => (open ? openVersions.delete(id) : openVersions.add(id), showModule());
  for (const b of $("versiones").querySelectorAll("button[data-file]")) {
    b.onclick = () => {
      if (!b.dataset.version) return alert("Ese archivo no dice su versión (@version) en su encabezado.");
      const back = p && cmpVer(b.dataset.version, p.version) < 0;
      if (confirm((back ? "¿Regresar " + id + " a la " : "¿Publicar " + id + " ") + b.dataset.version + "?" + (p && p.activo ? (p.abierto ? " Les llega a todos con F5." : " Les llega a sus licencias con F5.") : ""))) run({ type: "publicar-guardada", file: b.dataset.file, id, version: b.dataset.version, cambios: ($("v-cambios") || {}).value || "", abierto: Boolean($("v-abierto") && $("v-abierto").checked), tipo: $("v-tipo") ? $("v-tipo").value : "" });
    };
  }
}

async function run(body) {
  if (busy) return alert("Espera a que termine la acción actual.");
  const r = await api("/api/accion", body);
  if (!r.ok) return alert(r.error);
  busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  poll();
}

async function poll() {
  const j = await api("/api/job");
  if (j.id) {
    $("job-title").textContent = "Salida: " + j.title + (j.done ? (j.code === 0 ? " ✔" : " ✖") : " …");
    $("log").textContent = j.log.trim();
    $("log").scrollTop = $("log").scrollHeight;
  }
  if (j.id && !j.done) return setTimeout(poll, 700);
  if (busy) {
    busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    loadEstado();
    loadModulos();
    loadVersiones();
  }
}

$("m-publicar").onclick = async () => {
  const f = $("m-file").files[0];
  if (!f) return alert("Elige el archivo .js del módulo.");
  const body = { type: "publicar-modulo", fileName: f.name, code: await f.text(), apagado: $("m-apagado").checked, abierto: $("m-abierto").checked };
  for (const k of ["id", "version", "nombre", "descripcion", "cambios", "reemplaza", "tipo"]) body[k] = $("m-" + k).value.trim();
  run(body);
};
$("l-crear").onclick = () => {
  const nombre = $("l-nombre").value.trim();
  if (!nombre) return alert("Dime para quién es la licencia.");
  run({ type: "lic-crear", nombre, modulos: $("l-modulos").value.trim() || "*", nota: $("l-nota").value.trim() });
  $("l-nombre").value = "";
  $("l-nota").value = "";
};
$("v-abrir").onclick = () => api("/api/accion", { type: "abrir-carpeta" });
$("v-recargar").onclick = () => loadVersiones();
$("v-mod").onchange = () => showModule();
$("v-traer").onclick = async () => {
  $("v-traer").disabled = true;
  try {
    const r = await api("/api/traer-publicadas", {});
    alert(r.ok ? "Listo: " + r.count + " archivo(s) nuevos en la carpeta." : r.error);
  } finally {
    $("v-traer").disabled = false;
    loadVersiones();
  }
};
$("m-borrar-rama").onclick = () => {
  if (confirm("¿Borrar la rama pública «modulos» de GitHub? Los clientes anteriores a esta versión se quedan sin módulos hasta que actualicen. No se puede deshacer.")) run({ type: "borrar-rama-github" });
};
$("c-editar").onclick = () => {
  const el = $("c-tag");
  el.readOnly = !el.readOnly;
  if (el.readOnly) loadEstado();
  else el.focus();
};
$("c-actualizar").onclick = () => run({ type: "actualizar-repo" });
$("c-publicar").onclick = () => {
  const tag = $("c-tag").value.trim();
  if (confirm("¿Publicar RITE Client " + tag + "? Los jugadores la reciben como actualización.")) run({ type: "publicar-cliente", tag });
};

loadEstado();
loadModulos();
loadVersiones();
loadRendimiento();
poll();
</script>
</body>
</html>`;
