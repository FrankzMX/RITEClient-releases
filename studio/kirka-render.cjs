#!/usr/bin/env node
// RITE Render desde la línea de comandos: fotos y videos de mapas de Kirka sin
// abrir el navegador (usa Chromium de Playwright y ffmpeg).
//
//   node kirka-render.cjs estudio [--puerto 8790]          abre el estudio en http://127.0.0.1:8790
//   node kirka-render.cjs foto  escena.json [--salida foto.png] [--t 3] [--calidad 1080|1440|2160]
//   node kirka-render.cjs video escena.json [--salida video.mp4] [--audio musica.mp3] [--desde 0 --hasta 5]
//
// escena.json es un proyecto guardado desde el estudio (trae el mapa adentro) o
// el JSON de un mapa exportado del editor de Kirka (sale la vista general).
// --mapa otro.json cambia el mapa del proyecto. --camara "x,y,z,mx,my,mz[,fov]"
// pone una cámara fija. --api https://rite.lat pide /api/kirka/… (modelo, texturas
// y skins de armas) a esa página, porque el render local no tiene esas rutas.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DIR = __dirname;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".obj": "text/plain", ".jpg": "image/jpeg", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg" };

function args(argv) {
  const pos = [], op = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { const k = argv[i].slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) op[k] = true; else { op[k] = v; i++; } }
    else pos.push(argv[i]);
  }
  return { pos, op };
}

// En internet: solo la página del estudio, con cabeceras de seguridad. El hash es el
// del importmap de estudio.html (si cambia, hay que actualizarlo).
const PRIVADOS = new Set(["/kirka-render.cjs", "/package.json", "/RITE Studio.bat", "/render.html", "/render.js", "/LEEME.md"]);
const SEGURIDAD = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' 'sha256-UwiAhtjQKusD83hzWQ6aRsGuzalYVp5Lt1hSBovKzG4='",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

// Solo en local: /api/kirka/… se pide a otra página (--api) y se guarda en memoria.
const copiaApi = new Map();
async function pedirApi(base, ruta, res) {
  if (!copiaApi.has(ruta)) copiaApi.set(ruta, fetch(base.replace(/\/$/, "") + ruta).then(async (r) => ({ ok: r.ok, estado: r.status, tipo: r.headers.get("content-type") || "application/octet-stream", cuerpo: Buffer.from(await r.arrayBuffer()) })));
  try {
    const r = await copiaApi.get(ruta);
    if (!r.ok) copiaApi.delete(ruta);
    res.writeHead(r.estado, { "content-type": r.tipo }); res.end(r.cuerpo);
  } catch (e) { copiaApi.delete(ruta); console.error("api:", ruta, e.message); res.writeHead(502); res.end(); }
}

function servidor(extra, puerto = 0, host = "127.0.0.1", publico = false, api = null) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      if (api && !publico && req.url.startsWith("/api/kirka/")) return pedirApi(api, req.url, res);
      let url;
      try { url = decodeURIComponent(req.url.split("?")[0]); } catch { res.writeHead(400); return res.end(); }
      if (publico && (req.method !== "GET" && req.method !== "HEAD")) { res.writeHead(405); return res.end(); }
      if (publico && PRIVADOS.has(url)) { res.writeHead(404); return res.end(); }
      if (url === "/health") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
      if (extra[url]) { res.writeHead(200, { "content-type": "application/json" }); return res.end(extra[url]); }
      const f = path.join(DIR, path.normalize(url === "/" ? "/estudio.html" : url));
      if (!f.startsWith(DIR + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TIPOS[path.extname(f)] || "application/octet-stream", ...(publico ? SEGURIDAD : {}) });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(puerto, host, () => ok(s));
  });
}

function proyecto(archivo, op) {
  let p = JSON.parse(fs.readFileSync(archivo, "utf8"));
  if (p.chunks___DATA) p = { mapa: p };
  if (op.mapa) p.mapa = JSON.parse(fs.readFileSync(op.mapa, "utf8"));
  if (typeof p.mapa === "string") p.mapa = JSON.parse(fs.readFileSync(path.resolve(path.dirname(archivo), p.mapa), "utf8"));
  p.salida = { formato: "16:9", calidad: "1080", fps: 30, ...(p.salida || {}) };
  if (op.calidad) p.salida.calidad = String(op.calidad);
  if (op.formato) p.salida.formato = op.formato;
  if (op.camara) {
    const v = op.camara.split(",").map(Number);
    p.camara = { ...(p.camara || {}), claves: [], fija: { pos: v.slice(0, 3), mira: v.slice(3, 6), fov: v[6] || 55 } };
  }
  return p;
}

async function abrir(p, op = {}) {
  const { chromium } = require("playwright");
  const s = await servidor({ "/_cfg.json": JSON.stringify(p) }, 0, "127.0.0.1", false, op.api || null);
  const nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const pg = await nav.newPage({ viewport: { width: 800, height: 600 } });
  pg.on("pageerror", (e) => console.error("error en la página:", e.message));
  pg.on("console", (m) => { if (process.env.DEBUG) console.log("[página]", m.text()); });
  await pg.goto(`http://127.0.0.1:${s.address().port}/render.html?cfg=/_cfg.json`);
  await pg.waitForFunction(() => window.LISTO === true, null, { timeout: 600000 });
  // Las texturas (skins de personajes y armas) llegan después: esperar a que todas tengan imagen.
  await pg.waitForFunction(() => {
    let falta = false;
    window.MOTOR.scene.traverse((m) => { for (const mat of [].concat(m.material || [])) if (mat.map && !mat.map.image) falta = true; });
    return !falta;
  }, null, { timeout: 180000, polling: 250 }).catch(() => console.error("aviso: alguna textura no cargó"));
  return { p: pg, cerrar: async () => { await nav.close(); s.close(); } };
}

// El cuadro como imagen, sacado del canvas (sin depender del tamaño de la ventana).
const sacar = (pg, tipo) => pg.evaluate((tipo) => document.getElementById("salida").toDataURL(tipo, 0.95).split(",")[1], tipo).then((b) => Buffer.from(b, "base64"));

async function foto(archivo, op) {
  const salida = op.salida || path.basename(archivo).replace(/\.json$/, "") + ".png";
  const { p, cerrar } = await abrir(proyecto(archivo, op), op);
  await p.evaluate((t) => window.cuadro(t), +(op.t || 0));
  if (op.eval) console.log(await p.evaluate(op.eval));
  fs.writeFileSync(salida, await sacar(p, salida.endsWith(".jpg") ? "image/jpeg" : "image/png"));
  const info = await p.evaluate(() => window.INFO);
  console.log("foto:", salida, "| caja del mapa:", JSON.stringify(info.caja));
  await cerrar();
}

async function video(archivo, op) {
  const salida = op.salida || path.basename(archivo).replace(/\.json$/, "") + ".mp4";
  const { p, cerrar } = await abrir(proyecto(archivo, op), op);
  const { duracion, fps } = await p.evaluate(() => window.INFO);
  if (!duracion) throw new Error("El proyecto no tiene movimiento de cámara (hacen falta 2 puntos o más).");
  const desde = +(op.desde || 0), hasta = +(op.hasta || duracion);
  const n = Math.round((hasta - desde) * fps);
  const audio = op.audio;
  const ff = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-"];
  if (audio) ff.push("-ss", String(desde), "-i", audio);
  ff.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", String(op.crf || 18), "-preset", "medium", "-movflags", "+faststart");
  if (audio) ff.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  ff.push(salida);
  const enc = spawn("ffmpeg", ff, { stdio: ["pipe", "ignore", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.cuadro(t), desde + i / fps);
    if (!enc.stdin.write(await sacar(p, "image/jpeg"))) await new Promise((r) => enc.stdin.once("drain", r));
    if (i % fps === 0) process.stdout.write(`\rcuadro ${i}/${n}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  enc.stdin.end();
  await new Promise((r) => enc.on("close", r));
  console.log(`\nvideo: ${salida} (${n} cuadros, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  await cerrar();
}

(async () => {
  const [cmd, ...resto] = process.argv.slice(2);
  const { pos, op } = args(resto);
  if (cmd === "foto") return foto(pos[0], op);
  if (cmd === "video") return video(pos[0], op);
  if (cmd === "estudio") {
    // En un servidor (Railway, etc.) llega PORT y se escucha en todas las interfaces.
    const enLinea = !!process.env.PORT;
    const s = await servidor({}, +(op.puerto || process.env.PORT || 8790), enLinea ? "0.0.0.0" : "127.0.0.1", enLinea);
    return console.log(enLinea ? `Estudio en el puerto ${s.address().port}` : `Estudio en http://127.0.0.1:${s.address().port}/  (Ctrl+C para cerrar)`);
  }
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 13).join("\n").replace(/^\/\/ ?/gm, ""));
})().catch((e) => { console.error(e); process.exit(1); });
