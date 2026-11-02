"use strict";

// RITE Panel: a local page (only on this PC) to run the author's chores with
// buttons instead of commands:
//   - RITE modules: list, turn on/off, publish a new version, remove;
//   - the client: update the repo and publish a signed version.
//
//   npm run panel        (or double-click scripts/RITE-Panel.bat)
//
// It only listens on 127.0.0.1 and every request needs the random token that is
// in the address it opens, so web pages can't use it. Each action runs the same
// commands as by hand (scripts/modulos.js, scripts/publicar.js, git) and shows
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
        const child = spawn(cmd, win && cmd === "npm" ? args.map(quote) : args, { cwd: root, shell: win && cmd === "npm", env: { ...process.env, FORCE_COLOR: "0" } });
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
  const lastTag = sh("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"]) || "";
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

// v0.1.0-beta.26 → v0.1.0-beta.27; v0.2.0 → v0.2.1.
function nextTag(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z]+)\.(\d+))?$/.exec(tag || "");
  if (!m) return "";
  return m[4] ? `v${m[1]}.${m[2]}.${m[3]}-${m[4]}.${Number(m[5]) + 1}` : `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function modules() {
  try {
    const out = execFileSync(process.execPath, [path.join("scripts", "modulos.js"), "lista", "--json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const line = out.trim().split("\n").pop();
    if (!line.startsWith("{")) return { ok: true, modulos: [], secuencia: 0 };
    return { ok: true, ...JSON.parse(line) };
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message).trim().slice(0, 500) };
  }
}

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const TAG = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const clean = (v, max = 300) => String(v || "").replace(/[\x00-\x1f]/g, " ").trim().slice(0, max);

function action(body) {
  const { type } = body;
  if (type === "prender" || type === "apagar" || type === "quitar") {
    if (!ID.test(body.id)) return "Id no válido.";
    return startJob(`${type} ${body.id}`, [node("modulos.js", type, body.id)]) || "Hay otra acción corriendo.";
  }
  if (type === "publicar-modulo") {
    const name = path.basename(clean(body.fileName, 120));
    if (!/\.js$/i.test(name) || typeof body.code !== "string" || !body.code.length || body.code.length > 2 * 1024 * 1024) return "Elige un archivo .js (máx. 2 MB).";
    if (body.id && !ID.test(body.id)) return "Id no válido: minúsculas, números y guiones.";
    if (body.version && !VERSION.test(body.version)) return "Versión no válida.";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rite-panel-"));
    const file = path.join(dir, name);
    fs.writeFileSync(file, body.code);
    const args = ["publicar", file];
    for (const k of ["id", "version", "nombre", "descripcion", "cambios", "reemplaza", "tipo"]) if (clean(body[k])) args.push(`--${k}`, clean(body[k]));
    if (body.apagado) args.push("--apagado");
    return startJob(`publicar módulo ${name}`, [node("modulos.js", ...args)]) || "Hay otra acción corriendo.";
  }
  if (type === "llave") return startJob("crear llave", [node("modulos.js", "llave")]) || "Hay otra acción corriendo.";
  if (type === "actualizar-repo") {
    return startJob("actualizar repo", [["git", ["checkout", "main"]], ["git", ["pull", "origin", "main"]], ["git", ["fetch", "--tags"]], ["npm", ["install", "--no-audit", "--no-fund"]]]) || "Hay otra acción corriendo.";
  }
  if (type === "publicar-cliente") {
    if (!TAG.test(body.tag || "")) return "Versión no válida (ej. v0.1.0-beta.27).";
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
    <p class="hint">Prender o apagar se ve en el siguiente F5 de cada jugador.</p>
  </section>

  <section>
    <h2>Publicar un módulo</h2>
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
      <button class="main" id="m-publicar">Publicar módulo</button>
    </div>
    <p class="hint">Si es una versión nueva de un módulo que ya existe, basta con el archivo, el id y la versión: lo demás se conserva, y si estaba prendido sigue prendido.</p>
  </section>

  <section>
    <h2>Cliente</h2>
    <div class="row" style="margin-top:0">
      <button id="c-actualizar">Actualizar repo (main)</button>
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--text);font-size:14px">Versión <input id="c-tag" size="18"></label>
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
  if (!$("c-tag").value) $("c-tag").value = s.nextTag || "";
}

async function loadModulos() {
  const r = await api("/api/modulos");
  if (!r.ok) return ($("modulos").innerHTML = '<div class="empty">No pude leer la lista: ' + esc(r.error) + "</div>");
  if (!r.modulos.length) return ($("modulos").innerHTML = '<div class="empty">Todavía no hay módulos publicados.</div>');
  $("modulos").innerHTML =
    "<table><tr><th>Módulo</th><th>Versión</th><th>Tipo</th><th></th></tr>" +
    r.modulos.map((m) =>
      "<tr><td><span class=\\"dot " + (m.activo ? "on" : "") + "\\"></span><b>" + esc(m.nombre) + "</b><br><span class=hint>" + esc(m.id) + (m.cambios ? " · " + esc(m.cambios) : "") + "</span></td>" +
      "<td>" + esc(m.version) + "</td><td>" + esc(m.tipo) + "</td><td style=\\"text-align:right;white-space:nowrap\\">" +
      (m.activo ? '<button data-a="apagar" data-id="' + esc(m.id) + '">Apagar</button>' : '<button class="main" data-a="prender" data-id="' + esc(m.id) + '">Prender</button>') +
      ' <button class="danger" data-a="quitar" data-id="' + esc(m.id) + '">Quitar</button></td></tr>'
    ).join("") + "</table><p class=hint>Secuencia " + r.secuencia + " · " + esc(r.fecha) + "</p>";
  for (const b of $("modulos").querySelectorAll("button")) {
    b.onclick = () => {
      if (b.dataset.a === "quitar" && !confirm("¿Quitar " + b.dataset.id + " de la lista? Desaparece para todos.")) return;
      run({ type: b.dataset.a, id: b.dataset.id });
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
  }
}

$("m-publicar").onclick = async () => {
  const f = $("m-file").files[0];
  if (!f) return alert("Elige el archivo .js del módulo.");
  const body = { type: "publicar-modulo", fileName: f.name, code: await f.text(), apagado: $("m-apagado").checked };
  for (const k of ["id", "version", "nombre", "descripcion", "cambios", "reemplaza", "tipo"]) body[k] = $("m-" + k).value.trim();
  run(body);
};
$("c-actualizar").onclick = () => run({ type: "actualizar-repo" });
$("c-publicar").onclick = () => {
  const tag = $("c-tag").value.trim();
  if (confirm("¿Publicar RITE Client " + tag + "? Los jugadores la reciben como actualización.")) run({ type: "publicar-cliente", tag });
};

loadEstado();
loadModulos();
poll();
</script>
</body>
</html>`;
