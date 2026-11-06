"use strict";

// RITE modules and licenses, from the author's PC (src/main/licencia.js is the
// client side). Every module lives on the license server (RITE Licencias, on
// Railway), none on GitHub. Every request is signed with the private key in
// ~/.rite-modulos: the server only obeys that key.
//
//   npm run licencias -- llave                          crea la llave de firma (una sola vez)
//   npm run licencias -- publicar <archivo.js> [opciones]
//        --id, --nombre, --version, --descripcion, --autor, --tipo visual|utilidad|info,
//        --cambios, --min-client, --reemplaza "A.js,B.js", --apagado (sube sin prender),
//        --abierto (para todo cliente RITE; si no, solo con licencia; al republicar se conserva),
//        --con-comentarios (sube el archivo tal cual; si no, sin comentarios y minificado).
//        Sin --id/--nombre/--version usa el encabezado ==UserScript==.
//   npm run licencias -- prender | apagar <id>          el interruptor: se ve al refrescar (F5)
//   npm run licencias -- abrir | cerrar <id>            para todo cliente / solo con licencia
//   npm run licencias -- quitar <id>                    lo borra del servidor
//   npm run licencias -- modulos [--json]
//   npm run licencias -- codigo <id> [--salida archivo] el código vigente de un módulo
//
//   npm run licencias -- crear --nombre "Admin X" [--modulos a,b | *] [--nota ...]
//   npm run licencias -- lista [--json]                 licencias y en qué PC están
//   npm run licencias -- revocar <id>                   corte al instante (siguiente F5)
//   npm run licencias -- reactivar <id>
//   npm run licencias -- liberar <id>                   la suelta de su PC para activarla en otra
//   npm run licencias -- cambiar <id> --modulos a,b     qué módulos abre
//   npm run licencias -- borrar <id>
//   npm run licencias -- bitacora [--limite 100]
//   npm run licencias -- estado
//
// The server's address comes from src/main/licencia.js (RITE_LICENCIAS_URL
// overrides it). Needs Node 20+.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SERVIDOR } = require("../src/main/licencia");
const { compactar } = require("./compactar");

const KEY_DIR = path.join(os.homedir(), ".rite-modulos");
const PRIVATE = path.join(KEY_DIR, "llave-privada.pem");
const KEY_FILE = path.join(__dirname, "..", "src", "main", "modules-key.js");
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const SERVER = String(process.env.RITE_LICENCIAS_URL || SERVIDOR).replace(/\/+$/, "");

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

function makeKey() {
  if (fs.existsSync(PRIVATE)) fail(`Ya existe una llave en ${PRIVATE}. No la reemplazo: los clientes publicados solo aceptan esa.`);
  const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("ed25519");
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PRIVATE, priv.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const pem = pub.export({ type: "spki", format: "pem" }).trim();
  const source = fs.readFileSync(KEY_FILE, "utf8").replace(/PUBLIC_KEY: [^\n]*\};/, `PUBLIC_KEY: ${JSON.stringify(pem)} };`);
  fs.writeFileSync(KEY_FILE, source);
  console.log(`✔ Llave privada: ${PRIVATE}`);
  console.log("  Respáldala en un lugar seguro (USB, gestor de contraseñas). Si se pierde, hay que sacar una versión del cliente con otra llave.");
  console.log("  No la subas a GitHub ni a OneDrive.");
  console.log("✔ Llave pública escrita en src/main/modules-key.js. Haz commit, publica una versión del cliente con ella y ponla en RITE_PUBLIC_KEY del servidor.");
}

function privateKey() {
  if (!fs.existsSync(PRIVATE)) fail(`No encuentro la llave privada en ${PRIVATE}.`);
  const key = crypto.createPrivateKey(fs.readFileSync(PRIVATE, "utf8"));
  const { PUBLIC_KEY } = require(KEY_FILE);
  if (PUBLIC_KEY) {
    const pub = crypto.createPublicKey(key).export({ type: "spki", format: "pem" }).trim();
    if (pub !== PUBLIC_KEY.trim()) fail("La llave privada no corresponde a la pública de src/main/modules-key.js.");
  }
  return key;
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

// One signed request to the server's /admin. Returns the parsed answer.
async function admin(body) {
  const key = privateKey();
  const cuerpo = JSON.stringify(body);
  const tiempo = Date.now();
  const firma = crypto.sign(null, Buffer.from(`${tiempo}\n${sha256(cuerpo)}`), key).toString("base64");
  let res;
  try {
    res = await fetch(`${SERVER}/admin`, { method: "POST", headers: { "Content-Type": "application/json", "X-RITE-Tiempo": String(tiempo), "X-RITE-Firma": firma }, body: cuerpo });
  } catch (error) {
    fail(`No pude hablar con el servidor (${SERVER}): ${error.message}`);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) fail(`El servidor dijo que no: ${data.error || res.status}`);
  return data;
}

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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const modulesArg = (value) => (value === undefined || value === true ? undefined : String(value).split(",").map((s) => s.trim()).filter(Boolean));

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, target] = args._;
  switch (command) {
    case "llave":
      makeKey();
      return;
    case "crear": {
      if (!args.nombre || args.nombre === true) fail('Dime para quién es: --nombre "Admin X"');
      const r = await admin({ accion: "crear", nombre: args.nombre, modulos: modulesArg(args.modulos) || ["*"], nota: typeof args.nota === "string" ? args.nota : "" });
      console.log(`✔ Licencia para ${r.nombre} (${r.id}). Abre: ${r.modulos.join(", ")}`);
      console.log(`\n   ${r.codigo}\n`);
      console.log("  Pásale ese código (solo se muestra una vez). Lo pega en el cliente, en Módulos RITE → Licencia, y queda ligado a su PC.");
      return;
    }
    case "lista": {
      const r = await admin({ accion: "listar" });
      if (args.json) return console.log(JSON.stringify(r));
      if (!r.licencias.length) return console.log("No hay licencias.");
      for (const l of r.licencias) {
        const pc = l.activacion ? `PC ${l.activacion.pc} · cliente ${l.activacion.cliente || "?"} · última vez ${when(l.activacion.ultima)}` : "sin activar";
        console.log(`  ${l.activa ? "●" : "○"} ${l.id}  ${l.nombre}  [${l.modulos.join(", ")}]  ${l.activa ? "" : "REVOCADA "}${pc}${l.nota ? `  (${l.nota})` : ""}`);
      }
      return;
    }
    case "revocar":
    case "reactivar":
    case "liberar":
    case "borrar": {
      if (!/^lic_[a-z0-9]{10}$/.test(target || "")) fail("Dime el id de la licencia (lic_…), míralo con: npm run licencias -- lista");
      const r = await admin({ accion: command, id: target });
      console.log(`✔ ${command} ${target}: ${JSON.stringify(r)}`);
      if (command === "revocar") console.log("  Al siguiente F5 de esa PC se le van los módulos privados.");
      if (command === "liberar") console.log("  Ya puede activar el mismo código en otra PC.");
      return;
    }
    case "cambiar": {
      if (!/^lic_[a-z0-9]{10}$/.test(target || "")) fail("Dime el id de la licencia (lic_…).");
      const body = { accion: "cambiar", id: target };
      const modulos = modulesArg(args.modulos);
      if (modulos) body.modulos = modulos;
      if (typeof args.nombre === "string") body.nombre = args.nombre;
      if (typeof args.nota === "string") body.nota = args.nota;
      console.log(`✔ ${JSON.stringify(await admin(body))}`);
      return;
    }
    case "publicar": {
      if (!target || !fs.existsSync(target)) fail("Dime el archivo: npm run licencias -- publicar Grabador.js");
      const source = fs.readFileSync(target);
      if (source.length > 2 * 1024 * 1024) fail("El módulo pasa de 2 MB.");
      const meta = header(source.toString("utf8"));
      // What goes out: no comments, short local names (the source stays with you).
      const code = args["con-comentarios"] ? source.toString("utf8") : compactar(source.toString("utf8"));
      const data = Buffer.from(code, "utf8");
      const id = args.id || slug(meta.name || path.basename(target, ".js"));
      if (!ID.test(id)) fail(`Id no válido: "${id}". Usa minúsculas, números y guiones (--id grabador).`);
      const version = String(args.version || (meta.version || "").split(/\s/)[0] || "");
      if (!VERSION.test(version)) fail(`Versión no válida: "${version}". Pásala con --version 1.0.0`);
      const previous = (await admin({ accion: "modulos" })).modulos.find((m) => m.id === id);
      const old = previous ? JSON.parse(previous.entrada) : null;
      const entrada = {
        id,
        version,
        nombre: args.nombre || old?.nombre || meta.name || id,
        descripcion: args.descripcion || old?.descripcion || meta.description || "",
        autor: args.autor || old?.autor || meta.author || "",
        tipo: args.tipo || old?.tipo || "utilidad",
        minClient: args["min-client"] || old?.minClient || "",
        reemplaza: args.reemplaza ? String(args.reemplaza).split(",").map((s) => s.trim()).filter(Boolean) : old?.reemplaza || [],
        cambios: typeof args.cambios === "string" ? args.cambios : "",
        sha256: sha256(data),
        publicado: new Date().toISOString(),
      };
      const text = JSON.stringify(entrada);
      const firma = crypto.sign(null, Buffer.from(text, "utf8"), privateKey()).toString("base64");
      const body = { accion: "publicar", entrada: text, firma, codigo: code };
      if (args.apagado) body.activo = false;
      if (args.abierto) body.abierto = true;
      else if (!previous) body.abierto = false;
      const r = await admin(body);
      console.log(`✔ Módulo ${r.id} ${r.version} publicado${r.activo ? "" : " (apagado)"}, ${r.abierto ? "para todo cliente RITE" : "solo con licencia"}. Les llega al refrescar (F5).`);
      if (!args["con-comentarios"]) console.log(`  Subido sin comentarios y minificado: ${Math.round(source.length / 1024)} KB → ${Math.round(data.length / 1024)} KB.`);
      return;
    }
    case "prender":
    case "apagar":
    case "abrir":
    case "cerrar":
    case "quitar": {
      if (!ID.test(target || "")) fail("Dime el id del módulo.");
      console.log(`✔ ${JSON.stringify(await admin({ accion: command, id: target }))}`);
      if (command === "abrir") console.log("  Ahora le llega a cualquier cliente RITE, con o sin licencia.");
      if (command === "cerrar") console.log("  Ahora solo le llega a las licencias que lo abren.");
      return;
    }
    case "codigo": {
      if (!ID.test(target || "")) fail("Dime el id del módulo.");
      const r = await admin({ accion: "codigo", id: target });
      if (typeof args.salida === "string") {
        fs.writeFileSync(args.salida, r.codigo);
        console.log(`✔ ${r.id} ${r.version} guardado en ${args.salida}`);
      } else process.stdout.write(r.codigo);
      return;
    }
    case "modulos": {
      const r = await admin({ accion: "modulos" });
      if (args.json) return console.log(JSON.stringify(r));
      if (!r.modulos.length) return console.log("No hay módulos publicados.");
      for (const m of r.modulos) {
        const e = JSON.parse(m.entrada);
        console.log(`  ${m.activo ? "●" : "○"} ${m.id} ${m.version}  ${e.nombre}  ${m.abierto ? "[para todos]" : "[con licencia]"}  (${Math.round(m.tamano / 1024)} KB, ${when(m.publicado)})`);
      }
      return;
    }
    case "bitacora": {
      const r = await admin({ accion: "bitacora", limite: Number(args.limite) || 100 });
      if (args.json) return console.log(JSON.stringify(r));
      for (const e of r.eventos) console.log(`  ${when(e.cuando)}  ${e.evento}  ${e.nombre || e.licencia_id || ""}  ${typeof e.detalle === "string" ? e.detalle : JSON.stringify(e.detalle)}`);
      return;
    }
    case "estado": {
      const r = await admin({ accion: "estado" });
      if (args.json) return console.log(JSON.stringify(r));
      console.log(`Servidor ${SERVER}: ${r.licencias.activas}/${r.licencias.n} licencias activas, ${r.activaciones} en una PC, ${r.modulos.activos}/${r.modulos.n} módulos prendidos (${r.modulos.abiertos || 0} para todo cliente).`);
      return;
    }
    default:
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(2, 31).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  }
}

main().catch((error) => fail(error.message));
