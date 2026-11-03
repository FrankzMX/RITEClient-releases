"use strict";

// Publishes RITE modules (src/main/modules.js) from the author's PC:
//
//   npm run modulos -- llave                     crea la llave de firma (una sola vez)
//   npm run modulos -- lista [--json]            muestra lo publicado
//   npm run modulos -- publicar <archivo.js> [opciones]
//   npm run modulos -- prender <id>              el interruptor: aparece al refrescar
//   npm run modulos -- apagar <id>               desaparece al refrescar
//   npm run modulos -- quitar <id>               lo borra de la lista
//
// Opciones de publicar: --id, --nombre, --version, --descripcion, --autor,
// --tipo (visual | utilidad | info), --cambios, --min-client, --reemplaza
// "A.js,B.js" (userscripts locales que deja de cargar), --apagado (sube sin
// prender). Sin --id/--nombre/--version usa el encabezado ==UserScript==.
//
// The list lives on the "modulos" branch of the public RITEClient-releases repo
// and is signed with the private key in ~/.rite-modulos (never on GitHub).
// Needs Node 20+ and the GitHub CLI logged in (`gh auth login`) with write
// access to RITEClient-releases.

const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { verifyList, REPO, BRANCH, LIST } = require("../src/main/modules");

const KEY_DIR = path.join(os.homedir(), ".rite-modulos");
const PRIVATE = path.join(KEY_DIR, "llave-privada.pem");
const KEY_FILE = path.join(__dirname, "..", "src", "main", "modules-key.js");
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }).trim();
const ghJson = (args, input) => JSON.parse(gh(args, input) || "null");

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

function publicKey() {
  const { PUBLIC_KEY } = require(KEY_FILE);
  if (!PUBLIC_KEY) fail("Este cliente no tiene llave pública todavía. Corre primero: npm run modulos -- llave");
  return PUBLIC_KEY;
}

function privateKey() {
  if (!fs.existsSync(PRIVATE)) fail(`No encuentro la llave privada en ${PRIVATE}.`);
  const key = crypto.createPrivateKey(fs.readFileSync(PRIVATE, "utf8"));
  // Make sure it matches the public key the clients have.
  const pub = crypto.createPublicKey(key).export({ type: "spki", format: "pem" }).trim();
  if (pub !== publicKey().trim()) fail("La llave privada no corresponde a la pública de src/main/modules-key.js.");
  return key;
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
  console.log(`✔ Llave pública escrita en src/main/modules-key.js. Haz commit y publica una versión del cliente con ella.`);
}

function ensureBranch() {
  try {
    gh(["api", `repos/${REPO}/git/ref/heads/${BRANCH}`]);
  } catch {
    const repo = ghJson(["api", `repos/${REPO}`]);
    const head = ghJson(["api", `repos/${REPO}/git/ref/heads/${repo.default_branch}`]);
    gh(["api", "-X", "POST", `repos/${REPO}/git/refs`, "--input", "-"], JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: head.object.sha }));
    console.log(`✔ Rama ${BRANCH} creada en ${REPO}`);
  }
}

// Reads a file on the branch: { text, sha } or null.
function readRemote(file) {
  try {
    const data = ghJson(["api", `repos/${REPO}/contents/${file}?ref=${BRANCH}`]);
    return { text: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
  } catch {
    return null;
  }
}

function writeRemote(file, content, message, sha) {
  const body = { message, content: Buffer.from(content).toString("base64"), branch: BRANCH };
  if (sha) body.sha = sha;
  gh(["api", "-X", "PUT", `repos/${REPO}/contents/${file}`, "--input", "-"], JSON.stringify(body));
}

function readManifest() {
  const remote = readRemote(LIST);
  if (!remote) return { manifest: { secuencia: 0, modulos: [] }, sha: null };
  if (!verifyList(remote.text, publicKey())) fail(`${LIST} en la rama ${BRANCH} no tiene una firma válida con tu llave. Revísalo antes de seguir.`);
  return { manifest: JSON.parse(JSON.parse(remote.text).manifiesto), sha: remote.sha };
}

function writeManifest(manifest, sha, message) {
  manifest.secuencia = (manifest.secuencia || 0) + 1;
  manifest.fecha = new Date().toISOString();
  const text = JSON.stringify(manifest, null, 2);
  const firma = crypto.sign(null, Buffer.from(text, "utf8"), privateKey()).toString("base64");
  const outer = JSON.stringify({ manifiesto: text, firma }, null, 2) + "\n";
  if (!verifyList(outer, publicKey())) fail("La lista firmada no pasó la verificación (¿algún campo inválido?).");
  writeRemote(LIST, outer, `${message} (secuencia ${manifest.secuencia})`, sha);
  console.log(`✔ ${message}. Secuencia ${manifest.secuencia}. Los jugadores lo ven al refrescar (F5).`);
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

function publish(file, opts) {
  if (!file || !fs.existsSync(file)) fail("Dime el archivo: npm run modulos -- publicar CustomSkinLink.js");
  const data = fs.readFileSync(file);
  if (data.length > 2 * 1024 * 1024) fail("El módulo pasa de 2 MB.");
  const meta = header(data.toString("utf8"));
  const id = opts.id || slug(meta.name || path.basename(file, ".js"));
  if (!ID.test(id)) fail(`Id no válido: "${id}". Usa minúsculas, números y guiones (--id custom-skin-link).`);
  const version = String(opts.version || (meta.version || "").split(/\s/)[0] || "");
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(version)) fail(`Versión no válida: "${version}". Pásala con --version 4.0.1`);

  privateKey();
  ensureBranch();
  const { manifest, sha } = readManifest();
  const old = manifest.modulos.find((m) => m.id === id);
  if (old && old.version === version) fail(`${id} ${version} ya está publicado. Sube la versión (--version).`);

  const archivo = `modulos/${id}/${version}.js`;
  writeRemote(archivo, data, `Módulo ${id} ${version}`, readRemote(archivo)?.sha);
  const entry = {
    id,
    nombre: opts.nombre || old?.nombre || meta.name || id,
    descripcion: opts.descripcion || old?.descripcion || meta.description || "",
    autor: opts.autor || old?.autor || meta.author || "",
    version,
    tipo: opts.tipo || old?.tipo || "visual",
    minClient: opts["min-client"] || old?.minClient || "",
    archivo,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    cambios: opts.cambios || "",
    reemplaza: opts.reemplaza ? String(opts.reemplaza).split(",").map((s) => s.trim()).filter(Boolean) : old?.reemplaza || [],
    activo: opts.apagado ? false : old ? old.activo : true,
  };
  manifest.modulos = [...manifest.modulos.filter((m) => m.id !== id), entry];
  writeManifest(manifest, sha, `Publica ${id} ${version}${entry.activo ? "" : " (apagado)"}`);
}

function setActive(id, on) {
  privateKey();
  const { manifest, sha } = readManifest();
  const m = manifest.modulos.find((x) => x.id === id);
  if (!m) fail(`No hay un módulo "${id}". Mira la lista: npm run modulos -- lista`);
  if (m.activo === on) return console.log(`${id} ya estaba ${on ? "prendido" : "apagado"}.`);
  m.activo = on;
  writeManifest(manifest, sha, `${on ? "Prende" : "Apaga"} ${id}`);
}

function remove(id) {
  privateKey();
  const { manifest, sha } = readManifest();
  if (!manifest.modulos.some((m) => m.id === id)) fail(`No hay un módulo "${id}".`);
  manifest.modulos = manifest.modulos.filter((m) => m.id !== id);
  writeManifest(manifest, sha, `Quita ${id}`);
}

function list(json) {
  const { manifest } = readManifest();
  if (json) return console.log(JSON.stringify({ secuencia: manifest.secuencia, fecha: manifest.fecha || "", modulos: manifest.modulos }));
  if (!manifest.modulos.length) return console.log("No hay módulos publicados.");
  console.log(`Secuencia ${manifest.secuencia} · ${manifest.fecha || ""}`);
  for (const m of manifest.modulos) console.log(`  ${m.activo ? "●" : "○"} ${m.id} ${m.version}  ${m.nombre}${m.minClient ? `  (cliente ≥ ${m.minClient})` : ""}`);
}

const args = parseArgs(process.argv.slice(2));
const [command, target] = args._;
switch (command) {
  case "llave":
    makeKey();
    break;
  case "lista":
    list(Boolean(args.json));
    break;
  case "publicar":
    publish(target, args);
    break;
  case "prender":
    setActive(target, true);
    break;
  case "apagar":
    setActive(target, false);
    break;
  case "quitar":
    remove(target);
    break;
  default:
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(2, 17).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
