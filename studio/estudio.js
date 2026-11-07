// RITE Studio: escenas, fotos y videos de mapas de Kirka en el navegador.
import { crearMotor } from "./motor.js";
import { TIPOS as TIPOS_PARTICULAS } from "./particulas.js";
import { ARMAS_KIRKA } from "./armas.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { POSES, ARTICULACIONES, SOLO_DOBLAR, API_KIRKA, SKINS, PROPS, COLOR_PROP, FORMAS, dibujarSkin, esBrazoDelgado, estadoPose } from "./objetos.js";
import { componer, srt, opacidadTexto, TRANSICIONES, ESTILOS, FUENTES, EFECTOS, ENTRADAS, estiloDe, cargarFuentes, cajasTexto } from "./capas.js";
import { posCamara } from "./camara.js";
import { proyectoNuevo, normalizar, tamanoSalida, FILTROS, MOVIMIENTOS } from "./proyecto.js";
import { exportarVideo, puedeVideo } from "./exportar.js";
import { crearGif } from "./gif.js";
import { EFECTOS_SONIDO, hacerEfecto } from "./efectos-sonido.js";
import { t, ayuda, idiomaActual, cambiarIdioma } from "./textos.js";
import { ico } from "./iconos.js";

const $ = (id) => document.getElementById(id);
function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) e.append(h.nodeType ? h : String(h));
  return e;
}
/** Contenido de un botón: ícono y texto (el texto se esconde en pantallas chicas). */
const conIco = (nombre, texto) => [ico(nombre), el("span", { class: "txt" }, texto)];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mmssd = (s) => `${mmss(s)}.${Math.floor((s % 1) * 10)}`;
const descargar = (blob, nombre) => { const a = el("a", { href: URL.createObjectURL(blob), download: nombre }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };

// ---------- Estado ----------
let P = proyectoNuevo();
let motor = null;
let mapaJSON = null;
let tiempo = 0;
let reproduciendo = false;
let libre = true; // la vista es la cámara libre (no la de la toma)
let cam = { pos: [0, 20, -30], yaw: 0, pitch: -0.3, fov: 55, giro: 0 };
let seleccion = null; // { tipo: "clave"|"texto"|"sonido", i }
let pestana = "escena";
let sonidos = []; // { nombre, buffer, bytes, inicio, volumen }
let audioPara = null; // sonido que falta y que se va a llenar con el próximo archivo
let sucio = true;
const teclas = new Set();
const vista = $("vista");
const vctx = vista.getContext("2d");

const duracion = () => P.camara.duracion;
const claves = () => P.camara.claves;
const hayToma = () => claves().length >= 2;

function aviso(txt, ms = 2600) {
  const a = $("aviso");
  a.textContent = txt; a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), ms);
}

// ---------- Cámara ----------
function camAVista(c = cam) {
  const d = [-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch)];
  return { pos: [...c.pos], mira: c.pos.map((v, i) => v + d[i] * 10), fov: c.fov, giro: c.giro };
}
function vistaACam(v) {
  const d = v.mira.map((m, i) => m - v.pos[i]);
  const l = Math.hypot(...d) || 1;
  return { pos: [...v.pos], yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(Math.max(-1, Math.min(1, d[1] / l))), fov: v.fov ?? 55, giro: v.giro ?? 0 };
}
function vistaActual() {
  if (!libre && claves().length) return posCamara(P.camara, tiempo);
  return camAVista();
}
function irATiempo(s, { seguir = true } = {}) {
  tiempo = Math.max(0, Math.min(duracion(), s));
  if (seguir && claves().length) { libre = false; cam = vistaACam(posCamara(P.camara, tiempo)); }
  sucio = true;
  actualizarTiempo();
  if (!reproduciendo) refrescarCuerpo();
}
// El panel de un personaje animado muestra la pose del momento elegido.
let esperaCuerpo = 0;
function refrescarCuerpo() {
  if (!motor) return;
  const d = pestana === "objetos" && objElegido();
  if (!d || d.tipo !== "personaje" || !d.claves?.length) return;
  clearTimeout(esperaCuerpo);
  esperaCuerpo = setTimeout(construirPanel, 150);
}

// ---------- Mapa y proyecto ----------
async function cargarMapa(json, nombre = "") {
  if (!json || !json.chunks___DATA) { aviso(t("errorMapa"), 4000); return false; }
  $("cargando").hidden = false;
  $("cargando").querySelector("span").textContent = t("cargando");
  await new Promise((r) => setTimeout(r, 30));
  try {
    if (!motor) motor = await crearMotor();
    mapaJSON = json;
    P.mapaNombre = json.mapName___DATA || nombre || "";
    motor.cargar(json, P.escena);
    $("vacio").hidden = true;
    // La guía sale la primera vez que hay un mapa abierto (abrirlo ya lo explica la portada).
    try { if (!localStorage.getItem("rite-studio-guia")) setTimeout(() => guia(1), 900); } catch { /* sin almacenamiento */ }
  } finally { $("cargando").hidden = true; }
  return true;
}

async function abrirProyecto(datos, base = "") {
  const p = normalizar(datos);
  let mapa = p.mapa;
  // Un proyecto de afuera trae el mapa adentro; solo los ejemplos lo piden por nombre.
  if (typeof mapa === "string") {
    if (!base || !/^[\w.-]+\.json$/.test(mapa) || mapa.includes("..")) throw new Error("mapa");
    mapa = await (await fetch(base + mapa)).json();
  }
  P = p;
  P.mapa = null;
  sonidos = (Array.isArray(P.sonidos) ? P.sonidos : []).filter((s) => s && typeof s === "object").map(({ datos, ...s }) => ({ ...s, buffer: null, bytes: null, datos }));
  await Promise.all(sonidos.map(async (s) => {
    let ab = null;
    // El audio viene dentro del archivo (data:audio/…) o, en los ejemplos, al lado.
    // Los sonidos de los ejemplos también se encuentran si el proyecto se guardó antes sin el audio adentro.
    if (typeof s.datos === "string" && /^data:audio\/[\w.+-]+;base64,/.test(s.datos)) { try { ab = Uint8Array.from(atob(s.datos.slice(s.datos.indexOf(",") + 1)), (c) => c.charCodeAt(0)).buffer; } catch { /* sin sonido */ } }
    else if (/^[\w.-]+\.(mp3|ogg|wav)$/.test(s.nombre || "")) {
      for (const dir of [base, "ejemplos/"]) {
        if (ab || !dir) continue;
        try { const r = await fetch(dir + s.nombre); if (r.ok) ab = await r.arrayBuffer(); } catch { /* sin sonido */ }
      }
    }
    delete s.datos;
    if (!ab) return;
    s.bytes = ab.slice(0);
    try { s.buffer = await audioCtx().decodeAudioData(ab); } catch { s.bytes = null; }
  }));
  await cargarFuentes(P.fuentes);
  if (!(await cargarMapa(mapa))) return;
  await motor.ponerObjetos(P.objetos);
  seleccion = null; elegirObjeto(null);
  if (claves().length) { libre = false; irATiempo(0); } else { libre = true; cam = vistaACam(P.camara.fija || motor.vistaGeneral()); }
  construirPanel(); dimensionar(); sucio = true;
}

async function abrirArchivo(f) {
  return abrirTexto(await f.text(), f.name.replace(/\.json$/i, ""));
}

// Lee el texto de un mapa o proyecto aunque venga con comillas, en un bloque
// de código (```) o con algo escrito antes y después.
function leerTextoMapa(txt) {
  let s = String(txt || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim();
  for (let i = 0; i < 2; i++) {
    try { const d = JSON.parse(s); if (typeof d === "string") { s = d; continue; } return d && typeof d === "object" ? d : null; } catch { /* sigue */ }
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  }
  return null;
}

async function abrirTexto(txt, nombre = "") {
  const d = leerTextoMapa(txt);
  if (!d) { aviso(t("errorMapa"), 4000); return false; }
  if (d.rite === "escena") { await abrirProyecto(d); return true; }
  // Un mapa nuevo: se queda el estilo, se reinicia la cámara.
  P.camara.claves = [];
  if (await cargarMapa(d, nombre)) {
    cam = vistaACam(motor.vistaGeneral()); libre = true; irATiempo(0, { seguir: false });
    construirPanel(); dimensionar();
    return true;
  }
  return false;
}

// El mapa como texto: para pegar uno copiado de Kirka o copiar el que está abierto.
const MAX_MOSTRAR = 1500000;
function dialogoTexto() {
  const d = $("dlgTexto");
  const actual = mapaJSON ? JSON.stringify(mapaJSON) : "";
  const area = el("textarea", { rows: 9, spellcheck: "false", placeholder: t("pegaAqui"), style: "width:100%;min-height:180px;resize:vertical;background:var(--fondo);color:var(--texto);border:1px solid var(--borde);border-radius:var(--r);padding:8px;font:12px/1.4 ui-monospace,monospace;word-break:break-all" });
  const grande = actual.length > MAX_MOSTRAR;
  if (actual && !grande) area.value = actual;
  // Al entrar se selecciona todo, para pegar otro mapa encima de un solo golpe.
  area.addEventListener("focus", () => { if (area.value === actual) area.select(); });
  const copiar = async () => {
    try { await navigator.clipboard.writeText(actual); aviso(t("textoCopiado")); }
    catch { if (!grande) { area.focus(); area.select(); } aviso(t("copiaManual"), 4000); }
  };
  const abrir = async () => {
    const txt = area.value.trim();
    if (!txt || txt === actual) return aviso(t("pegaPrimero"), 3000);
    d.close();
    $("cargando").hidden = false;
    try { await abrirTexto(txt, t("mapaPegado")); } finally { $("cargando").hidden = true; }
  };
  d.replaceChildren(
    el("h2", {}, t("mapaTexto")),
    el("div", { class: "grupo", style: "gap:12px" },
      el("p", { class: "nota" }, t("mapaTextoNota"), " ", botonAyuda("mapaTexto")),
      area,
      grande ? el("p", { class: "nota" }, t("textoMuyGrande")) : null,
      el("div", { class: "dosBotones" },
        el("button", { class: "b ancho", disabled: !actual || null, onclick: copiar }, conIco("copiar", t("copiarMapa"))),
        el("button", { class: "b principal ancho", onclick: abrir }, t("abrirTexto"))),
      el("button", { class: "b", onclick: () => d.close() }, t("cerrar"))));
  if (!d.open) d.showModal();
  if (!actual) area.focus();
}

// Pegar (Ctrl+V) el texto de un mapa en cualquier parte del estudio lo abre.
document.addEventListener("paste", (e) => {
  const n = e.target;
  if (n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.isContentEditable)) return;
  const txt = e.clipboardData?.getData("text") || "";
  if (!/chunks___DATA|"rite"\s*:\s*"escena"/.test(txt)) return;
  e.preventDefault();
  $("cargando").hidden = false;
  abrirTexto(txt, t("mapaPegado")).finally(() => ($("cargando").hidden = true));
});

// El audio va dentro del proyecto para que al abrirlo en otra PC suene igual.
const aDataURL = (bytes, nombre) => new Promise((ok) => {
  const ext = (nombre.match(/\.(\w+)$/)?.[1] || "mp3").toLowerCase();
  const tipo = { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", webm: "audio/webm" }[ext] || "audio/mpeg";
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(new Blob([bytes], { type: tipo }));
});
// El proyecto completo (mapa, skins y audio adentro), como se guarda o se comparte.
async function datosProyecto() {
  const { script___DATA, ...mapa } = mapaJSON;
  const sons = await Promise.all(sonidos.map(async ({ nombre, inicio, volumen, bytes }) => ({ nombre, inicio, volumen, ...(bytes ? { datos: await aDataURL(bytes, nombre || "") } : {}) })));
  return { ...P, mapa, sonidos: sons, camara: { ...P.camara, fija: camAVista() } };
}
async function guardarProyecto() {
  if (!mapaJSON) return;
  const datos = await datosProyecto();
  const nombre = (P.nombre || P.mapaNombre || "escena").replace(/[^\w\- ]+/g, "").trim() || "escena";
  descargar(new Blob([JSON.stringify(datos)], { type: "application/json" }), `${nombre}.rite.json`);
  aviso(t("proyectoGuardado"));
}

// ---------- Compartir por enlace ----------
// Se sube a rite.lat y queda un enlace (…/studio/#p=ID) que abre el proyecto tal cual.
async function compartirProyecto() {
  if (!mapaJSON) return aviso(t("abreMapaPrimero"), 4000);
  const d = $("dlgAtajos");
  d.replaceChildren(el("h2", {}, t("compartir")), el("p", { class: "nota" }, t("subiendo")));
  if (!d.open) d.showModal();
  try {
    const r = await fetch("/api/studio/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(await datosProyecto()) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(j.error || t("noSeCompartio"));
    const enlace = `${location.origin}${location.pathname}#p=${j.id}`;
    const campo = el("input", { type: "text", value: enlace, readonly: true, class: "selector enlace" });
    campo.addEventListener("focus", () => campo.select());
    const copiar = el("button", { class: "b principal", onclick: async () => {
      try { await navigator.clipboard.writeText(enlace); copiar.textContent = t("copiado"); } catch { campo.focus(); campo.select(); }
    } }, conIco("copiar", t("copiar")));
    d.replaceChildren(el("h2", {}, t("compartir")), el("p", {}, t("compartirListo")), campo,
      el("p", { class: "nota" }, t("compartirNota")),
      el("div", { class: "dosBotones" }, copiar, el("button", { class: "b", onclick: () => d.close() }, t("cerrar"))));
    try { history.replaceState(null, "", "#p=" + j.id); } catch { /* sin historial */ }
  } catch (e) {
    d.replaceChildren(el("h2", {}, t("compartir")), el("p", {}, String(e.message || e)), el("button", { class: "b", onclick: () => d.close() }, t("cerrar")));
  }
}
// Al abrir un enlace compartido, carga ese proyecto.
async function abrirCompartido() {
  const id = (location.hash.match(/^#p=([a-zA-Z0-9]{6,16})$/) || [])[1];
  if (!id) return false;
  $("cargando").hidden = false;
  try {
    const r = await fetch("/api/studio/share/" + id);
    if (!r.ok) throw new Error(await r.text());
    await abrirProyecto(await r.json());
    return true;
  } catch (e) { aviso(t("noSeAbrio") + " " + (e.message || ""), 7000); return false; }
  finally { $("cargando").hidden = true; }
}

const EJEMPLOS = [
  { archivo: "ejemplos/halloween-fair.rite.json", t: "ejemploHW", d: "ejemploHWd" },
  { archivo: "ejemplos/final-break.rite.json", t: "ejemploFB", d: "ejemploFBd" },
  { archivo: "ejemplos/meltdown.rite.json", t: "ejemploMD", d: "ejemploMDd" },
  { archivo: "ejemplos/la-embajada.rite.json", t: "ejemploEM", d: "ejemploEMd" },
];
async function abrirEjemplo(e) {
  $("menuEjemplos").hidden = true;
  $("cargando").hidden = false;
  try { await abrirProyecto(await (await fetch(e.archivo)).json(), "ejemplos/"); }
  finally { $("cargando").hidden = true; }
}

// ---------- Dibujo ----------
let PW = 1280, PH = 720;
function dimensionar() {
  const [W, H] = tamanoSalida(P.salida);
  const caja = $("visor").getBoundingClientRect();
  const k = Math.min((caja.width - 24) / W, (caja.height - 24) / H);
  const cw = Math.max(50, Math.floor(W * k)), ch = Math.max(50, Math.floor(H * k));
  vista.style.width = cw + "px"; vista.style.height = ch + "px";
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const esc = Math.min(1, 1600 / Math.max(cw * dpr, ch * dpr));
  PW = Math.round(cw * dpr * esc); PH = Math.round(ch * dpr * esc);
  vista.width = PW; vista.height = PH;
  if (motor) motor.tamano(PW, PH);
  sucio = true;
}
addEventListener("resize", dimensionar);

function dibujar() {
  if (!motor || !mapaJSON) return;
  motor.animar(tiempo, tc?.dragging ? tc.object?.userData.id : null);
  motor.poner(vistaActual(), !libre && claves().length ? P.camara.seguir : null);
  componer(vctx, motor.dibujar(), P, tiempo, PW, PH, { duracion: hayToma() && !libre ? duracion() : 0, fps: 30 });
  // La ruta de la cámara no sale en el video; se marca solo con el chip.
  const chip = $("chipCam");
  chip.hidden = !claves().length;
  chip.className = "chip" + (libre ? " libre" : "");
  chip.innerHTML = libre ? `<b>${t("libre")}.</b> ${t("libreD")}` : `▶ ${t("enToma")}`;
}

// ---------- Movimiento libre ----------
let arrastre = null;
// Arrastrar un texto con el mouse (en la pestaña Textos).
let arrastreTexto = null;
const enLienzo = (e) => { const r = vista.getBoundingClientRect(); return [(e.clientX - r.left) * (vista.width / r.width), (e.clientY - r.top) * (vista.height / r.height)]; };
function textoBajo(e) {
  if (pestana !== "textos") return null;
  const [x, y] = enLienzo(e);
  const orden = P.textos.map((tx, i) => [tx, i]).sort((a, b) => (seleccion?.tipo === "texto" && seleccion.i === b[1]) - (seleccion?.tipo === "texto" && seleccion.i === a[1]));
  for (const [tx, i] of orden) { const c = cajasTexto.get(tx); if (c && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return [tx, i, c]; }
  return null;
}
vista.addEventListener("pointerdown", (e) => {
  const bajo = textoBajo(e);
  if (bajo) {
    const [tx, i, c] = bajo, [x, y] = enLienzo(e);
    vista.setPointerCapture(e.pointerId);
    arrastreTexto = { tx, dx: x - (c.x + c.w / 2), dy: y - (c.y + c.h / 2), W: c.W, H: c.H };
    if (!(seleccion?.tipo === "texto" && seleccion.i === i)) { seleccion = { tipo: "texto", i }; construirPanel(); }
    return;
  }
  if (!motor || (tc && tc.object && tc.axis)) return;
  vista.setPointerCapture(e.pointerId);
  arrastre = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
});
vista.addEventListener("pointermove", (e) => {
  if (arrastreTexto) {
    const [x, y] = enLienzo(e), a = arrastreTexto;
    const nx = (x - a.dx) / vista.width, ny = (y - a.dy) / vista.height;
    // Se pega al centro si queda cerca.
    a.tx.pos = [Math.abs(nx - 0.5) < 0.015 ? 0.5 : Math.round(nx * 1000) / 1000, Math.abs(ny - 0.5) < 0.015 ? 0.5 : Math.round(ny * 1000) / 1000];
    sucio = true; return;
  }
  vista.style.cursor = textoBajo(e) ? "move" : "";
  if (!arrastre) return;
  const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
  arrastre = { x: e.clientX, y: e.clientY };
  if (!dx && !dy) return;
  soltarToma();
  cam.yaw -= dx * 0.0045;
  cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch - dy * 0.0045));
  sucio = true;
});
vista.addEventListener("pointerup", (e) => {
  if (arrastreTexto) { arrastreTexto = null; construirPanel(); return; }
  // Un clic sin arrastrar elige el objeto que está debajo.
  if (arrastre && Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) < 4) clicEnVista(e);
  arrastre = null;
});
vista.addEventListener("wheel", (e) => {
  if (!motor) return;
  e.preventDefault();
  soltarToma();
  const v = camAVista(), d = v.mira.map((m, i) => (m - v.pos[i]) / 10);
  const paso = -Math.sign(e.deltaY) * Math.min(6, Math.abs(e.deltaY) * 0.03) * (e.shiftKey ? 3 : 1);
  cam.pos = cam.pos.map((p, i) => p + d[i] * paso);
  sucio = true;
}, { passive: false });
function soltarToma() {
  if (!libre) { cam = vistaACam(vistaActual()); libre = true; }
  if (reproduciendo) pausar();
}

const enCampo = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) && document.activeElement.type !== "range" && document.activeElement.type !== "checkbox";
addEventListener("keydown", (e) => {
  if (enCampo() || !motor) return;
  const k = e.key.toLowerCase();
  if (["w", "a", "s", "d", " ", "c", "shift", "arrowup", "arrowdown"].includes(k)) { teclas.add(k); if (k === " ") e.preventDefault(); return; }
  if (k === "p") { reproduciendo ? pausar() : reproducir(); e.preventDefault(); }
  else if (k === "k") guardarEncuadre();
  else if (k === "g" && tc?.object) { tc.setMode("translate"); construirPanel(); }
  else if (k === "r" && tc?.object) { tc.setMode("rotate"); construirPanel(); }
  else if (k === "t" && tc?.object) { tc.setMode("scale"); construirPanel(); }
  else if (k === "escape") { elegirObjeto(null); construirPanel(); }
  else if (k === "f") foto();
  else if (k === "arrowright") irATiempo(tiempo + 1 / P.salida.fps);
  else if (k === "arrowleft") irATiempo(tiempo - 1 / P.salida.fps);
  else if (k === "delete" || k === "backspace") borrarSeleccion();
});
addEventListener("keyup", (e) => teclas.delete(e.key.toLowerCase()));
addEventListener("blur", () => teclas.clear());

function mover(dt) {
  if (!teclas.size) return;
  let f = 0, l = 0, u = 0;
  if (teclas.has("w") || teclas.has("arrowup")) f++;
  if (teclas.has("s") || teclas.has("arrowdown")) f--;
  if (teclas.has("d")) l++;
  if (teclas.has("a")) l--;
  if (teclas.has(" ")) u++;
  if (teclas.has("c")) u--;
  if (!f && !l && !u) return;
  soltarToma();
  const v = (teclas.has("shift") ? 40 : 12) * dt;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  cam.pos[0] += (fx * f - fz * l) * v;
  cam.pos[2] += (fz * f + fx * l) * v;
  cam.pos[1] += (u + f * Math.sin(cam.pitch)) * v;
  sucio = true;
}

// ---------- Reproducción y audio ----------
let actx = null, fuentes = [];
const audioCtx = () => (actx ||= new AudioContext());
function reproducir() {
  if (!motor) return;
  if (tiempo >= duracion() - 0.01) tiempo = 0;
  if (claves().length) libre = false;
  reproduciendo = true;
  $("bPlay").replaceChildren(ico("pausa", 15)); $("bPlay").title = t("pausar") + " (P)";
  const ctx = audioCtx();
  ctx.resume();
  fuentes = sonidos.filter((s) => s.buffer).map((s) => {
    const src = ctx.createBufferSource(); src.buffer = s.buffer;
    const g = ctx.createGain(); g.gain.value = s.volumen ?? 0.8;
    src.connect(g).connect(ctx.destination);
    const ini = s.inicio || 0;
    if (ini >= tiempo) src.start(ctx.currentTime + (ini - tiempo));
    else if (tiempo - ini < s.buffer.duration) src.start(0, tiempo - ini);
    return src;
  });
}
function pausar() {
  reproduciendo = false;
  $("bPlay").replaceChildren(ico("play", 15)); $("bPlay").title = t("reproducir") + " (P)";
  for (const f of fuentes) try { f.stop(); } catch { /* ya paró */ }
  fuentes = [];
  refrescarCuerpo();
}

let antes = performance.now();
function bucle(ahora) {
  const dt = Math.min(0.1, (ahora - antes) / 1000);
  antes = ahora;
  mover(dt);
  if (reproduciendo) {
    tiempo += dt;
    if (tiempo >= duracion()) { tiempo = duracion(); pausar(); }
    if (claves().length) cam = vistaACam(posCamara(P.camara, tiempo));
    seguirCabezal();
    actualizarTiempo();
    sucio = true;
  }
  if (sucio) { sucio = false; dibujar(); dibujarPistas(); }
  requestAnimationFrame(bucle);
}
requestAnimationFrame(bucle);

// ---------- Acciones ----------
function guardarEncuadre() {
  if (!motor) return;
  const v = camAVista();
  const c = { t: Math.round(tiempo * 100) / 100, pos: v.pos.map((x) => +x.toFixed(2)), mira: v.mira.map((x) => +x.toFixed(2)), fov: Math.round(v.fov), giro: v.giro || 0 };
  const lista = claves();
  const igual = lista.findIndex((k) => Math.abs(k.t - c.t) < 0.05);
  if (igual >= 0) lista[igual] = c; else { lista.push(c); lista.sort((a, b) => a.t - b.t); }
  seleccion = { tipo: "clave", i: lista.indexOf(c) };
  // Avanzar 2 s para el siguiente punto (y alargar el video si hace falta).
  const sig = c.t + 2;
  if (sig > duracion()) P.camara.duracion = Math.ceil(sig);
  tiempo = sig;
  libre = true;
  actualizarTiempo();
  if (pestana === "camara") construirPanel();
  sucio = true;
}

function borrarSeleccion() {
  if (!seleccion) return;
  const lista = { clave: claves(), texto: P.textos, sonido: sonidos, objeto: P.objetos }[seleccion.tipo];
  lista.splice(seleccion.i, 1);
  if (seleccion.tipo === "objeto") { elegirObjeto(null); motor.ponerObjetos(P.objetos).then(() => (sucio = true)); }
  seleccion = null;
  construirPanel(); sucio = true;
}

function aplicarMovimiento(nombre) {
  if (claves().length && !confirm(t("reemplazarPuntos"))) return;
  P.camara.claves = MOVIMIENTOS[nombre](camAVista(), duracion()).map((k) => ({ ...k, giro: 0 }));
  libre = false; irATiempo(0); construirPanel();
}

function quitarTecho(si) {
  if (si) {
    const c = motor.mapa.caja;
    P.escena.cortes = [[c.min.x - 1, Math.floor(cam.pos[1]) + 1, c.min.z - 1, c.max.x + 1, c.max.y + 1, c.max.z + 1]];
  } else P.escena.cortes = [];
  $("cargando").hidden = false;
  setTimeout(() => { motor.cargar(mapaJSON, P.escena); $("cargando").hidden = true; construirPanel(); sucio = true; }, 30);
}

async function foto() {
  if (!motor) return;
  modoSalida(true);
  const [W, H] = tamanoSalida(P.salida);
  const lz = el("canvas", { width: W, height: H });
  motor.tamano(W, H);
  motor.poner(vistaActual(), !libre && claves().length ? P.camara.seguir : null);
  componer(lz.getContext("2d"), motor.dibujar(), P, tiempo, W, H, { duracion: hayToma() ? duracion() : 0, fps: P.salida.fps });
  motor.tamano(PW, PH);
  modoSalida(false);
  sucio = true;
  lz.toBlob((b) => { descargar(b, `${P.nombre || P.mapaNombre || "rite"}-${W}x${H}.png`); aviso(t("fotoHecha")); }, "image/png");
}

async function agregarAudios(files) {
  for (const f of files) {
    try {
      const ab = await f.arrayBuffer(), bytes = ab.slice(0);
      const buffer = await audioCtx().decodeAudioData(ab);
      // «Elegir» en un sonido que falta lo llena con el archivo elegido, se llame como se llame.
      const falta = (audioPara && !audioPara.buffer ? audioPara : null) || sonidos.find((s) => !s.buffer && s.nombre === f.name);
      audioPara = null;
      if (falta) Object.assign(falta, { buffer, bytes });
      else sonidos.push({ nombre: f.name, buffer, bytes, inicio: Math.round(tiempo * 10) / 10, volumen: 0.8 });
    } catch { aviso(`${t("noSeAbrio")} ${f.name}`); }
  }
  pestana = "sonido";
  construirPanel(); sucio = true;
}

// ---------- Exportar ----------
// Destinos listos: formato, calidad y fluidez de una vez (y el largo máximo que aceptan).
const DESTINOS = {
  youtube: { icono: "video", formato: "16:9", calidad: "1080", fps: 60 },
  shorts: { icono: "vertical", formato: "9:16", calidad: "1080", fps: 30, max: 180 },
  tiktok: { icono: "musica", formato: "9:16", calidad: "1080", fps: 30, max: 600 },
  reels: { icono: "circulo", formato: "9:16", calidad: "1080", fps: 30, max: 180 },
  instagram: { icono: "cuadro", formato: "4:5", calidad: "1080", fps: 30, max: 60 },
  discord: { icono: "mail", formato: "16:9", calidad: "720", fps: 30 },
};
const destinoActual = () => Object.keys(DESTINOS).find((k) => { const x = DESTINOS[k]; return x.formato === P.salida.formato && x.calidad === P.salida.calidad && x.fps === P.salida.fps && P.salida.destino === k; });
let pestanaExportar = "video";
function dialogoExportar() {
  if (!motor) return;
  const d = $("dlgExportar");
  const opciones = (titulo, ay, lista, clave) => el("div", { class: "grupo" },
    el("div", { class: "titulo" }, titulo, botonAyuda(ay)),
    el("div", { class: "chips" }, lista.map(([v, txt]) => el("button", { class: P.salida[clave] === v ? "activa" : "", onclick: () => { P.salida[clave] = v; P.salida.destino = null; dimensionar(); dialogoExportar(); } }, txt))));
  const tabs = el("div", { class: "chips tabsExportar" }, [["video", t("video")], ["gif", "GIF"], ["miniatura", t("miniatura")]].map(([k, txt]) =>
    el("button", { class: pestanaExportar === k ? "activa" : "", onclick: () => { pestanaExportar = k; dialogoExportar(); } }, txt)));
  let cuerpo;
  if (pestanaExportar === "gif") {
    P.salida.gif ||= { ancho: 480, fps: 15 };
    const g = P.salida.gif, [W0, H0] = tamanoSalida(P.salida), k = g.ancho / Math.max(W0, H0);
    const largo = Math.min(duracion(), 15);
    cuerpo = [
      el("p", { class: "nota" }, t("gifD")),
      el("div", { class: "grupo" }, el("div", { class: "titulo" }, t("tamano")), chips([[320, t("chico")], [480, t("mediano")], [640, t("grande")]], g.ancho, (v) => { g.ancho = v; dialogoExportar(); })),
      el("div", { class: "grupo" }, el("div", { class: "titulo" }, t("fluidez")), chips([[10, "10 fps"], [15, "15 fps"], [20, "20 fps"]], g.fps, (v) => { g.fps = v; dialogoExportar(); })),
      el("p", { class: "nota" }, `${Math.round(W0 * k / 2) * 2} × ${Math.round(H0 * k / 2) * 2} · ${mmss(largo)}${duracion() > 15 ? " · " + t("gifMax") : ""}`),
      el("button", { class: "b principal ancho", onclick: () => hacerGif(d) }, t("hacerGif")),
    ];
  } else if (pestanaExportar === "miniatura") {
    P.salida.mini ||= { texto: "", estilo: "youtube", resaltar: true };
    const m = P.salida.mini;
    const inp = el("input", { type: "text", value: m.texto, placeholder: t("miniaturaTextoPh"), class: "selector" });
    inp.addEventListener("input", () => { m.texto = inp.value; });
    cuerpo = [
      el("p", { class: "nota" }, t("miniaturaD")),
      el("div", { class: "grupo" }, el("div", { class: "titulo" }, t("textoGrande")), inp),
      el("div", { class: "grupo" }, el("div", { class: "titulo" }, t("estilo")), chips(["youtube", "kirka", "comic", "meme", "neon", "terror", "fiesta"].map((e) => [e, t("est_" + e)]), m.estilo, (v) => { m.estilo = v; dialogoExportar(); })),
      interruptor("resaltar", null, m, "resaltar"),
      el("p", { class: "nota" }, "1280 × 720 · JPG"),
      el("button", { class: "b principal ancho", onclick: () => { d.close(); miniatura(); } }, t("hacerMiniatura")),
    ];
  } else {
    const dest = destinoActual(), max = dest && DESTINOS[dest].max;
    cuerpo = [
      el("div", { class: "grupo" }, el("div", { class: "titulo" }, t("paraDonde"), botonAyuda("paraDonde")),
        el("div", { class: "destinos" }, Object.entries(DESTINOS).map(([k, x]) => el("button", { class: "b" + (dest === k ? " activa" : ""), onclick: () => { Object.assign(P.salida, { formato: x.formato, calidad: x.calidad, fps: x.fps, destino: k }); dimensionar(); dialogoExportar(); } },
          el("span", { class: "ico" }, ico(x.icono, 18)), el("b", {}, t("dst_" + k)), el("small", {}, `${x.formato} · ${x.calidad}p · ${x.fps} fps`))))),
      max && duracion() > max ? el("p", { class: "aviso2" }, ico("alerta", 14), ` ${t("muyLargo")} ${mmss(max)}`) : null,
      el("details", { class: "avanzado" }, el("summary", {}, t("ajustesManuales")),
        el("div", { class: "grupo", style: "gap:14px;margin-top:10px" },
          opciones(t("formato"), "formato", [["16:9", t("fmt_169")], ["9:16", t("fmt_916")], ["1:1", t("fmt_11")], ["4:5", t("fmt_45")], ["21:9", t("fmt_219")]], "formato"),
          opciones(t("calidad"), "calidad", [["720", "720p"], ["1080", "1080p"], ["1440", "1440p"], ["2160", "4K"]], "calidad"),
          opciones(t("fluidez"), "fluidez", [[24, t("fps24")], [30, t("fps30")], [60, t("fps60")]], "fps"))),
      el("div", { class: "grupo" }, interruptor("calidadMaxima", "calidadMaxima", P.salida, "maxima")),
      el("p", { class: "nota" }, `${tamanoSalida(P.salida).join(" × ")} · ${mmss(duracion())}`),
      el("div", { class: "dosBotones" },
        el("button", { class: "b ancho", onclick: () => { d.close(); foto(); } }, conIco("foto", t("fotoActual"))),
        el("button", { class: "b principal ancho", onclick: () => hacerVideo(d) }, conIco("video", t("videoCompleto")))),
    ];
  }
  d.replaceChildren(el("h2", {}, t("exportarTitulo")), tabs, el("div", { class: "grupo", style: "gap:14px" }, ...cuerpo), el("button", { class: "b", onclick: () => d.close() }, t("cerrar")));
  if (!d.open) d.showModal();
}

// GIF: la toma completa (hasta 15 s), chico para que pese poco.
async function hacerGif(d) {
  if (!hayToma()) return aviso(t("faltanPuntos"), 6000);
  pausar();
  const g = P.salida.gif, [W0, H0] = tamanoSalida(P.salida), k = g.ancho / Math.max(W0, H0);
  const W = Math.round((W0 * k) / 2) * 2, H = Math.round((H0 * k) / 2) * 2, fps = g.fps, largo = Math.min(duracion(), 15), n = Math.round(largo * fps);
  let cancel = false;
  const barra = el("div"), resta = el("p", { class: "nota" }, "…");
  d.replaceChildren(el("h2", {}, t("haciendoGif")), el("div", { class: "barraProg" }, barra), resta, el("button", { class: "b", onclick: () => (cancel = true) }, t("cancelar")));
  modoSalida(true);
  // Se dibuja al doble y se achica: queda más nítido.
  const grande = el("canvas", { width: W * 2, height: H * 2 }), gctx = grande.getContext("2d");
  const lz = el("canvas", { width: W, height: H }), ctx = lz.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  motor.tamano(W * 2, H * 2);
  const gif = crearGif(W, H, fps);
  try {
    for (let i = 0; i < n; i++) {
      if (cancel) { d.close(); return; }
      const tt = i / fps;
      motor.animar(tt);
      motor.poner(posCamara(P.camara, tt), P.camara.seguir);
      componer(gctx, motor.dibujar(), P, tt, W * 2, H * 2, { duracion: largo, fps });
      ctx.drawImage(grande, 0, 0, W, H);
      gif.cuadro(ctx.getImageData(0, 0, W, H).data);
      barra.style.width = (((i + 1) / n) * 100).toFixed(1) + "%"; resta.textContent = `${i + 1} / ${n}`;
      await new Promise((r) => setTimeout(r, 0));
    }
    const blob = gif.terminar(), nombre = `${P.nombre || P.mapaNombre || "rite"}.gif`;
    descargar(blob, nombre);
    d.replaceChildren(el("h2", {}, t("listo")), el("p", { class: "nota" }, `${nombre} · ${W} × ${H} · ${(blob.size / 1048576).toFixed(1)} MB`),
      el("div", { class: "dosBotones" }, el("button", { class: "b principal", onclick: () => descargar(blob, nombre) }, t("bajar")), el("button", { class: "b", onclick: () => d.close() }, t("cerrar"))));
  } finally { motor.tamano(PW, PH); modoSalida(false); sucio = true; }
}

// Miniatura de YouTube: este momento en 1280×720, con colores más vivos y un texto grande.
function miniatura() {
  const m = P.salida.mini, W = 1280, H = 720;
  modoSalida(true); motor.calidad(true, W, H);
  const lz = el("canvas", { width: W, height: H });
  motor.tamano(W, H);
  motor.poner(vistaActual(), !libre && claves().length ? P.camara.seguir : null);
  const f = m.resaltar ? { ...P.filtros, contraste: (P.filtros.contraste || 0) + 0.25, saturacion: (P.filtros.saturacion || 0) + 0.35, vineta: Math.max(P.filtros.vineta || 0, 0.35), barras: false, grano: 0 } : { ...P.filtros, barras: false };
  const textos = m.texto.trim() ? [{ texto: m.texto.trim(), estilo: m.estilo, desde: -1e6, hasta: 1e6, entrada: "corte", salida: "corte", efecto: "ninguno", tamano: 0.5 }] : P.textos;
  componer(lz.getContext("2d"), motor.dibujar(), { ...P, filtros: f, textos, transiciones: [], fundido: {} }, tiempo, W, H, { duracion: 0, fps: 30 });
  motor.tamano(PW, PH); modoSalida(false); sucio = true;
  lz.toBlob((b) => { descargar(b, `${P.nombre || P.mapaNombre || "rite"}-miniatura.jpg`); aviso(t("miniaturaHecha")); }, "image/jpeg", 0.92);
}

async function hacerVideo(d) {
  if (!puedeVideo()) return aviso(t("sinWebcodecs"), 6000);
  if (!hayToma()) return aviso(t("faltanPuntos"), 6000);
  pausar();
  let cancel = false;
  const barra = el("div"), resta = el("p", { class: "nota" }, "…");
  d.replaceChildren(el("h2", {}, t("exportando")), el("div", { class: "barraProg" }, barra), resta,
    el("button", { class: "b", onclick: () => (cancel = true) }, t("cancelar")));
  const [W, H] = tamanoSalida(P.salida);
  modoSalida(true);
  try {
    const blob = await exportarVideo({
      motor, proyecto: P, sonidos, W, H, fps: P.salida.fps, duracion: duracion(),
      progreso: (f, seg, n) => { barra.style.width = (f * 100).toFixed(1) + "%"; resta.textContent = `${Math.round(f * 100)}% · ~${mmss(Math.max(0, seg))}` + (n ? ` · ${t("reintentando")}` : ""); },
      cancelado: () => cancel,
    });
    if (!blob) { d.close(); return; }
    const nombre = `${P.nombre || P.mapaNombre || "rite"}.mp4`;
    descargar(blob, nombre);
    d.replaceChildren(el("h2", {}, t("listo")), el("p", { class: "nota" }, `${nombre} · ${(blob.tamano || [W, H]).join(" × ")} · ${(blob.size / 1048576).toFixed(1)} MB`),
      el("div", { class: "dosBotones" }, el("button", { class: "b principal", onclick: () => descargar(blob, nombre) }, t("bajar")), el("button", { class: "b", onclick: () => d.close() }, t("cerrar"))));
  } catch (e) {
    console.error(e);
    d.replaceChildren(el("h2", {}, t("videoNoSalio")), el("p", {}, String(e.message || e) === "H.264" ? t("sinWebcodecs") : t("videoFallo")), el("p", { class: "nota" }, String(e)), el("button", { class: "b", onclick: () => d.close() }, t("cerrar")));
  } finally { motor.tamano(PW, PH); modoSalida(false); sucio = true; }
}

// ---------- Ayuda (?) ----------
function botonAyuda(clave) {
  return el("button", { class: "ay", "data-ayuda": clave, title: "?" }, "?");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ayuda]");
  const pop = $("popAyuda");
  if (!b) { if (!e.target.closest("#popAyuda")) pop.hidden = true; if (!e.target.closest(".menu")) { $("menuEjemplos").hidden = true; $("menuArchivo").hidden = true; } return; }
  e.stopPropagation();
  pop.textContent = ayuda(b.dataset.ayuda);
  pop.hidden = false;
  const r = b.getBoundingClientRect();
  const w = 300;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - w / 2)) + "px";
  const arriba = r.top > innerHeight / 2;
  pop.style.top = arriba ? "" : r.bottom + 8 + "px";
  pop.style.bottom = arriba ? innerHeight - r.top + 8 + "px" : "";
});

// ---------- Controles del panel ----------
function deslizador(clave, ay, obj, prop, izq, der, { min = -1, max = 1, alCambiar } = {}) {
  const inp = el("input", { type: "range", min, max, step: 0.01, value: obj[prop] ?? 0, title: t("restablecer") });
  const cambio = () => { obj[prop] = +inp.value; alCambiar?.(); sucio = true; };
  inp.addEventListener("input", cambio);
  inp.addEventListener("dblclick", () => { inp.value = min < 0 ? 0 : min; cambio(); });
  return el("div", { class: "desliza" },
    el("div", { class: "titulo" }, t(clave), ay && botonAyuda(ay)),
    inp, el("div", { class: "extremos" }, el("span", {}, t(izq)), el("span", {}, t(der))));
}
function interruptor(clave, ay, obj, prop, alCambiar) {
  const c = el("input", { type: "checkbox" });
  c.checked = !!obj[prop];
  c.addEventListener("change", () => { obj[prop] = c.checked; alCambiar?.(); sucio = true; });
  return el("label", { class: "interruptor" }, c, t(clave), ay && botonAyuda(ay));
}
// Poses que se pueden elegir: las del studio y, con skin de Kirka, también las
// del juego (marcadas con «Kirka:»).
function listaPoses(d) {
  const o = d.kirka && motor.objeto(d.id), clips = o?.userData.clips || [];
  const nuestras = !o || !clips.length || o.userData.rig ? ["auto", ...POSES].map((p) => [p, t("pose_" + p)]) : [["auto", t("pose_auto")]];
  return [...nuestras, ...clips.filter((c) => !POSES.includes(c)).map((c) => [c, "Kirka: " + c])];
}
function chips(lista, actual, alElegir) {
  return el("div", { class: "chips" }, lista.map(([v, txt]) => el("button", { class: actual === v ? "activa" : "", onclick: () => alElegir(v) }, txt)));
}
const muestra = (c) => el("i", { class: "muestra", style: `background:${c}`, title: c });
const grupo = (titulo, ay, ...hijos) => el("div", { class: "grupo" }, titulo && el("div", { class: "titulo" }, titulo, ay && botonAyuda(ay)), ...hijos);

const PANELES = {
  escena() {
    const re = () => motor && motor.ajustar(P.escena);
    return [
      grupo(t("ambiente"), "ambiente", chips(["mapa", "dia", "atardecer", "noche", "terror", "radioactivo", "sangre"].map((a) => [a, t("amb_" + a)]), P.escena.ambiente, (a) => { P.escena.ambiente = a; re(); construirPanel(); sucio = true; })),
      deslizador("claridad", "claridad", P.escena, "claridad", "oscuro", "claro", { alCambiar: re }),
      deslizador("lamparas", "lamparas", P.escena, "lamparas", "apagadas", "fuertes", { alCambiar: re }),
      deslizador("niebla", "niebla", P.escena, "niebla", "sinNiebla", "mucha", { alCambiar: re }),
      deslizador("resplandor", "resplandor", P.escena, "resplandor", "nada", "mucho", { alCambiar: re }),
      deslizador("sol", "sol", P.escena, "sol", "sinSol", "fuerte", { min: 0, max: 1, alCambiar: re }),
      deslizador("altura", "altura", P.escena, "altura", "bajo", "alto", { min: 0.05, max: 1, alCambiar: re }),
      interruptor("sombras", "sombras", P.escena, "sombras", re),
      deslizador("desenfoque", "desenfoque", P.escena, "desenfoque", "nada", "mucho", { min: 0, max: 1, alCambiar: re }),
      grupo(t("luzEstudio"), "luzEstudio",
        el("div", { class: "fila" }, el("div", { style: "flex:1" }, deslizador("contraluz", null, P.escena, "contraluz", "nada", "mucho", { min: 0, max: 1.5, alCambiar: re })),
          (() => { const c = el("input", { type: "color", value: P.escena.colorContraluz || "#bcd7ff" }); c.addEventListener("input", () => { P.escena.colorContraluz = c.value; re(); sucio = true; }); return c; })()),
        deslizador("relleno", null, P.escena, "relleno", "nada", "mucho", { min: 0, max: 1, alCambiar: re })),
      P.escena.desenfoque > 0.01 && P.escena.enfoqueId ? el("button", { class: "b", onclick: () => { P.escena.enfoqueId = null; re(); construirPanel(); sucio = true; } }, conIco("enfocar", t("enfocarCentro"))) : null,
      grupo(t("verDentro"), "verDentro",
        P.escena.cortes?.length
          ? el("button", { class: "b", onclick: () => quitarTecho(false) }, conIco("volver", t("ponerTecho")))
          : el("button", { class: "b", onclick: () => quitarTecho(true) }, conIco("cortar", t("quitarTecho")))),
    ];
  },
  camara() {
    const lista = claves();
    return [
      el("button", { class: "b principal ancho", onclick: guardarEncuadre }, conIco("punto", t("guardarEncuadre")), el("kbd", {}, "K")),
      el("div", { class: "fila" }, el("span", { class: "nota" }, t("guardarEncuadre") + " →"), botonAyuda("guardarEncuadre")),
      grupo(t("puntos"), null,
        lista.length ? lista.map((k, i) => el("div", { class: "punto" + (seleccion?.tipo === "clave" && seleccion.i === i ? " elegida" : "") },
          el("span", { class: "rombo" }, "◆"), `${t("punto")} ${i + 1}`, el("span", { class: "tiempo" }, mmssd(k.t)), el("span", { class: "relleno" }),
          el("button", { class: "b peq", onclick: () => { seleccion = { tipo: "clave", i }; libre = false; cam = vistaACam(k); irATiempo(k.t); construirPanel(); } }, t("ir")),
          el("button", { class: "b peq", title: t("actualizar"), onclick: () => { const v = camAVista(); Object.assign(k, { pos: v.pos, mira: v.mira, fov: v.fov, giro: v.giro }); sucio = true; aviso(t("actualizado")); } }, "⟳"),
          el("button", { class: "b peq peligro", title: t("borrar"), onclick: () => { lista.splice(i, 1); construirPanel(); sucio = true; } }, ico("cerrar", 14))))
          : el("p", { class: "nota" }, t("sinPuntos"))),
      grupo(t("movRapidos"), "movRapidos", el("div", { class: "chips" }, Object.keys(MOVIMIENTOS).map((m) => el("button", { onclick: () => aplicarMovimiento(m) }, t("mov_" + m))))),
      deslizador("zoom", "zoom", cam, "fov", "amplio", "cerrado", { min: 25, max: 100, alCambiar: () => soltarToma() }),
      deslizador("inclinar", "inclinar", cam, "giro", "izquierda", "derecha", { min: -30, max: 30, alCambiar: () => soltarToma() }),
      interruptor("suave", "suave", P.camara, "suave"),
      interruptor("facil", "facil", P.camara, "facil"),
      deslizador("temblor", "temblor", P.camara, "temblor", "quieta", "nerviosa", { min: 0, max: 0.4 }),
    ];
  },
  efectos() {
    const ahora = () => Math.round(tiempo * 10) / 10;
    const lista = P.escena.particulas, trs = P.transiciones, golpes = P.camara.golpes;
    const re = () => { construirPanel(); sucio = true; };
    const objetos = P.objetos.filter((d) => d.tipo !== "luz");
    const elegirObj = (actual, alCambiar, vacio) => {
      const s = el("select", { class: "selector" }, el("option", { value: "" }, vacio), objetos.map((d) => el("option", { value: d.id, selected: d.id === actual }, nombreObj(d))));
      s.addEventListener("change", () => alCambiar(s.value || null));
      return s;
    };
    const tiempoBtn = (obj, prop, txt) => el("button", { class: "b peq", title: t("ponerAqui"), onclick: () => { obj[prop] = ahora(); re(); } }, `${txt} ${mmssd(obj[prop] ?? 0)}`);
    return [
      grupo(t("particulas"), "particulas",
        el("div", { class: "chips" }, Object.keys(TIPOS_PARTICULAS).map((k) => el("button", { onclick: () => { lista.push({ tipo: k, cantidad: 0.5, viento: 0, desde: 0, hasta: duracion(), objeto: null }); re(); } }, "+ " + t("pt_" + k)))),
        ...lista.map((e, i) => el("div", { class: "tarjeta" },
          el("div", { class: "fila" }, el("b", {}, t("pt_" + e.tipo)), el("span", { class: "relleno" }),
            el("button", { class: "b peq peligro", title: t("borrar"), onclick: () => { lista.splice(i, 1); re(); } }, ico("cerrar", 14))),
          deslizador("cantidad", null, e, "cantidad", "pocas", "muchas", { min: 0.02, max: 1 }),
          e.objeto ? null : deslizador("viento", null, e, "viento", "izquierda", "derecha"),
          el("div", { class: "fila" }, el("span", { class: "nota" }, t("salenDe")), elegirObj(e.objeto, (v) => { e.objeto = v; re(); }, t("alrededorCamara"))),
          el("div", { class: "fila" }, tiempoBtn(e, "desde", t("desde")), tiempoBtn(e, "hasta", t("hasta"))))),
        lista.length ? null : el("p", { class: "nota" }, t("sinParticulas"))),
      grupo(t("transiciones"), "transiciones",
        el("div", { class: "chips" }, TRANSICIONES.map((k) => el("button", { onclick: () => { trs.push({ t: ahora(), tipo: k, dur: 0.8 }); trs.sort((a, b) => a.t - b.t); re(); } }, "+ " + t("tr_" + k)))),
        ...trs.map((tr, i) => el("div", { class: "tarjeta" },
          el("div", { class: "fila" }, el("b", {}, t("tr_" + tr.tipo)), el("span", { class: "tiempo" }, mmssd(tr.t)), el("span", { class: "relleno" }),
            el("button", { class: "b peq", onclick: () => irATiempo(tr.t) }, t("ir")),
            tiempoBtn(tr, "t", "⟳"),
            el("button", { class: "b peq peligro", title: t("borrar"), onclick: () => { trs.splice(i, 1); re(); } }, ico("cerrar", 14))),
          deslizador("durTransicion", null, tr, "dur", "rapida", "lenta", { min: 0.2, max: 2.5 }))),
        trs.length ? null : el("p", { class: "nota" }, t("sinTransiciones"))),
      grupo(t("sacudidas"), "sacudidas",
        el("button", { class: "b", onclick: () => { golpes.push({ t: ahora(), fuerza: 0.6 }); golpes.sort((a, b) => a.t - b.t); re(); } }, conIco("rayo", t("sacudidaAqui"))),
        ...golpes.map((g, i) => el("div", { class: "tarjeta" },
          el("div", { class: "fila" }, ico("rayo", 14), el("span", { class: "tiempo" }, mmssd(g.t)), el("span", { class: "relleno" }),
            el("button", { class: "b peq", onclick: () => irATiempo(Math.max(0, g.t - 0.3)) }, t("ir")),
            el("button", { class: "b peq peligro", title: t("borrar"), onclick: () => { golpes.splice(i, 1); re(); } }, ico("cerrar", 14))),
          deslizador("fuerza", null, g, "fuerza", "suave", "fuerte", { min: 0.1, max: 1.5 })))),
      grupo(t("seguirObjeto"), "seguirObjeto", elegirObj(P.camara.seguir, (v) => { P.camara.seguir = v; re(); }, t("nadie"))),
    ];
  },
  filtros() {
    const f = P.filtros;
    return [
      grupo(t("preset"), "preset", chips(Object.keys(FILTROS).map((k) => [k, t("fil_" + k)]), f.preset, (k) => { Object.assign(f, FILTROS[k], { preset: k }); construirPanel(); sucio = true; })),
      deslizador("brillo", "brillo", f, "brillo", "oscuro", "claro"),
      deslizador("contraste", "contraste", f, "contraste", "menos", "mas"),
      deslizador("saturacion", "saturacion", f, "saturacion", "gris", "intenso"),
      deslizador("calidez", "calidez", f, "calidez", "frio", "calido"),
      deslizador("vineta", "vineta", f, "vineta", "nada", "mucho", { min: 0 }),
      deslizador("grano", "grano", f, "grano", "nada", "mucho", { min: 0 }),
      interruptor("barras", "barras", f, "barras"),
      interruptor("fundidoE", "fundido", P.fundido, "entrada"),
      interruptor("fundidoS", "fundido", P.fundido, "salida"),
    ];
  },
  textos() {
    return [
      el("div", { class: "fila" }, el("button", { class: "b principal", onclick: () => {
        P.textos.push({ texto: "", estilo: P.textos.length ? "subtitulo" : "titulo", desde: Math.round(tiempo * 10) / 10, hasta: Math.min(duracion(), Math.round(tiempo * 10) / 10 + 3) });
        seleccion = { tipo: "texto", i: P.textos.length - 1 }; construirPanel(); sucio = true;
        setTimeout(() => $("contenido").querySelector(".tarjeta.elegida textarea")?.focus(), 0);
      } }, "＋ " + t("agregarTexto")), botonAyuda("textos")),
      P.textos.length ? P.textos.map((tx, i) => tarjetaTexto(tx, i)) : el("p", { class: "nota" }, t("sinTextos")),
      P.textos.length ? el("button", { class: "b", onclick: () => descargar(new Blob([srt(P.textos)], { type: "text/plain" }), `${P.nombre || P.mapaNombre || "rite"}.srt`) }, conIco("bajar", t("bajarSrt"))) : null,
    ];
  },
  sonido() {
    return [
      el("div", { class: "fila" }, el("button", { class: "b principal", onclick: () => $("archivoAudio").click() }, "＋ " + t("agregarSonido")), botonAyuda("sonidos")),
      grupo(t("efectosSonido"), "efectosSonido",
        el("div", { class: "chips" }, Object.keys(EFECTOS_SONIDO).map((k) => el("button", { title: t("probarSonido"),
          onclick: async () => {
            const { buffer, bytes } = await hacerEfecto(k);
            // Se escucha al elegirlo y queda puesto en el momento donde está la línea roja.
            try { const src = audioCtx().createBufferSource(); src.buffer = buffer; src.connect(audioCtx().destination); src.start(); } catch { /* sin audio */ }
            sonidos.push({ nombre: `${t("sfx_" + k)}.wav`, buffer, bytes, inicio: Math.round(tiempo * 10) / 10, volumen: 0.8 });
            construirPanel(); sucio = true;
          } }, t("sfx_" + k))))),
      sonidos.length ? sonidos.map((s, i) => el("div", { class: "tarjeta" + (seleccion?.tipo === "sonido" && seleccion.i === i ? " elegida" : ""), onclick: () => { seleccion = { tipo: "sonido", i }; sucio = true; } },
        el("div", { class: "fila" }, ico("musica", 14), el("b", {}, s.nombre), el("span", { class: "relleno" }),
          el("button", { class: "b peq peligro", onclick: (e) => { e.stopPropagation(); sonidos.splice(i, 1); construirPanel(); sucio = true; } }, ico("cerrar", 14))),
        s.buffer ? null : el("div", { class: "fila" }, el("span", { class: "nota" }, ico("alerta", 14), " " + t("faltaAudio")), el("button", { class: "b peq", onclick: (e) => { e.stopPropagation(); audioPara = s; $("archivoAudio").click(); } }, t("elegir"))),
        el("div", { class: "fila" }, t("empieza"), el("span", { class: "tiempo" }, mmssd(s.inicio || 0)),
          el("button", { class: "b peq", onclick: () => { s.inicio = Math.round(tiempo * 10) / 10; construirPanel(); sucio = true; } }, "⏱ " + t("aqui"))),
        deslizador("volumen", null, s, "volumen", "menos", "mas", { min: 0, max: 1.5 }))) : el("p", { class: "nota" }, t("sinSonidos")),
    ];
  },
};

function tarjetaTexto(tx, i) {
  const area = el("textarea", { placeholder: t("escribe"), rows: 2 });
  area.value = tx.texto;
  area.addEventListener("input", () => { tx.texto = area.value; sucio = true; });
  const elegido = seleccion?.tipo === "texto" && seleccion.i === i;
  const re = () => { construirPanel(); sucio = true; };
  const tiempos = el("div", { class: "fila" }, t("aparece"), el("span", { class: "tiempo" }, mmssd(tx.desde)),
    el("button", { class: "b peq", onclick: () => { tx.desde = Math.round(tiempo * 10) / 10; if (tx.hasta <= tx.desde) tx.hasta = Math.min(duracion(), tx.desde + 2); re(); } }, "⏱ " + t("aqui")),
    el("span", { class: "relleno" }), t("seVa"), el("span", { class: "tiempo" }, mmssd(tx.hasta)),
    el("button", { class: "b peq", onclick: () => { tx.hasta = Math.max(tx.desde + 0.3, Math.round(tiempo * 10) / 10); re(); } }, "⏱ " + t("aqui")));
  const borrar = el("button", { class: "b peq peligro", title: t("borrar"), onclick: (e) => { e.stopPropagation(); P.textos.splice(i, 1); seleccion = null; re(); } }, ico("cerrar", 14));
  const tarjeta = el("div", { class: "tarjeta" + (elegido ? " elegida" : ""), onclick: () => { if (!elegido) { seleccion = { tipo: "texto", i }; irATiempo(tx.desde + Math.min(1, (tx.hasta - tx.desde) / 2)); construirPanel(); } } });
  if (!elegido) { tarjeta.append(el("div", { class: "fila" }, el("b", { style: "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, tx.texto || "…"), el("span", { class: "nota" }, t("est_" + tx.estilo)), borrar), tiempos); return tarjeta; }
  const e = estiloDe(tx);
  // Un estilo listo quita los cambios a mano (menos el texto, los tiempos y la posición).
  const ponerEstilo = (k) => { for (const c of ["color", "color2", "borde", "colorBorde", "sombra", "brillo", "colorBrillo", "fuente", "espacio", "mayus", "alinear", "fondo", "efecto", "entrada", "salida", "durAnim", "giro"]) delete tx[c]; tx.estilo = k; re(); };
  const color = (prop, valor) => { const c = el("input", { type: "color", value: valor || "#ffffff" }); c.addEventListener("input", () => { tx[prop] = c.value; sucio = true; }); return c; };
  const fuente = el("select", { class: "selector", style: `font-family:"${e.fuente}";font-size:16px` },
    [...FUENTES.map(([n]) => n), ...(P.fuentes || []).map((f) => f.nombre)].map((n) => el("option", { value: n, style: `font-family:"${n}"`, selected: n === e.fuente }, n)));
  fuente.addEventListener("change", () => { tx.fuente = fuente.value; re(); });
  const subirFuente = el("button", { class: "b peq", title: t("subirFuenteD"), onclick: () => elegirArchivo(".ttf,.otf,.woff,.woff2", async (f) => {
    if (f.size > 3e6) return aviso(t("fuenteGrande"), 4000);
    const nombre = f.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]+/g, "").slice(0, 40) || "Mi fuente";
    const datos = (await leerURL(f)).replace(/^data:[^;]*;/, "data:font/" + (f.name.split(".").pop() || "ttf").toLowerCase() + ";");
    P.fuentes = [...(P.fuentes || []).filter((x) => x.nombre !== nombre), { nombre, datos }];
    await cargarFuentes(P.fuentes); tx.fuente = nombre; re();
  }) }, conIco("subir", t("subirFuente")));
  const val = (prop) => ({ get [prop]() { return tx[prop] ?? e[prop]; }, set [prop](v) { tx[prop] = v; } });
  const desl = (clave, prop, izq, der, op) => deslizador(clave, null, val(prop), prop, izq, der, op);
  const conColor = (prop, nombre) => el("label", { class: "interruptor" }, el("input", { type: "checkbox", checked: !!e[prop], onchange: (ev) => { tx[prop] = ev.target.checked ? (tx[prop] || e[prop] || (prop === "fondo" ? "#ffd75e" : "#ff7a1a")) : null; re(); } }), t(nombre), e[prop] ? color(prop, e[prop]) : null);
  tarjeta.append(
    area,
    el("div", { class: "titulo-seccion" }, t("estilosListos"), botonAyuda("estilosTexto")),
    chips(Object.keys(ESTILOS).map((k) => [k, t("est_" + k)]), tx.estilo, ponerEstilo),
    el("div", { class: "fila" }, fuente, subirFuente),
    el("div", { class: "fila" }, t("colorTexto"), color("color", e.color), conColor("color2", "degradado"), el("span", { class: "relleno" }),
      el("label", { class: "interruptor" }, el("input", { type: "checkbox", checked: e.mayus, onchange: (ev) => { tx.mayus = ev.target.checked; re(); } }), "AA")),
    chips([["izq", ico("izq")], ["centro", ico("centro")], ["der", ico("der")]], e.alinear, (v) => { tx.alinear = v; re(); }),
    desl("tamano", "tamano", "chico", "grande", { min: -1, max: 1.5 }),
    el("div", { class: "fila" }, el("div", { style: "flex:1" }, desl("contorno", "borde", "nada", "grueso", { min: 0, max: 0.3 })), color("colorBorde", e.colorBorde)),
    el("div", { class: "fila" }, el("div", { style: "flex:1" }, desl("resplandorTexto", "brillo", "nada", "mucho", { min: 0, max: 1.5 })), color("colorBrillo", e.colorBrillo)),
    desl("sombraTexto", "sombra", "nada", "fuerte", { min: 0, max: 1 }),
    desl("espacioLetras", "espacio", "juntas", "separadas", { min: 0, max: 0.6 }),
    desl("giroTexto", "giro", "izquierda", "derecha", { min: -45, max: 45 }),
    conColor("fondo", "fondoTexto"),
    el("div", { class: "titulo-seccion" }, t("efectoTexto"), botonAyuda("efectoTexto")),
    chips(EFECTOS.map((k) => [k, t("ef_" + k)]), e.efecto, (v) => { tx.efecto = v; re(); }),
    el("div", { class: "titulo-seccion" }, t("entradaTexto"), botonAyuda("entradaTexto")),
    chips(ENTRADAS.map((k) => [k, t("en_" + k)]), e.entrada, (v) => { tx.entrada = v; irATiempo(tx.desde); re(); }),
    el("div", { class: "titulo-seccion" }, t("salidaTexto")),
    chips(ENTRADAS.map((k) => [k, t("en_" + k)]), e.salida, (v) => { tx.salida = v; irATiempo(Math.max(tx.desde, tx.hasta - (e.durAnim || 0.4) * 0.6)); re(); }),
    desl("durAnim", "durAnim", "rapida", "lenta", { min: 0.1, max: 2 }),
    el("p", { class: "nota" }, t("arrastraTexto")),
    el("div", { class: "fila" },
      tx.pos ? el("button", { class: "b peq", onclick: () => { delete tx.pos; re(); } }, t("centrarTexto")) : null,
      el("button", { class: "b peq", onclick: () => { const c = structuredClone(tx); c.desde = tx.hasta; c.hasta = Math.min(duracion(), tx.hasta + (tx.hasta - tx.desde)); P.textos.push(c); seleccion = { tipo: "texto", i: P.textos.length - 1 }; re(); } }, conIco("copiar", t("duplicar"))),
      el("span", { class: "relleno" }), borrar),
    tiempos);
  return tarjeta;
}

const PESTANAS = [["escena", "tabEscena"], ["camara", "tabCamara"], ["objetos", "tabObjetos"], ["filtros", "tabFiltros"], ["textos", "tabTextos"], ["efectos", "tabEfectos"], ["sonido", "tabSonido"]];
function construirPanel() {
  $("pestanas").replaceChildren(...PESTANAS.map(([k, txt]) => el("button", { class: pestana === k ? "activa" : "", onclick: () => { pestana = k; construirPanel(); } }, t(txt))));
  const scroll = construirPanel.arriba ? 0 : $("contenido").scrollTop;
  construirPanel.arriba = false;
  $("contenido").replaceChildren(...PANELES[pestana]().flat().filter(Boolean));
  $("contenido").scrollTop = scroll;
  actualizarTiempo();
}

function construirUI() {
  document.documentElement.lang = idiomaActual();
  // Botones con ícono y texto; los del menú Archivo llevan su atajo a la derecha.
  const conTexto = { bArchivo: ["menu", t("archivo")], bEjemplos: ["ejemplos", t("ejemplos")], bCompartir: ["compartir", t("compartir")], bFoto: ["foto", t("foto")], bExportar: ["video", t("exportar")], bElegir: ["abrir", t("elegirArchivo")], bProbar: ["ejemplos", t("probarEjemplo")] };
  for (const [id, [i, txt]] of Object.entries(conTexto)) { $(id).replaceChildren(...conIco(i, txt)); $(id).title = txt; }
  const enMenu = { bAbrirMapa: ["abrir", t("abrirMapa")], bTextoMapa: ["texto", t("mapaTexto")], bAbrirProyecto: ["abrir", t("abrirProyecto")], bGuardar: ["guardar", t("guardar"), "Ctrl+S"], bPlantillas: ["plantillas", t("plantillas")], bAyuda: ["teclado", t("atajos"), "?"], bIdioma: ["idioma", idiomaActual() === "es" ? "English" : "Español"] };
  for (const [id, [i, txt, k]] of Object.entries(enMenu)) $(id).replaceChildren(...[ico(i), el("span", {}, txt), k && el("kbd", {}, k)].filter(Boolean));
  $("bDeshacer").replaceChildren(ico("deshacer")); $("bRehacer").replaceChildren(ico("rehacer"));
  $("bZoomMenos").replaceChildren(ico("zoomMenos", 14)); $("bZoomMas").replaceChildren(ico("zoomMas", 14)); $("bZoomTodo").replaceChildren(ico("ajustar", 14));
  if (!reproduciendo) { $("bPlay").replaceChildren(ico("play", 15)); $("bPlay").title = t("reproducir") + " (P)"; }
  $("bPegar").textContent = t("pegarMapa");
  $("tBienvenida").textContent = t("bienvenida");
  $("tBienvenidaD").textContent = t("bienvenidaD");
  $("bZoomMas").title = t("zoomMas"); $("bZoomMenos").title = t("zoomMenos"); $("bZoomTodo").title = t("zoomTodo");
  $("bDeshacer").title = t("deshacer") + " (Ctrl+Z)"; $("bRehacer").title = t("rehacer") + " (Ctrl+Y)";
  $("menuEjemplos").replaceChildren(...EJEMPLOS.map((e) => el("button", { onclick: () => abrirEjemplo(e) }, el("b", {}, t(e.t)), el("small", {}, t(e.d)))));
  $("teclas").textContent = t("teclas");
  $("soltar").textContent = t("soltarAqui");
  $("tDur").textContent = t("duracion") + ":";
  construirPanel();
}

// ---------- Objetos ----------
let tc = null; // flechas para mover, girar y cambiar tamaño
const nuevoId = () => Math.random().toString(36).slice(2, 9);
const deg = (r) => Math.round((r * 180) / Math.PI);
const objElegido = () => (seleccion?.tipo === "objeto" ? P.objetos[seleccion.i] : null);
const multi = new Set(); // ids elegidos con Shift + clic (para agrupar)

function prepararFlechas() {
  if (tc || !motor) return;
  tc = new TransformControls(motor.cam, vista);
  tc.setSize(0.9);
  tc.addEventListener("change", () => (sucio = true));
  tc.addEventListener("objectChange", () => {
    const d = objElegido(), o = tc.object;
    if (!d || !o) return;
    if (tc.mode === "scale") {
      if (d.tipo === "pieza") d.escalaXYZ = o.scale.toArray().map((v) => +Math.max(0.02, v).toFixed(3));
      else { const s = (o.scale.x + o.scale.y + o.scale.z) / 3; o.scale.setScalar(s); d.escala = +s.toFixed(3); }
    }
    const pos = o.position.toArray().map((v) => +v.toFixed(2));
    const rot = [deg(o.rotation.x), deg(o.rotation.y), deg(o.rotation.z)];
    if (d.claves?.length) {
      // Con movimiento: mover el objeto guarda su posición en este momento.
      const k = d.claves.find((q) => Math.abs(q.t - tiempo) < 0.05);
      if (k) Object.assign(k, { pos, rot });
      else { const n = { t: Math.round(tiempo * 100) / 100, pos, rot }; if (d.tipo === "personaje") Object.assign(n, estadoPose(d, tiempo)); d.claves.push(n); d.claves.sort((a, b) => a.t - b.t); }
    } else { d.pos = pos; d.rot = rot; }
  });
  tc.addEventListener("dragging-changed", (e) => { if (!e.value && pestana === "objetos") construirPanel(); });
  motor.scene.add(tc);
}

function elegirObjeto(i, sumar = false) {
  if (i == null || !motor) { if (seleccion?.tipo === "objeto") seleccion = null; multi.clear(); tc?.detach(); sucio = true; return; }
  const id = P.objetos[i].id;
  if (!sumar) multi.clear();
  if (sumar && multi.has(id) && multi.size > 1) {
    multi.delete(id);
    const otro = P.objetos.findIndex((d) => multi.has(d.id));
    return elegirObjeto(otro, true);
  }
  if (sumar && seleccion?.tipo === "objeto" && P.objetos[seleccion.i]) multi.add(P.objetos[seleccion.i].id);
  multi.add(id);
  prepararFlechas();
  seleccion = { tipo: "objeto", i };
  const o = motor.objeto(P.objetos[i].id);
  if (o) tc.attach(o); else tc.detach();
  construirPanel.arriba = true;
  sucio = true;
}

function clicEnVista(e) {
  if (!motor) return;
  const r = vista.getBoundingClientRect();
  const ray = new motor.THREE.Raycaster();
  ray.setFromCamera(new motor.THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), motor.cam);
  const hit = ray.intersectObjects(motor.grupoObjetos.children, true)[0];
  let o = hit?.object;
  while (o && !o.userData.id) o = o.parent;
  const i = o ? P.objetos.findIndex((d) => d.id === o.userData.id) : -1;
  if (i >= 0) { elegirObjeto(i, e.shiftKey); pestana = "objetos"; construirPanel(); }
  else if (seleccion?.tipo === "objeto") { elegirObjeto(null); if (pestana === "objetos") construirPanel(); }
}

// Las flechas y los focos de las luces no salen en fotos ni videos.
function modoSalida(si) {
  if (tc) tc.visible = !si;
  motor?.ayudantes(!si);
  const [W, H] = tamanoSalida(P.salida);
  motor?.calidad(si && !!P.salida.maxima, W, H);
}

// Lugar frente a la cámara, apoyado en el piso.
function lugarAlFrente(dist = 7) {
  const v = camAVista(), d = v.mira.map((m, i) => (m - v.pos[i]) / 10);
  const dir = new motor.THREE.Vector3(...d);
  // Donde la vista toca el mapa (si está cerca); si no, a unos pasos y sin caer lejos.
  const choque = motor.rayoMapa(new motor.THREE.Vector3(...v.pos), dir, 40);
  const hasta = choque < 40 ? Math.max(1.5, choque - 0.4) : dist;
  const caida = choque < 40 ? 40 : 3;
  const p = v.pos.map((x, i) => x + d[i] * hasta);
  const bx = Math.floor(p[0]), bz = Math.floor(p[2]);
  const hay = (x, y, z) => !!motor.mapa.bloque(x, y, z);
  let y = Math.floor(p[1]);
  for (let n = 0; n < caida && !hay(bx, y - 1, bz) && y > -64; n++) y--;
  if (!hay(bx, y - 1, bz)) y = Math.floor(p[1]);
  while (hay(bx, y, bz) && y < 300) y++;
  // Que no quede encima de otro objeto: se corre a un lado.
  const lado = [-(d[2]), 0, d[0]], l = Math.hypot(lado[0], lado[2]) || 1;
  for (let n = 0; n < 12 && P.objetos.some((o) => Math.hypot(o.pos[0] - p[0], o.pos[2] - p[2]) < 0.9); n++) { p[0] += (lado[0] / l) * 1.3; p[2] += (lado[2] / l) * 1.3; }
  const yaw = deg(Math.atan2(v.pos[0] - p[0], v.pos[2] - p[2]));
  return { pos: [+p[0].toFixed(2), y, +p[2].toFixed(2)], rot: [0, yaw, 0] };
}

async function agregarObjeto(base) {
  if (!motor) return;
  const d = { id: nuevoId(), escala: 1, claves: [], ...lugarAlFrente(base.tipo === "luz" ? 4 : base.cual === "luna" ? 60 : 7), ...base };
  if (base.tipo === "luz") d.pos[1] += 2.5;
  if (base.cual === "luna") d.pos[1] += 25;
  P.objetos.push(d);
  await motor.ponerObjetos(P.objetos);
  elegirObjeto(P.objetos.length - 1);
  pestana = "objetos"; construirPanel();
}

function elegirArchivo(accept, alElegir) {
  const inp = el("input", { type: "file", accept });
  inp.onchange = () => { const f = inp.files[0]; if (f) alElegir(f); };
  inp.click();
}
const leerURL = (f) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });

async function rehacer() { await motor.ponerObjetos(P.objetos); if (seleccion?.tipo === "objeto") elegirObjeto(seleccion.i); construirPanel(); }

const AGREGABLES = [
  ["personaje", null, { tipo: "personaje", skinBase: "kirka", pose: "auto" }],
  ["calabazaCara", null, { tipo: "prop", cual: "calabazaCara" }], ["calabaza", null, { tipo: "prop", cual: "calabaza" }],
  ["calavera", null, { tipo: "prop", cual: "calavera" }], ["vela", null, { tipo: "prop", cual: "vela" }], ["farol", null, { tipo: "prop", cual: "farol" }],
  ["lapida", null, { tipo: "prop", cual: "lapida" }], ["ataud", null, { tipo: "prop", cual: "ataud" }], ["cubeta", null, { tipo: "prop", cual: "cubeta" }],
  ["arbol", null, { tipo: "prop", cual: "arbol" }], ["arbolSeco", null, { tipo: "prop", cual: "arbolSeco" }], ["buzon", null, { tipo: "prop", cual: "buzon" }],
  ["cerca", null, { tipo: "prop", cual: "cerca" }], ["luna", null, { tipo: "prop", cual: "luna" }], ["luz", null, { tipo: "luz", color: "#ffd28a", fuerza: 1, alcance: 1 }],
  ["bloque", null, { tipo: "bloque", bloque: 47 }],
];
const nombreObj = (d) => d.nombre || (d.tipo === "pieza" ? t("forma_" + d.forma) : t("obj_" + (d.tipo === "prop" ? d.cual : d.tipo))) + (d.archivo ? ` (${d.archivo})` : "");

// Matriz de un objeto (posición, giro y tamaño) para agrupar y desagrupar.
function matriz(d) {
  const T = motor.THREE, s = d.escalaXYZ || [d.escala ?? 1, d.escala ?? 1, d.escala ?? 1];
  const q = new T.Quaternion().setFromEuler(new T.Euler(...(d.rot || [0, 0, 0]).map((r) => (r * Math.PI) / 180), "YXZ"));
  return new T.Matrix4().compose(new T.Vector3(...d.pos), q, new T.Vector3(...s));
}
function ponerMatriz(d, m) {
  const T = motor.THREE, p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
  m.decompose(p, q, s);
  const e = new T.Euler().setFromQuaternion(q, "YXZ");
  d.pos = p.toArray().map((v) => +v.toFixed(3));
  d.rot = [e.x, e.y, e.z].map((r) => Math.round((r * 180) / Math.PI));
  if (d.tipo === "pieza") { d.escalaXYZ = s.toArray().map((v) => +v.toFixed(3)); delete d.escala; }
  else { d.escala = +((s.x + s.y + s.z) / 3).toFixed(3); delete d.escalaXYZ; }
}
async function agrupar() {
  const elegidos = P.objetos.filter((d) => multi.has(d.id));
  if (elegidos.length < 2) return;
  const c = [0, 1, 2].map((k) => elegidos.reduce((a, d) => a + d.pos[k], 0) / elegidos.length);
  c[1] = Math.min(...elegidos.map((d) => d.pos[1]));
  const hijos = elegidos.map((d) => { const h = structuredClone(d); h.pos = d.pos.map((v, k) => +(v - c[k]).toFixed(3)); h.claves = []; return h; });
  const g = { id: nuevoId(), tipo: "grupo", nombre: t("obj_grupo"), pos: c.map((v) => +v.toFixed(3)), rot: [0, 0, 0], escala: 1, claves: [], hijos };
  P.objetos = P.objetos.filter((d) => !multi.has(d.id));
  P.objetos.push(g);
  await motor.ponerObjetos(P.objetos);
  elegirObjeto(P.objetos.length - 1);
  construirPanel();
}
async function desagrupar(d) {
  const M = matriz(d);
  const sueltos = d.hijos.map((h) => { const n = structuredClone(h); n.id = nuevoId(); ponerMatriz(n, M.clone().multiply(matriz(h))); n.claves = []; return n; });
  const i = P.objetos.indexOf(d);
  P.objetos.splice(i, 1, ...sueltos);
  await motor.ponerObjetos(P.objetos);
  elegirObjeto(i);
  for (const n of sueltos) multi.add(n.id);
  construirPanel();
}
// «Mis objetos»: se guardan en este navegador.
function misObjetos() { try { return JSON.parse(localStorage.getItem("rite-studio-mis-objetos") || "[]"); } catch { return []; } }
function guardarMisObjetos(l) { try { localStorage.setItem("rite-studio-mis-objetos", JSON.stringify(l)); return true; } catch { return false; } }
function limpiarParaGuardar(d) { const c = structuredClone(d); delete c.id; c.claves = []; delete c.pos; delete c.rot; return c; }

// ---------- Skins de Kirka ----------
// Buscador de todas las skins de Kirka (copia propia de RITE Web). Solo aparece
// si el estudio está abierto en rite.lat, donde existe /api/kirka.
let hayKirka = null;
fetch(API_KIRKA + "/list?q=&offset=0").then((r) => (hayKirka = r.ok)).catch(() => (hayKirka = false)).finally(() => { if (pestana === "objetos") construirPanel(); });
const RAREZAS = [["", "todas"], ["P", "P"], ["M", "M"], ["L", "L"], ["E", "E"], ["R", "R"], ["C", "C"]];
function dialogoSkins(d) {
  const dlg = $("dlgSkins");
  let q = "", rareza = "", offset = 0, total = 0, pidiendo = 0;
  const rejilla = el("div", { class: "rejillaSkins" });
  const mas = el("button", { class: "b", hidden: true }, t("masSkins"));
  const cuenta = el("span", { class: "nota" }, "…");
  const buscar = el("input", { type: "search", id: "buscaSkin", placeholder: t("buscarSkin"), style: "flex:1;min-width:0;background:var(--fondo);color:var(--texto);border:1px solid var(--borde);border-radius:var(--r);padding:8px" });
  const pedir = async (de0) => {
    const n = ++pidiendo;
    if (de0) { offset = 0; rejilla.replaceChildren(); }
    const r = await fetch(`${API_KIRKA}/list?q=${encodeURIComponent(q)}&rarity=${rareza}&offset=${offset}`).then((x) => x.json()).catch(() => ({ items: [], total: 0 }));
    if (n !== pidiendo) return;
    total = r.total || 0; offset += r.items.length;
    cuenta.textContent = `${total} ${t("skinsEncontradas")}`;
    rejilla.append(...r.items.map((it) => el("button", { class: "skinKirka" + (d.kirka === it.name ? " activa" : ""), title: it.name, onclick: () => { d.kirka = it.name; d.skin = null; dlg.close(); rehacer(); } },
      el("img", { src: `${API_KIRKA}/render?item=${encodeURIComponent(it.name)}`, alt: "", loading: "lazy" }),
      el("span", {}, it.name), el("small", { class: "rareza r" + it.rarity }, it.rarity))));
    mas.hidden = offset >= total;
  };
  let espera = 0;
  buscar.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(() => { q = buscar.value.trim(); pedir(true); }, 250); });
  mas.onclick = () => pedir(false);
  const chipsR = el("div", { class: "chips" });
  const pintarR = () => chipsR.replaceChildren(...RAREZAS.map(([v, tx]) => el("button", { class: rareza === v ? "activa" : "", onclick: () => { rareza = v; pintarR(); pedir(true); } }, v ? tx : t("todas"))));
  pintarR();
  dlg.replaceChildren(
    el("h2", {}, t("skinsKirka")),
    el("div", { class: "grupo", style: "gap:10px" },
      el("div", { class: "fila" }, buscar, cuenta), chipsR, rejilla, mas,
      el("p", { class: "nota" }, t("skinsKirkaNota")),
      el("button", { class: "b", onclick: () => dlg.close() }, t("cerrar"))));
  dlg.classList.add("ancho");
  if (!dlg.open) dlg.showModal();
  pedir(true);
}

// Skins de un arma oficial de Kirka (como el buscador de skins de personaje).
function dialogoSkinsArma(d) {
  const dlg = $("dlgSkins"), tipo = d.armaKirka;
  let q = "", rareza = "", offset = 0, total = 0, pidiendo = 0;
  const rejilla = el("div", { class: "rejillaSkins armas" });
  const mas = el("button", { class: "b", hidden: true }, t("masSkins"));
  const cuenta = el("span", { class: "nota" }, "…");
  const buscar = el("input", { type: "search", placeholder: t("buscarSkin"), style: "flex:1;min-width:0;background:var(--fondo);color:var(--texto);border:1px solid var(--borde);border-radius:var(--r);padding:8px" });
  const url = (k, it) => `${API_KIRKA}/weapon-${k}?type=${encodeURIComponent(tipo)}&item=${encodeURIComponent(it)}`;
  const pedir = async (de0) => {
    const n = ++pidiendo;
    if (de0) { offset = 0; rejilla.replaceChildren(); }
    const r = await fetch(`${API_KIRKA}/weapons?type=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}&rarity=${rareza}&offset=${offset}`).then((x) => x.json()).catch(() => ({ items: [], total: 0 }));
    if (n !== pidiendo) return;
    total = r.total || 0; offset += r.items.length;
    cuenta.textContent = `${total} ${t("skinsEncontradas")}`;
    rejilla.append(...r.items.map((it) => el("button", { class: "skinKirka" + (d.skinArma === it.name ? " activa" : ""), title: it.name, onclick: () => { d.skinArma = it.name; dlg.close(); rehacer(); construirPanel(); } },
      el("img", { src: url("render", it.name), alt: "", loading: "lazy", onerror: (e) => e.target.closest("button")?.remove() }),
      el("span", {}, it.name), el("small", { class: "rareza r" + it.rarity }, it.rarity))));
    mas.hidden = offset >= total;
  };
  let espera = 0;
  buscar.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(() => { q = buscar.value.trim(); pedir(true); }, 250); });
  mas.onclick = () => pedir(false);
  const chipsR = el("div", { class: "chips" });
  const pintarR = () => chipsR.replaceChildren(...RAREZAS.map(([v, tx]) => el("button", { class: rareza === v ? "activa" : "", onclick: () => { rareza = v; pintarR(); pedir(true); } }, v ? tx : t("todas"))));
  pintarR();
  dlg.replaceChildren(
    el("h2", {}, tipo),
    el("div", { class: "grupo", style: "gap:10px" },
      el("div", { class: "fila" }, buscar, cuenta), chipsR, rejilla, mas,
      el("p", { class: "nota" }, t("skinsKirkaNota")),
      el("button", { class: "b", onclick: () => dlg.close() }, t("cerrar"))));
  dlg.classList.add("ancho");
  if (!dlg.open) dlg.showModal();
  pedir(true);
}
// Al elegir un arma oficial se le pone la primera skin de la lista.
async function primeraSkinArma(d) {
  const r = await fetch(`${API_KIRKA}/weapons?type=${encodeURIComponent(d.armaKirka)}&q=&offset=0`).then((x) => x.json()).catch(() => null);
  if (r?.items?.[0] && !d.skinArma) { d.skinArma = r.items[0].name; rehacer(); construirPanel(); }
}

// Marca de movimiento del objeto en este momento (la crea si no hay).
// Guarda dónde está y, si es personaje, su pose y los giros de sus partes.
function marcaAhora(d) {
  const o = motor.objeto(d.id);
  const pos = o.position.toArray().map((v) => +v.toFixed(2)), rot = [deg(o.rotation.x), deg(o.rotation.y), deg(o.rotation.z)];
  d.claves ||= [];
  let k = d.claves.find((q) => Math.abs(q.t - tiempo) < 0.05);
  if (!k) {
    k = { t: Math.round(tiempo * 100) / 100, pos, rot };
    if (d.tipo === "personaje") Object.assign(k, estadoPose(d, tiempo));
    d.claves.push(k); d.claves.sort((a, b) => a.t - b.t);
  } else Object.assign(k, { pos, rot });
  return k;
}
let parteElegida = "brazoD";
// Pose y giros a mano de las partes del personaje. Con movimiento, se guardan en la marca de este momento.
function panelCuerpo(d) {
  const destino = () => (d.claves?.length ? marcaAhora(d) : d);
  const actual = d.claves?.length ? estadoPose(d, tiempo) : { pose: d.pose || "auto", giros: d.giros || {} };
  const cambiar = (fn) => { const x = destino(); if (d.claves?.length && !x.giros) Object.assign(x, estadoPose(d, tiempo)); fn(x); sucio = true; };
  const valores = actual.giros[parteElegida] || [0, 0, 0];
  const eje = (i, clave, izq, der, min = -180, max = 180) => {
    const inp = el("input", { type: "range", min, max, step: 1, value: valores[i], title: t("restablecer") });
    const num = el("span", { class: "tiempo" }, `${valores[i]}°`);
    const poner = () => {
      cambiar((x) => { x.giros ||= {}; const g = (x.giros[parteElegida] ||= [0, 0, 0]); g[i] = +inp.value; if (!g.some(Boolean)) delete x.giros[parteElegida]; });
      num.textContent = `${inp.value}°`;
    };
    inp.addEventListener("input", poner);
    inp.addEventListener("dblclick", () => { inp.value = 0; poner(); });
    return el("div", { class: "desliza" }, el("div", { class: "titulo" }, t(clave), num), inp,
      el("div", { class: "extremos" }, el("span", {}, t(izq)), el("span", {}, t(der))));
  };
  const marcas = d.claves?.length ? d.claves.filter((k) => k.pose || k.giros).length : 0;
  return [
    grupo(t("pose"), "pose", chips(listaPoses(d), actual.pose, (p) => { cambiar((x) => (x.pose = p)); construirPanel(); })),
    grupo(t("moverPartes"), "moverPartes",
      chips(ARTICULACIONES.map((p) => [p, t("parte_" + p) + ((actual.giros[p] || []).some(Boolean) ? " •" : "")]), parteElegida, (p) => { parteElegida = p; construirPanel(); }),
      ...(SOLO_DOBLAR.has(parteElegida) ? [eje(0, "doblar", "estirado", "doblado", -20, 160)] :
        [eje(0, "ejeX", "atras", "adelante"), eje(1, "ejeY", "izquierda", "derecha"), eje(2, "ejeZ", ...(parteElegida === "cabeza" || parteElegida === "cuerpo" ? ["izquierda", "derecha"] : ["haciaAdentro", "haciaAfuera"]))]),
      el("div", { class: "fila" },
        el("button", { class: "b peq", onclick: () => { cambiar((x) => { if (x.giros) delete x.giros[parteElegida]; }); construirPanel(); } }, t("enderezarParte")),
        el("button", { class: "b peq", onclick: () => { cambiar((x) => (x.giros = {})); construirPanel(); } }, t("enderezarTodo"))),
      el("span", { class: "nota" }, d.claves?.length ? `◆ ${t("cuerpoEnMarca")} (${marcas})` : t("cuerpoSinMarcas"))),
  ];
}

PANELES.objetos = () => {
  const d = objElegido();
  const lista = el("div", { class: "grupo" }, el("div", { class: "titulo" }, t("enEscena"), botonAyuda("objetos")),
    P.objetos.length > 1 ? el("span", { class: "nota" }, t("varios")) : null,
    P.objetos.length ? P.objetos.map((o, i) => el("div", { class: "punto" + (multi.has(o.id) ? " elegida" : ""), style: "cursor:pointer", onclick: (e) => { elegirObjeto(i, e.shiftKey || e.target.type === "checkbox"); construirPanel(); } },
      (() => { const c = el("input", { type: "checkbox", title: t("varios") }); c.checked = multi.has(o.id); return c; })(),
      nombreObj(o), o.claves?.length ? el("span", { class: "tiempo" }, "◆" + o.claves.length) : null, el("span", { class: "relleno" }),
      el("button", { class: "b peq peligro", onclick: (e) => { e.stopPropagation(); P.objetos.splice(i, 1); elegirObjeto(null); rehacer(); } }, ico("cerrar", 14)))) : el("p", { class: "nota" }, t("sinObjetos")));
  const agregar = grupo(t("agregar"), null, el("div", { class: "chips" },
    AGREGABLES.map(([k, ic, base]) => el("button", { onclick: () => agregarObjeto(structuredClone(base)) }, t("obj_" + k))),
    el("button", { onclick: () => elegirArchivo(".glb,.gltf,.obj", async (f) => agregarObjeto({ tipo: "modelo", archivo: f.name, datos: await leerURL(f) })) }, conIco("subir", t("obj_modelo"))),
    botonAyuda("modelo")));
  const piezas = grupo(t("crearPiezas"), "piezas", el("div", { class: "chips" },
    Object.keys(FORMAS).map((f) => el("button", { onclick: () => agregarObjeto({ tipo: "pieza", forma: f, color: "#b0b4bc" }) }, t("forma_" + f)))));
  const mios = misObjetos();
  const misBloque = mios.length ? grupo(t("misObjetos"), "misObjetos", el("div", { class: "chips" },
    mios.map((m, k) => el("button", { onclick: (e) => { if (e.target.closest("[data-x]")) return; agregarObjeto(structuredClone(m.desc)); } }, m.nombre,
      el("span", { "data-x": "1", title: t("borrar"), style: "margin-left:6px;opacity:.6", onclick: () => { mios.splice(k, 1); guardarMisObjetos(mios); construirPanel(); } }, ico("cerrar", 14)))))) : null;
  const agruparBtn = multi.size > 1 ? el("button", { class: "b principal ancho", onclick: agrupar }, `⧉ ${t("agrupar")} (${multi.size} ${t("elegidos")})`) : null;
  if (!d) return [agruparBtn, agregar, piezas, misBloque, lista];
  const re = () => rehacer();
  const nombre = el("input", { type: "text", value: nombreObj(d), style: "flex:1;min-width:0;background:var(--fondo);color:var(--texto);border:1px solid var(--borde);border-radius:6px;padding:4px 6px", title: t("nombreObj") });
  nombre.addEventListener("change", () => { d.nombre = nombre.value.trim() || null; construirPanel(); });
  const card = el("div", { class: "tarjeta elegida" },
    el("div", { class: "fila" }, nombre,
      el("button", { class: "b peq", onclick: () => { elegirObjeto(null); construirPanel(); } }, conIco("listo", t("soltarObj")))),
    chips([["translate", conIco("mover", t("mover"))], ["rotate", conIco("girar", t("girar"))], ["scale", conIco("ajustar", t("tamanoObj"))]], tc?.mode || "translate", (m) => { tc?.setMode(m); construirPanel(); }),
    el("div", { class: "fila" },
      el("button", { class: "b peq", onclick: () => { Object.assign(d, lugarAlFrente(d.tipo === "luz" ? 4 : 7)); if (d.tipo === "luz") d.pos[1] += 2.5; d.claves = []; re(); } }, "⌖ " + t("alFrente")),
      el("button", { class: "b peq", onclick: async () => { const c = structuredClone(d); c.id = nuevoId(); c.pos = [d.pos[0] + 1.5, d.pos[1], d.pos[2]]; c.claves = []; P.objetos.push(c); await motor.ponerObjetos(P.objetos); elegirObjeto(P.objetos.length - 1); construirPanel(); } }, conIco("copiar", t("duplicar")))),
  );
  if (d.tipo === "personaje") {
    card.append(
      grupo(t("skin"), "skin", chips(Object.keys(SKINS).map((s) => [s, t("skin_" + s)]), d.skin || d.kirka ? null : d.skinBase, (s) => { d.skinBase = s; d.skin = null; delete d.kirka; re(); }),
        hayKirka ? el("div", { class: "fila" },
          el("button", { class: "b peq principal", onclick: () => dialogoSkins(d) }, conIco("kirka", d.kirka ? d.kirka : t("skinsKirka"))),
          d.kirka ? el("button", { class: "b peq", title: t("quitarKirka"), onclick: () => { delete d.kirka; re(); } }, ico("cerrar", 14)) : null, botonAyuda("skinsKirka")) : null,
        el("button", { class: "b peq", onclick: () => elegirArchivo("image/png", async (f) => { const url = await leerURL(f); const im = new Image(); im.onload = () => { if (im.width !== 64 || (im.height !== 64 && im.height !== 32)) aviso(t("tamanoSkin"), 5000); d.skin = url; d.brazos = esBrazoDelgado(im) ? 3 : 4; delete d.kirka; re(); }; im.src = url; }) }, "⬆ " + t("subirSkin")),
        d.skin && !d.kirka ? el("div", { class: "fila" }, el("span", { class: "nota" }, t("brazos")),
          chips([[4, t("brazos4")], [3, t("brazos3")]], d.brazos === 3 ? 3 : d.brazos === 4 ? 4 : null, (v) => { d.brazos = v; re(); })) : null,
        d.skin && !d.kirka ? interruptor("capa3d", "capa3d", { get v() { return d.capa3d !== false; }, set v(x) { d.capa3d = x; } }, "v", re) : null),
      grupo(t("acabado"), "acabado",
        chips(["mate", "satinado", "brillante", "metal"].map((a) => [a, t("acab_" + a)]), d.acabado || "mate", (a) => { d.acabado = a; re(); }),
        el("div", { class: "fila" }, el("span", { class: "nota" }, t("brillaSkin")),
          chips([[0, t("nada")], [0.35, t("poco")], [1, t("mucho")]], d.emision || 0, (v) => { d.emision = v; re(); })),
        el("div", { class: "fila" }, el("span", { class: "nota" }, t("contornoObj")),
          chips([[null, t("nada")], ["#ffffff", muestra("#ffffff")], ["#000000", muestra("#000000")], ["#ffd75e", muestra("#ffd75e")], ["#ff2bd6", muestra("#ff2bd6")], ["#38f2ff", muestra("#38f2ff")], ["#ff3b3b", muestra("#ff3b3b")]], d.contorno || null, (v) => { if (v) d.contorno = v; else delete d.contorno; re(); })),
        el("div", { class: "fila" }, el("span", { class: "nota", title: t("auraAyuda") }, t("auraObj")),
          chips([[null, t("nada")], ["#7dff4a", muestra("#7dff4a")], ["#38f2ff", muestra("#38f2ff")], ["#b06bff", muestra("#b06bff")], ["#ff3b3b", muestra("#ff3b3b")], ["#ffd75e", muestra("#ffd75e")], ["#ffffff", muestra("#ffffff")]], d.aura || null, (v) => { if (v) d.aura = v; else delete d.aura; re(); }))),
      // Armas oficiales de Kirka (los modelos vienen con el estudio; las skins, de RITE Web).
      grupo(t("armaMano"), "armaMano",
        chips([[null, t("nada")], ...ARMAS_KIRKA.map((a) => [a, a])], d.armaKirka || null, (v) => {
          if (v) d.armaKirka = v; else delete d.armaKirka;
          delete d.skinArma;
          // Con arma y sin pose elegida, se pone a apuntar.
          if (v && (!d.pose || d.pose === "auto" || d.pose === "parado")) d.pose = "apuntar";
          re(); construirPanel(); if (v && hayKirka) primeraSkinArma(d);
        }),
        d.armaKirka && hayKirka ? el("div", { class: "fila" },
          el("button", { class: "b peq principal", onclick: () => dialogoSkinsArma(d) }, conIco("pintar", d.skinArma || t("skinArma")))) : null,
        // Disparos: tramos de tiempo con fogonazo en la punta del cañón.
        d.armaKirka && !["Bayonet", "Tomahawk"].includes(d.armaKirka) ? el("div", { class: "fila" },
          el("button", { class: "b peq", title: t("dispararAyuda"), onclick: () => {
            (d.disparos ||= []).push({ desde: Math.round(tiempo * 10) / 10, hasta: Math.round(Math.min(duracion(), tiempo + 1) * 10) / 10 });
            d.disparos.sort((a, b) => a.desde - b.desde); re(); construirPanel();
          } }, conIco("mira", t("dispararAqui")))) : null,
        ...(d.disparos || []).map((dp, i) => el("div", { class: "fila" },
          el("span", { class: "nota" }, `${t("disparos")} ${mmssd(dp.desde)} → ${mmssd(dp.hasta)}`), el("span", { class: "relleno" }),
          el("button", { class: "b peq peligro", onclick: () => { d.disparos.splice(i, 1); if (!d.disparos.length) delete d.disparos; re(); construirPanel(); } }, ico("cerrar", 14))))),
      ...panelCuerpo(d));
  }
  if (d.tipo === "prop" && COLOR_PROP[d.cual]) {
    const c = el("input", { type: "color", value: d.color || COLOR_PROP[d.cual] });
    c.addEventListener("change", () => { d.color = c.value; re(); });
    card.append(el("div", { class: "fila" }, t("colorObj"), c));
  }
  if (d.tipo === "luz") {
    const c = el("input", { type: "color", value: d.color || "#ffd28a" });
    c.addEventListener("change", () => { d.color = c.value; re(); });
    const sl = (k, prop, a, b) => { const x = deslizador(k, null, d, prop, a, b, { min: 0.1, max: 3 }); x.querySelector("input").addEventListener("change", re); return x; };
    card.append(el("div", { class: "fila" }, t("colorObj"), c, botonAyuda("luz")), sl("fuerza", "fuerza", "debil", "fuerte"), sl("alcance", "alcance", "cerca", "lejos"),
      interruptor("sombraLuz", null, d, "sombra", re));
  }
  if (d.tipo === "bloque") {
    const n = el("input", { type: "number", min: 1, max: 215, value: d.bloque, style: "width:70px" });
    n.addEventListener("change", () => { d.bloque = Math.max(1, Math.min(215, +n.value || 1)); re(); });
    card.append(el("div", { class: "fila" }, t("bloqueId"), n, botonAyuda("bloque")),
      chips([[1, "1"], [10, "10"], [47, "47"], [50, "50"], [57, "57"], [82, "82"], [100, "100"], [129, "129"], [137, "137"], [148, "148"], [152, "152"], [214, "214"]], d.bloque, (b) => { d.bloque = b; re(); }));
  }
  if (d.tipo === "pieza") {
    const c = el("input", { type: "color", value: d.color || "#b0b4bc" });
    c.addEventListener("change", () => { d.color = c.value; re(); });
    card.append(el("div", { class: "fila" }, t("colorObj"), c), interruptor("brilla", null, d, "brillo", re));
    if (d.forma === "cubo") card.append(grupo(t("texturaBloque"), "bloque",
      chips([[0, t("sinTextura")], [1, "1"], [10, "10"], [47, "47"], [50, "50"], [57, "57"], [82, "82"], [100, "100"], [129, "129"], [137, "137"], [148, "148"], [152, "152"], [214, "214"]], d.bloque || 0, (b) => { d.bloque = b || null; re(); })));
  }
  if (d.tipo === "grupo") card.append(el("div", { class: "fila" }, el("button", { class: "b", style: "flex:1", onclick: () => desagrupar(d) }, "⧈ " + t("desagrupar") + ` (${d.hijos.length})`), botonAyuda("agrupar")));
  card.append(el("button", { class: "b peq", onclick: () => { const l = misObjetos(); l.push({ nombre: nombreObj(d), desc: limpiarParaGuardar(d) }); if (guardarMisObjetos(l)) aviso(t("guardadoMio")); construirPanel(); } }, conIco("estrella", t("guardarMio"))));
  card.append(grupo(t("movimientoObj"), "movimientoObj",
    el("button", { class: "b", onclick: () => { marcaAhora(d); construirPanel(); sucio = true; } }, "◆ " + t("guardarPos")),
    d.claves?.length ? el("div", { class: "fila" }, el("span", { class: "nota" }, `${d.claves.length} ${t("posiciones")}`), el("span", { class: "relleno" }),
      el("button", { class: "b peq peligro", onclick: () => { const o = motor.objeto(d.id); if (d.tipo === "personaje") Object.assign(d, estadoPose(d, tiempo)); d.pos = o.position.toArray(); d.claves = []; construirPanel(); sucio = true; } }, t("quitarMov"))) : null));
  if (P.escena.desenfoque > 0.01) card.append(el("button", { class: "b peq", onclick: () => { P.escena.enfoqueId = d.id; motor.ajustar(P.escena); sucio = true; } }, "◎ " + t("enfocarObj")));
  return [agruparBtn, card, agregar, piezas, misBloque, lista];
};

// ---------- Línea de tiempo ----------
// Arriba: regla, cámara, textos y sonidos. Abajo: un carril por cada personaje y
// por cada objeto que se mueve, con sus marcas, los tramos en que se mueve y los
// disparos. Se le puede hacer zoom (rueda con Ctrl, botones o teclas) y moverse
// de lado (rueda o arrastrando la regla).
const pistas = $("pistas");
const pctx = pistas.getContext("2d");
const MARGEN = 96;
const FILAS = { regla: [0, 18], clave: [22, 24], texto: [48, 22], sonido: [72, 28] };
const OBJ_Y = 104, OBJ_ALTO = 18, OBJ_PASO = 20, MAX_CARRILES_VISTOS = 7;
let pistaW = 800;
const vistaLinea = { zoom: 1, desde: 0, scrollY: 0 };
const ventana = () => duracion() / vistaLinea.zoom;
function acotarVista() {
  vistaLinea.zoom = Math.max(1, Math.min(60, vistaLinea.zoom));
  vistaLinea.desde = Math.max(0, Math.min(duracion() - ventana(), vistaLinea.desde));
  const n = carriles().length, sobra = Math.max(0, n - MAX_CARRILES_VISTOS) * OBJ_PASO;
  vistaLinea.scrollY = Math.max(0, Math.min(sobra, vistaLinea.scrollY));
}
const tAx = (s) => MARGEN + ((s - vistaLinea.desde) / ventana()) * (pistaW - MARGEN - 10);
const xAt = (x) => vistaLinea.desde + ((x - MARGEN) / (pistaW - MARGEN - 10)) * ventana();
// Objetos con carril propio: personajes, y cualquier cosa con movimiento o disparos.
const carriles = () => P.objetos.map((o, i) => [o, i]).filter(([o]) => o.tipo === "personaje" || o.claves?.length || o.disparos?.length);
const carrilY = (n) => OBJ_Y + n * OBJ_PASO - vistaLinea.scrollY;
function zoomLinea(f, centro = null) {
  const c = centro ?? (tiempo >= vistaLinea.desde && tiempo <= vistaLinea.desde + ventana() ? tiempo : vistaLinea.desde + ventana() / 2);
  const u = (c - vistaLinea.desde) / ventana();
  vistaLinea.zoom *= f; acotarVista();
  vistaLinea.desde = c - u * ventana(); acotarVista(); sucio = true;
}
// Que el cabezal no se salga de la vista al reproducir.
function seguirCabezal() {
  if (vistaLinea.zoom <= 1) return;
  if (tiempo < vistaLinea.desde || tiempo > vistaLinea.desde + ventana()) { vistaLinea.desde = tiempo - ventana() * 0.1; acotarVista(); }
}

function dibujarPistas() {
  acotarVista();
  const lanes = carriles(), vistos = Math.min(lanes.length, MAX_CARRILES_VISTOS);
  const altoCss = OBJ_Y + Math.max(1, vistos) * OBJ_PASO + 4;
  if (pistas.style.height !== altoCss + "px") pistas.style.height = altoCss + "px";
  const r = pistas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  if (pistas.width !== Math.round(r.width * dpr) || pistas.height !== Math.round(r.height * dpr)) { pistas.width = Math.round(r.width * dpr); pistas.height = Math.round(r.height * dpr); }
  pistaW = r.width;
  const g = pctx, d = duracion(), x0v = MARGEN, x1v = r.width - 10;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  g.fillStyle = "#07060b"; g.fillRect(0, 0, r.width, r.height);
  g.font = "11px system-ui"; g.textBaseline = "middle";
  for (const k of ["clave", "texto", "sonido"]) { g.fillStyle = "#16131c"; g.fillRect(x0v, FILAS[k][0], x1v - x0v, FILAS[k][1]); }
  // Carriles de objetos (con su nombre a la izquierda).
  g.save(); g.beginPath(); g.rect(0, OBJ_Y - 2, r.width, r.height - OBJ_Y + 2); g.clip();
  lanes.forEach(([o, oi], n) => {
    const y = carrilY(n), e = seleccion?.tipo === "objeto" && seleccion.i === oi;
    if (y + OBJ_ALTO < OBJ_Y - 2 || y > r.height) return;
    g.fillStyle = e ? "#1f2a33" : n % 2 ? "#121017" : "#16131c"; g.fillRect(x0v, y, x1v - x0v, OBJ_ALTO);
    g.fillStyle = e ? "#9ff" : "#a39886";
    g.save(); g.beginPath(); g.rect(0, y, MARGEN - 4, OBJ_ALTO); g.clip();
    g.fillText((o.nombre || o.id || nombreObj(o)), 6, y + OBJ_ALTO / 2); g.restore();
  });
  g.restore();
  // De aquí en adelante, todo lo que depende del tiempo se recorta a la vista.
  g.save(); g.beginPath(); g.rect(x0v, 0, x1v - x0v, r.height); g.clip();
  // Regla: el paso cambia con el zoom.
  const vent = ventana(), pasos = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const paso = pasos.find((p) => (p / vent) * (x1v - x0v) >= 60) || 60;
  g.fillStyle = "#a39886"; g.strokeStyle = "#3a3324";
  for (let s = Math.ceil(vistaLinea.desde / paso - 1e-6) * paso; s <= Math.min(d, vistaLinea.desde + vent) + 1e-6; s += paso) {
    const x = tAx(s);
    g.beginPath(); g.moveTo(x, 12); g.lineTo(x, r.height); g.stroke();
    g.fillText(paso < 1 ? mmssd(s) : mmss(s), x + 3, 7);
  }
  // Ruta de la cámara.
  const ks = claves();
  if (ks.length > 1) { g.fillStyle = "#4a3c1c"; g.fillRect(tAx(ks[0].t), FILAS.clave[0] + 10, tAx(ks.at(-1).t) - tAx(ks[0].t), 4); }
  ks.forEach((k, i) => {
    const x = tAx(k.t), y = FILAS.clave[0] + 12, e = seleccion?.tipo === "clave" && seleccion.i === i;
    g.fillStyle = e ? "#fff" : "#e0b34a";
    g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 7, y); g.lineTo(x, y + 8); g.lineTo(x - 7, y); g.closePath(); g.fill();
  });
  // Textos (si se enciman, van en dos renglones).
  filasTexto().forEach(([fila, alto], i) => {
    const tx = P.textos[i];
    const xa = tAx(tx.desde), xb = tAx(tx.hasta), e = seleccion?.tipo === "texto" && seleccion.i === i;
    const y0 = FILAS.texto[0] + 1 + fila * alto;
    g.fillStyle = e ? "#f3d48a" : "#8a6d2c";
    g.fillRect(xa, y0, Math.max(4, xb - xa), alto - 2);
    g.save(); g.beginPath(); g.rect(xa, y0, xb - xa, alto); g.clip();
    g.font = alto < 15 ? "9px system-ui" : "11px system-ui";
    g.fillStyle = e ? "#07060b" : "#f4efe4"; g.fillText(tx.texto || "…", Math.max(xa, x0v) + 5, y0 + alto / 2 - 1); g.restore();
  });
  g.font = "11px system-ui";
  // Sonidos.
  // Sonidos (si se enciman, van en hasta 3 renglones).
  const [filasS, altoS] = filasSonido();
  sonidos.forEach((s, i) => {
    const largo = s.buffer ? s.buffer.duration : 3;
    const xa = tAx(s.inicio || 0), xb = Math.min(tAx(d), tAx((s.inicio || 0) + largo)), e = seleccion?.tipo === "sonido" && seleccion.i === i;
    const y0 = FILAS.sonido[0] + 1 + filasS[i] * altoS;
    g.fillStyle = e ? "#e9c9a0" : s.buffer ? "#6b5640" : "#5a4040";
    g.fillRect(xa, y0, Math.max(4, xb - xa), altoS - 1);
    g.strokeStyle = "#07060b"; g.strokeRect(xa, y0, Math.max(4, xb - xa), altoS - 1);
    g.save(); g.beginPath(); g.rect(xa, y0, xb - xa, altoS); g.clip();
    g.font = altoS < 10 ? "8px system-ui" : altoS < 15 ? "9px system-ui" : "11px system-ui";
    g.fillStyle = e ? "#07060b" : "#f4efe4"; g.fillText(s.nombre, Math.max(xa, x0v) + 4, y0 + altoS / 2); g.restore();
  });
  g.font = "11px system-ui";
  // Carriles: tramos en movimiento, disparos y marcas de cada objeto.
  g.save(); g.beginPath(); g.rect(x0v, OBJ_Y - 2, x1v - x0v, r.height - OBJ_Y + 2); g.clip();
  lanes.forEach(([o, oi], n) => {
    const y = carrilY(n), yc = y + OBJ_ALTO / 2, e = seleccion?.tipo === "objeto" && seleccion.i === oi;
    if (y + OBJ_ALTO < OBJ_Y - 2 || y > r.height) return;
    const k = o.claves || [];
    for (let j = 0; j + 1 < k.length; j++) {
      const mueve = Math.hypot(k[j + 1].pos[0] - k[j].pos[0], k[j + 1].pos[1] - k[j].pos[1], k[j + 1].pos[2] - k[j].pos[2]) > 0.05;
      g.fillStyle = mueve ? (e ? "#2f8f8a" : "#245f5c") : "#2a2f35";
      g.fillRect(tAx(k[j].t), yc - 2, tAx(k[j + 1].t) - tAx(k[j].t), 4);
    }
    for (const dp of o.disparos || []) {
      g.fillStyle = "rgba(255,150,40,.75)";
      g.fillRect(tAx(dp.desde), y + 2, Math.max(3, tAx(dp.hasta) - tAx(dp.desde)), 4);
    }
    k.forEach((q) => {
      const x = tAx(q.t), sel = e && tirando?.k === q;
      g.fillStyle = sel ? "#fff" : e ? "#9ff" : "#3fb6b0";
      g.beginPath(); g.moveTo(x, yc - 7); g.lineTo(x + 6, yc); g.lineTo(x, yc + 7); g.lineTo(x - 6, yc); g.closePath(); g.fill();
      if (q.pose && vistaLinea.zoom >= 3) { g.fillStyle = "#cfc6b4"; g.font = "9px system-ui"; g.fillText(t("pose_" + q.pose) || q.pose, x + 8, yc); g.font = "11px system-ui"; }
    });
  });
  g.restore();
  // Cabezal.
  const x = tAx(tiempo);
  g.fillStyle = "#ff6b6b"; g.fillRect(x - 1, 0, 2, r.height);
  g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x + 6, 0); g.lineTo(x, 8); g.fill();
  g.restore();
  // Nombres de las filas fijas (encima de todo, a la izquierda).
  g.fillStyle = "#07060b"; g.fillRect(0, 0, MARGEN - 2, OBJ_Y - 2);
  g.fillStyle = "#a39886";
  g.fillText(t("tabCamara"), 6, FILAS.clave[0] + 12);
  g.fillText(t("tabTextos"), 6, FILAS.texto[0] + 11);
  g.fillText(t("tabSonido"), 6, FILAS.sonido[0] + 11);
  if (vistaLinea.zoom > 1) { g.fillStyle = "#e0b34a"; g.fillText(`×${vistaLinea.zoom < 10 ? vistaLinea.zoom.toFixed(1) : Math.round(vistaLinea.zoom)}`, 6, 8); }
  // Barra para moverse de lado cuando hay zoom.
  if (vistaLinea.zoom > 1) {
    const a = x0v + (vistaLinea.desde / d) * (x1v - x0v), b = a + (x1v - x0v) / vistaLinea.zoom;
    g.fillStyle = "#2a2433"; g.fillRect(x0v, r.height - 3, x1v - x0v, 3);
    g.fillStyle = "#e0b34a"; g.fillRect(a, r.height - 3, Math.max(6, b - a), 3);
  }
  if (lanes.length > MAX_CARRILES_VISTOS) {
    const total = lanes.length * OBJ_PASO, h = r.height - OBJ_Y, a = OBJ_Y + (vistaLinea.scrollY / total) * h;
    g.fillStyle = "#e0b34a"; g.fillRect(r.width - 4, a, 3, Math.max(8, (MAX_CARRILES_VISTOS / lanes.length) * h));
  }
}

function filasTexto() {
  const fin = [];
  const filas = P.textos.map((tx) => { let f = fin.findIndex((h) => h <= tx.desde + 0.01); if (f < 0 || f > 1) f = fin.length > 1 ? 1 : fin.length; fin[f] = tx.hasta; return f; });
  const alto = filas.some((f) => f > 0) ? (FILAS.texto[1] - 2) / 2 : FILAS.texto[1] - 2;
  return filas.map((f) => [f, alto]);
}
function filasSonido() {
  const fin = [];
  const filas = sonidos.map((so) => {
    const a = so.inicio || 0, b = a + (so.buffer ? so.buffer.duration : 3);
    let f = fin.findIndex((h) => h <= a + 0.01);
    if (f < 0) f = fin.length < 3 ? fin.length : fin.indexOf(Math.min(...fin));
    fin[f] = b; return f;
  });
  return [filas, (FILAS.sonido[1] - 2) / Math.max(1, fin.length)];
}
let tirando = null;
const carrilEn = (y) => { if (y < OBJ_Y - 1) return null; const n = Math.floor((y - OBJ_Y + vistaLinea.scrollY) / OBJ_PASO); const l = carriles()[n]; return l && y - carrilY(n) <= OBJ_ALTO + 1 ? l : null; };
pistas.addEventListener("pointerdown", (e) => {
  const r = pistas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  pistas.setPointerCapture(e.pointerId);
  const dentro = (f) => y >= FILAS[f][0] && y <= FILAS[f][0] + FILAS[f][1];
  tirando = { tipo: "cabezal" };
  const carril = carrilEn(y);
  if (y < FILAS.regla[1] && vistaLinea.zoom > 1 && (e.button === 1 || e.shiftKey)) { tirando = { tipo: "vista", x0: x, d0: vistaLinea.desde }; return; }
  if (x < MARGEN) {
    // Clic en el nombre de un carril: elige el objeto.
    if (carril) { elegirObjeto(carril[1]); if (pestana !== "objetos") pestana = "objetos"; construirPanel(); }
    tirando = null; sucio = true; return;
  }
  if (dentro("clave")) {
    const i = claves().findIndex((k) => Math.abs(tAx(k.t) - x) < 9);
    if (i >= 0) { seleccion = { tipo: "clave", i }; tirando = { tipo: "clave", k: claves()[i], dx: x - tAx(claves()[i].t) }; }
  } else if (dentro("texto")) {
    const i = P.textos.findIndex((tx) => x >= tAx(tx.desde) - 5 && x <= tAx(tx.hasta) + 5);
    if (i >= 0) {
      const tx = P.textos[i];
      const borde = Math.abs(x - tAx(tx.desde)) < 7 ? "desde" : Math.abs(x - tAx(tx.hasta)) < 7 ? "hasta" : "mover";
      seleccion = { tipo: "texto", i }; tirando = { tipo: "texto", tx, borde, t0: xAt(x), d0: tx.desde, h0: tx.hasta };
      if (pestana !== "textos") pestana = "textos";
      construirPanel();
    }
  } else if (carril) {
    const [o, oi] = carril;
    const k = (o.claves || []).find((q) => Math.abs(tAx(q.t) - x) < 8);
    if (k) { elegirObjeto(oi); tirando = { tipo: "objclave", o, k }; if (pestana !== "objetos") pestana = "objetos"; construirPanel(); }
    else {
      const dp = (o.disparos || []).find((q) => x >= tAx(q.desde) - 4 && x <= tAx(q.hasta) + 4 && y - carrilY(carriles().indexOf(carril)) < 8);
      if (dp) {
        const borde = Math.abs(x - tAx(dp.desde)) < 6 ? "desde" : Math.abs(x - tAx(dp.hasta)) < 6 ? "hasta" : "mover";
        elegirObjeto(oi); tirando = { tipo: "disparo", dp, borde, t0: xAt(x), d0: dp.desde, h0: dp.hasta }; if (pestana !== "objetos") pestana = "objetos"; construirPanel();
      } else if (!(seleccion?.tipo === "objeto" && seleccion.i === oi)) { elegirObjeto(oi); if (pestana !== "objetos") pestana = "objetos"; construirPanel(); }
    }
  } else if (dentro("sonido")) {
    const [filasS, altoS] = filasSonido(), fila = Math.floor((y - FILAS.sonido[0] - 1) / altoS);
    const i = sonidos.findIndex((s, k) => filasS[k] === fila && x >= tAx(s.inicio || 0) && x <= tAx((s.inicio || 0) + (s.buffer?.duration || 3)));
    if (i >= 0) { seleccion = { tipo: "sonido", i }; tirando = { tipo: "sonido", s: sonidos[i], t0: xAt(x), i0: sonidos[i].inicio || 0 }; if (pestana !== "sonido") { pestana = "sonido"; construirPanel(); } }
  }
  if (tirando.tipo === "cabezal") { if (reproduciendo) pausar(); irATiempo(xAt(x)); }
  sucio = true;
});
pistas.addEventListener("pointermove", (e) => {
  const r = pistas.getBoundingClientRect(), x = e.clientX - r.left;
  if (!tirando) {
    const y = e.clientY - r.top;
    const enBorde = y >= FILAS.texto[0] && y <= FILAS.texto[0] + FILAS.texto[1] && P.textos.some((tx) => Math.abs(x - tAx(tx.desde)) < 7 || Math.abs(x - tAx(tx.hasta)) < 7);
    pistas.style.cursor = enBorde ? "ew-resize" : x < MARGEN && carrilEn(y) ? "default" : "pointer";
    return;
  }
  const s = Math.max(0, Math.min(duracion(), xAt(x)));
  // Con más zoom se puede acomodar más fino (hasta centésimas).
  const fino = vistaLinea.zoom >= 8 ? 100 : vistaLinea.zoom >= 3 ? 20 : 10;
  const q = (v) => Math.round(v * fino) / fino;
  if (tirando.tipo === "vista") { vistaLinea.desde = tirando.d0 - ((x - tirando.x0) / (pistaW - MARGEN - 10)) * ventana(); acotarVista(); }
  else if (tirando.tipo === "cabezal") irATiempo(s);
  else if (tirando.tipo === "clave") { tirando.k.t = q(Math.max(0, Math.min(duracion(), xAt(x - tirando.dx)))); claves().sort((a, b) => a.t - b.t); seleccion = { tipo: "clave", i: claves().indexOf(tirando.k) }; irATiempo(tirando.k.t); }
  else if (tirando.tipo === "objclave") { tirando.k.t = q(s); tirando.o.claves.sort((a, b) => a.t - b.t); irATiempo(tirando.k.t); }
  else if (tirando.tipo === "disparo") {
    const dp = tirando.dp, dd = s - tirando.t0;
    if (tirando.borde === "desde") dp.desde = q(Math.min(s, dp.hasta - 0.1));
    else if (tirando.borde === "hasta") dp.hasta = q(Math.max(s, dp.desde + 0.1));
    else { const largo = tirando.h0 - tirando.d0; dp.desde = q(Math.max(0, Math.min(duracion() - largo, tirando.d0 + dd))); dp.hasta = q(dp.desde + largo); }
    irATiempo(s);
  }
  else if (tirando.tipo === "texto") {
    const tx = tirando.tx, dd = s - tirando.t0;
    if (tirando.borde === "desde") tx.desde = q(Math.min(s, tx.hasta - 0.3));
    else if (tirando.borde === "hasta") tx.hasta = q(Math.max(s, tx.desde + 0.3));
    else { const largo = tirando.h0 - tirando.d0; tx.desde = q(Math.max(0, Math.min(duracion() - largo, tirando.d0 + dd))); tx.hasta = q(tx.desde + largo); }
  } else if (tirando.tipo === "sonido") tirando.s.inicio = q(Math.max(-600, tirando.i0 + s - tirando.t0));
  sucio = true;
});
pistas.addEventListener("pointerup", () => { if (tirando && !["cabezal", "vista"].includes(tirando.tipo)) construirPanel(); tirando = null; });
// Rueda: con Ctrl (o el pellizco del touchpad) hace zoom donde está el mouse;
// sola o con Shift se mueve de lado; sobre los carriles con más de 7 objetos, sube y baja.
pistas.addEventListener("wheel", (e) => {
  const r = pistas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) { zoomLinea(Math.exp(-e.deltaY * 0.002), x >= MARGEN ? xAt(x) : null); return; }
  const hayScrollY = carriles().length > MAX_CARRILES_VISTOS && y >= OBJ_Y && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX);
  if (hayScrollY) { vistaLinea.scrollY += e.deltaY * 0.5; acotarVista(); sucio = true; return; }
  if (vistaLinea.zoom <= 1) return;
  const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  vistaLinea.desde += (dx / (pistaW - MARGEN - 10)) * ventana(); acotarVista(); sucio = true;
}, { passive: false });
$("bZoomMas").onclick = () => zoomLinea(1.6);
$("bZoomMenos").onclick = () => zoomLinea(1 / 1.6);
$("bZoomTodo").onclick = () => { vistaLinea.zoom = 1; vistaLinea.desde = 0; sucio = true; };

function actualizarTiempo() {
  $("tiempo").textContent = `${mmssd(tiempo)} / ${mmss(duracion())}`;
}
function cambiarDuracion(d) {
  P.camara.duracion = Math.max(1, Math.min(600, d));
  tiempo = Math.min(tiempo, P.camara.duracion);
  actualizarTiempo(); sucio = true;
}

// ---------- Botones ----------
$("bPlay").onclick = () => (reproduciendo ? pausar() : reproducir());
$("bMenos").onclick = () => cambiarDuracion(duracion() - 1);
$("bMas").onclick = () => cambiarDuracion(duracion() + 1);
$("bAbrirMapa").onclick = $("bElegir").onclick = $("bAbrirProyecto").onclick = () => $("archivo").click();
$("archivo").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) abrirArchivo(f); };
$("archivoAudio").onchange = (e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) agregarAudios(fs); else audioPara = null; };
$("bGuardar").onclick = guardarProyecto;
$("bFoto").onclick = foto;
$("bExportar").onclick = dialogoExportar;
function abrirMenu(boton, menu) {
  const abrir = $(menu).hidden;
  for (const [b, m] of [["bArchivo", "menuArchivo"], ["bEjemplos", "menuEjemplos"]]) { $(m).hidden = true; $(b).setAttribute("aria-expanded", "false"); }
  $(menu).hidden = !abrir; $(boton).setAttribute("aria-expanded", String(abrir));
}
$("bEjemplos").onclick = () => abrirMenu("bEjemplos", "menuEjemplos");
$("bArchivo").onclick = () => abrirMenu("bArchivo", "menuArchivo");
$("menuArchivo").addEventListener("click", (e) => { if (e.target.closest("button")) $("menuArchivo").hidden = true; });
$("bProbar").onclick = () => abrirEjemplo(EJEMPLOS[0]);
$("bTextoMapa").onclick = $("bPegar").onclick = dialogoTexto;
$("bIdioma").onclick = () => { cambiarIdioma(idiomaActual() === "es" ? "en" : "es"); construirUI(); sucio = true; };
$("bAyuda").onclick = () => dialogoAtajos();
$("bDeshacer").onclick = () => deshacer();
$("bRehacer").onclick = () => rehacerCambio();
$("bCompartir").onclick = () => compartirProyecto();
$("bPlantillas").onclick = () => { if (!mapaJSON) return aviso(t("abreMapaPrimero"), 4000); dialogoPlantillas(); };

// Arrastrar y soltar: mapas, proyectos y audio.
let capas = 0;
addEventListener("dragenter", (e) => { e.preventDefault(); capas++; $("soltar").hidden = false; });
addEventListener("dragleave", () => { if (--capas <= 0) { capas = 0; $("soltar").hidden = true; } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => {
  e.preventDefault(); capas = 0; $("soltar").hidden = true;
  const fs = [...e.dataTransfer.files];
  const audio = fs.filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name));
  const json = fs.find((f) => /\.json$/i.test(f.name));
  if (json) abrirArchivo(json);
  if (audio.length) agregarAudios(audio);
});

// ---------- Deshacer y rehacer ----------
// Cada cambio del proyecto queda en una lista (hasta 80 pasos). Los textos muy
// largos (skins, modelos, audio) se guardan una sola vez y se comparten.
const pesados = new Map(); let nPesado = 0;
const aFoto = () => JSON.stringify(P, (k, v) => {
  if (typeof v !== "string" || v.length < 4000) return v;
  if (!pesados.has(v)) pesados.set(v, "@@" + nPesado++);
  return pesados.get(v);
});
const deFoto = (txt) => { const inv = new Map([...pesados].map(([a, b]) => [b, a])); return JSON.parse(txt, (k, v) => (typeof v === "string" && v.startsWith("@@") && inv.has(v) ? inv.get(v) : v)); };
const historial = { pasos: [], i: -1, ultimo: "" };
function anotar() {
  if (!mapaJSON || reproduciendo || arrastre || arrastreTexto || tirando) return;
  const f = aFoto();
  if (f === historial.ultimo) return;
  historial.pasos = historial.pasos.slice(0, historial.i + 1);
  historial.pasos.push(f); if (historial.pasos.length > 80) historial.pasos.shift();
  historial.i = historial.pasos.length - 1; historial.ultimo = f;
  guardarAuto();
}
async function irAPaso(i) {
  if (i < 0 || i >= historial.pasos.length) return aviso(t(i < 0 ? "nadaDeshacer" : "nadaRehacer"));
  historial.i = i; historial.ultimo = historial.pasos[i];
  const nuevo = deFoto(historial.pasos[i]);
  for (const k of Object.keys(P)) if (!(k in nuevo)) delete P[k];
  Object.assign(P, nuevo);
  seleccion = null; elegirObjeto(null);
  motor.ajustar(P.escena);
  await motor.ponerObjetos(P.objetos);
  irATiempo(tiempo); construirPanel(); sucio = true;
}
const deshacer = () => irAPaso(historial.i - 1), rehacerCambio = () => irAPaso(historial.i + 1);
setInterval(anotar, 600);

// ---------- Guardado automático ----------
// El proyecto (con su mapa) se guarda solo en este navegador. Al abrir el
// estudio pregunta si quieres seguir donde te quedaste.
const BD = () => new Promise((ok, mal) => { const r = indexedDB.open("rite-studio", 1); r.onupgradeneeded = () => r.result.createObjectStore("auto"); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
async function bdHacer(modo, fn) { const db = await BD(); return new Promise((ok, mal) => { const tr = db.transaction("auto", modo); const q = fn(tr.objectStore("auto")); tr.oncomplete = () => ok(q?.result); tr.onerror = () => mal(tr.error); }); }
let autoPendiente = null;
function guardarAuto() {
  clearTimeout(autoPendiente);
  autoPendiente = setTimeout(async () => {
    try {
      const { script___DATA, ...mapa } = mapaJSON;
      await bdHacer("readwrite", (st) => st.put({ fecha: Date.now(), proyecto: JSON.parse(aFotoCompleta()), mapa, sonidos: sonidos.map(({ nombre, inicio, volumen, bytes }) => ({ nombre, inicio, volumen, bytes })) }, "ultimo"));
    } catch { /* sin espacio o sin permiso: no pasa nada */ }
  }, 1500);
}
const aFotoCompleta = () => JSON.stringify({ ...P, camara: { ...P.camara, fija: camAVista() } });
async function ofrecerSeguir() {
  let g = null;
  try { g = await bdHacer("readonly", (st) => st.get("ultimo")); } catch { return; }
  if (!g || !g.mapa || mapaJSON) return;
  const fecha = new Date(g.fecha).toLocaleString(idiomaActual() === "es" ? "es-MX" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  const caja = el("div", { class: "seguir" },
    el("div", {}, el("b", {}, t("seguirDonde")), el("div", { class: "nota" }, `${g.proyecto?.nombre || g.proyecto?.mapaNombre || t("sinNombre")} · ${fecha}`)),
    el("button", { class: "b principal", onclick: async () => {
      caja.remove(); $("cargando").hidden = false;
      try {
        await abrirProyecto({ ...g.proyecto, mapa: g.mapa, sonidos: [] });
        for (const s of g.sonidos || []) if (s.bytes) { try { const buffer = await audioCtx().decodeAudioData(s.bytes.slice(0)); sonidos.push({ ...s, buffer }); } catch { /* sin sonido */ } }
        construirPanel(); sucio = true;
      } finally { $("cargando").hidden = true; }
    } }, t("seguir")),
    el("button", { class: "b", onclick: () => caja.remove() }, ico("cerrar", 14)));
  $("vacio").append(caja);
}

// ---------- Atajos y primer uso ----------
const ATAJOS = [["Ctrl+Z", "deshacer"], ["Ctrl+Y / Ctrl+Shift+Z", "rehacer"], ["Ctrl+S", "guardar"], ["Ctrl+D", "duplicar"], ["P", "reproducirPausar"], ["K", "guardarEncuadre"], ["F", "foto"], ["← →", "unCuadro"], ["Supr", "borrarElegido"], ["G / R / T", "moverGirarTamano"], ["Esc", "soltarElegido"], ["WASD", "moverCamara"], ["Espacio / C", "subirBajar"], ["?", "verAtajos"]];
function dialogoAtajos() {
  const d = $("dlgAtajos");
  d.replaceChildren(el("h2", {}, "⌨ " + t("atajos")),
    el("div", { class: "atajos" }, ATAJOS.flatMap(([k, v]) => [el("kbd", {}, k), el("span", {}, t(v))])),
    el("div", { class: "dosBotones" }, el("button", { class: "b", onclick: () => { d.close(); guia(0); } }, conIco("guia", t("verGuia"))), el("button", { class: "b principal", onclick: () => d.close() }, t("cerrar"))));
  if (!d.open) d.showModal();
}
const PASOS_GUIA = ["guia1", "guia2", "guia3", "guia4", "guia5"];
function guia(n) {
  const d = $("dlgAtajos");
  if (n >= PASOS_GUIA.length) { d.close(); try { localStorage.setItem("rite-studio-guia", "1"); } catch {} return; }
  d.replaceChildren(el("div", { class: "nota" }, `${n + 1} / ${PASOS_GUIA.length}`), el("h2", {}, t(PASOS_GUIA[n] + "t")), el("p", {}, t(PASOS_GUIA[n] + "d")),
    el("div", { class: "dosBotones" }, el("button", { class: "b", onclick: () => { d.close(); try { localStorage.setItem("rite-studio-guia", "1"); } catch {} } }, t("saltar")), el("button", { class: "b principal", onclick: () => guia(n + 1) }, n + 1 < PASOS_GUIA.length ? t("siguiente") : t("listo"))));
  if (!d.open) d.showModal();
}
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  const hecho = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (ctrl && k === "s") { hecho(); guardarProyecto(); return; }
  if (enCampo() || document.querySelector("dialog[open]")) return;
  if (ctrl && k === "z" && !e.shiftKey) { hecho(); deshacer(); }
  else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { hecho(); rehacerCambio(); }
  else if (ctrl && k === "d") { hecho(); duplicarSeleccion(); }
  else if (e.key === "?") { hecho(); dialogoAtajos(); }
}, true);
function duplicarSeleccion() {
  if (seleccion?.tipo === "texto") { const tx = P.textos[seleccion.i], c = structuredClone(tx); c.desde = tx.hasta; c.hasta = Math.min(duracion(), tx.hasta + (tx.hasta - tx.desde)); P.textos.push(c); seleccion = { tipo: "texto", i: P.textos.length - 1 }; construirPanel(); sucio = true; }
  else if (objElegido()) { const d = objElegido(), c = structuredClone(d); c.id = nuevoId(); c.pos = [d.pos[0] + 1.5, d.pos[1], d.pos[2]]; c.claves = []; P.objetos.push(c); motor.ponerObjetos(P.objetos).then(() => { elegirObjeto(P.objetos.length - 1); construirPanel(); }); }
}

// ---------- Plantillas ----------
// Arman cámara, textos y formato listos sobre el mapa abierto; después se cambia lo que quieras.
const toma = (mov, dur) => { P.camara.duracion = dur; P.camara.claves = MOVIMIENTOS[mov](camAVista(), dur).map((k) => ({ ...k, giro: 0 })); };
const PLANTILLAS = {
  intro: () => { P.salida.formato = "16:9"; toma("acercar", 6);
    P.textos = [{ texto: (P.nombre || "MI CANAL").toUpperCase(), estilo: "kirka", entrada: "rebote", desde: 0.5, hasta: 5.5 }, { texto: t("plSuscribete"), estilo: "etiqueta", entrada: "deslizarD", desde: 2, hasta: 5.8, pos: [0.5, 0.72] }]; },
  mapa: () => { P.salida.formato = "16:9"; toma("orbita", 12); Object.assign(P.filtros, FILTROS.cine, { preset: "cine" });
    P.textos = [{ texto: P.mapaNombre || "MAPA", estilo: "cine", desde: 0.5, hasta: 5 }, { texto: "Kirka.io", estilo: "pequeno", desde: 1, hasta: 11.5, pos: [0.5, 0.9] }]; },
  short: () => { P.salida.formato = "9:16"; toma("arco", 8);
    P.textos = [{ texto: t("plShort"), estilo: "youtube", entrada: "crecer", desde: 0.2, hasta: 3.5, pos: [0.5, 0.2] }, { texto: t("plSigue"), estilo: "comic", entrada: "rebote", desde: 4.5, hasta: 7.8, pos: [0.5, 0.78] }]; },
  meme: () => { P.salida.formato = "1:1"; toma("lateral", 5);
    P.textos = [{ texto: t("plMemeArriba"), estilo: "meme", desde: 0, hasta: 5, pos: [0.5, 0.1] }, { texto: t("plMemeAbajo"), estilo: "meme", desde: 0, hasta: 5, pos: [0.5, 0.9] }]; },
};
function dialogoPlantillas() {
  const d = $("dlgAtajos");
  d.replaceChildren(el("h2", {}, t("plantillas")), el("p", { class: "nota" }, t("plantillasD")),
    el("div", { class: "rejillaPlantillas" }, Object.keys(PLANTILLAS).map((k) => el("button", { class: "b", onclick: async () => {
      if ((claves().length || P.textos.length) && !confirm(t("plReemplazar"))) return;
      PLANTILLAS[k](); d.close(); dimensionar(); libre = false; irATiempo(0); construirPanel(); sucio = true; aviso(t("pl_" + k));
    } }, el("b", {}, t("pl_" + k)), el("small", {}, t("pl_" + k + "D"))))),
    el("button", { class: "b", onclick: () => d.close() }, t("cerrar")));
  if (!d.open) d.showModal();
}

construirUI();
dimensionar();
abrirCompartido().then((si) => { if (!si) ofrecerSeguir(); });
cargarFuentes().then(() => { sucio = true; });
// Cuando termina de cargar la imagen de una skin, se vuelve a dibujar.
addEventListener("rite-textura", () => { sucio = true; });
// Para pruebas automáticas.
window.RITE = { get P() { return P; }, get motor() { return motor; }, abrirEjemplo: (i) => abrirEjemplo(EJEMPLOS[i]), irATiempo, opacidadTexto };
