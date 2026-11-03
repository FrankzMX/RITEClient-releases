// Arma el cuadro final en un canvas 2D: la imagen 3D con filtros, viñeta,
// grano, barras de cine, textos y fundidos. Lo mismo en la vista previa, en
// las fotos y en el video, así lo que ves es lo que sale.

// Fuentes incluidas (carpeta fuentes/). Todas con licencia libre.
export const FUENTES = [
  ["Oswald", "oswald", "700"], ["Anton", "anton"], ["Bebas Neue", "bebas-neue"], ["Bungee", "bungee"],
  ["Bangers", "bangers"], ["Press Start 2P", "press-start-2p"], ["Orbitron", "orbitron", "700"],
  ["Creepster", "creepster"], ["Nosifer", "nosifer"], ["Cinzel", "cinzel", "700"],
  ["Fredoka", "fredoka", "700"], ["Permanent Marker", "permanent-marker"],
];
// Carga las fuentes (las incluidas y las que subió el usuario) antes de dibujar.
const cargadas = new Map();
export function cargarFuentes(propias = [], base = "") {
  const lista = [...FUENTES.map(([n, a, w]) => [n, `url(${base}fuentes/${a}.woff2)`, w || "400"]),
    ...(propias || []).filter((f) => f && /^[\w \-]{1,40}$/.test(f.nombre || "") && /^data:(font|application)\/[\w.+-]+;base64,/.test(f.datos || "")).map((f) => [f.nombre, `url(${f.datos})`, "400"])];
  return Promise.all(lista.map(([n, src, w]) => {
    const k = n + "|" + src.length;
    if (!cargadas.has(k)) {
      const ff = new FontFace(n, src, { weight: w === "700" ? "100 900" : "400" });
      cargadas.set(k, ff.load().then((f) => { document.fonts.add(f); return f; }).catch(() => null));
    }
    return cargadas.get(k);
  }));
}

// Estilos listos: cada uno llena varias opciones de un clic. Después se puede
// cambiar cualquier cosa del texto.
const BASE = { y: 0.5, tam: 0.08, color: "#ffffff", color2: null, borde: 0.1, colorBorde: "#000000", sombra: 0, brillo: 0, colorBrillo: "#ffffff",
  fuente: "Oswald", espacio: 0, mayus: false, alinear: "centro", fondo: null, efecto: "ninguno", entrada: "fundido", salida: "fundido", durAnim: 0.4, giro: 0 };
export const ESTILOS = {
  subtitulo: { y: 0.88, tam: 0.05, color: "#ffffff", borde: 0.12 },
  titulo: { y: 0.5, tam: 0.14, color: "#ffd75e", borde: 0.1, espacio: 0.12, brillo: 0.5, colorBrillo: "#ffbe3c" },
  pequeno: { y: 0.1, tam: 0.045, color: "#ffffff", borde: 0.12, alinear: "izq" },
  terror: { y: 0.5, tam: 0.16, color: "#8dff2e", borde: 0.08, fuente: "Creepster", brillo: 0.6, colorBrillo: "#78ff28", efecto: "temblor" },
  youtube: { y: 0.82, tam: 0.11, color: "#ffffff", borde: 0.14, fuente: "Anton", mayus: true, sombra: 0.8, entrada: "rebote", salida: "fundido" },
  kirka: { y: 0.5, tam: 0.13, color: "#ffd75e", color2: "#ff7a1a", borde: 0.1, colorBorde: "#1a0b00", fuente: "Bungee", sombra: 0.7, entrada: "zoom", salida: "zoom" },
  neon: { y: 0.5, tam: 0.12, color: "#ffffff", borde: 0.04, colorBorde: "#ff2bd6", fuente: "Orbitron", brillo: 1, colorBrillo: "#ff2bd6", efecto: "brillo", entrada: "parpadeo", salida: "fundido" },
  cine: { y: 0.5, tam: 0.09, color: "#f2efe6", borde: 0, fuente: "Cinzel", espacio: 0.35, mayus: true, sombra: 0.5, entrada: "desenfoque", salida: "desenfoque", durAnim: 1.2 },
  arcade: { y: 0.3, tam: 0.07, color: "#ffe14d", color2: "#ff4d4d", borde: 0.12, fuente: "Press Start 2P", efecto: "ola", entrada: "maquina", salida: "fundido" },
  meme: { y: 0.12, tam: 0.1, color: "#ffffff", borde: 0.16, fuente: "Anton", mayus: true, entrada: "corte", salida: "corte" },
  comic: { y: 0.25, tam: 0.12, color: "#fff23a", borde: 0.14, fuente: "Bangers", espacio: 0.06, sombra: 1, giro: -6, entrada: "rebote", salida: "crecer", efecto: "latido" },
  sangre: { y: 0.5, tam: 0.11, color: "#d40f0f", color2: "#5a0000", borde: 0.06, fuente: "Nosifer", brillo: 0.5, colorBrillo: "#ff0000", entrada: "caer", salida: "fundido", efecto: "temblor" },
  fiesta: { y: 0.5, tam: 0.13, color: "#ffffff", borde: 0.1, fuente: "Fredoka", efecto: "arcoiris", entrada: "letras", salida: "fundido" },
  firma: { y: 0.86, tam: 0.07, color: "#ffffff", borde: 0.06, fuente: "Permanent Marker", alinear: "der", sombra: 0.6, entrada: "deslizarD", salida: "deslizarD" },
  etiqueta: { y: 0.9, tam: 0.045, color: "#111111", borde: 0, fuente: "Bebas Neue", espacio: 0.08, fondo: "#ffd75e", alinear: "izq", entrada: "deslizarI", salida: "deslizarI" },
  glitch: { y: 0.5, tam: 0.12, color: "#ffffff", borde: 0.05, fuente: "Bebas Neue", efecto: "glitch", entrada: "corte", salida: "corte", espacio: 0.1 },
};
export const EFECTOS = ["ninguno", "brillo", "parpadeo", "temblor", "ola", "arcoiris", "latido", "glitch", "flotar"];
export const ENTRADAS = ["fundido", "corte", "deslizarI", "deslizarD", "subir", "caer", "crecer", "zoom", "rebote", "desenfoque", "maquina", "letras", "parpadeo"];
// Lo que se usa al dibujar: el estilo de base más lo que se cambió a mano.
export function estiloDe(tx) {
  const e = { ...BASE, ...(ESTILOS[tx.estilo] || ESTILOS.subtitulo) };
  for (const k of Object.keys(BASE)) if (tx[k] != null) e[k] = tx[k];
  return e;
}

let granos = null;
function grano(semilla) {
  if (!granos) {
    granos = Array.from({ length: 6 }, (_, k) => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d"), d = g.createImageData(256, 256);
      let s = 1234 + k * 999;
      for (let i = 0; i < d.data.length; i += 4) {
        s = (s * 16807) % 2147483647;
        const v = (s / 2147483647) * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
      return c;
    });
  }
  return granos[semilla % granos.length];
}

// Opacidad de un texto en el segundo t (para saber si se ve).
export function opacidadTexto(tx, t) {
  if (t < tx.desde || t > tx.hasta) return 0;
  const f = Math.min(estiloDe(tx).durAnim || 0.4, (tx.hasta - tx.desde) / 3);
  return Math.max(0, Math.min(1, (t - tx.desde) / f, (tx.hasta - t) / f));
}

// Dónde quedó cada texto en el último cuadro (para arrastrarlo con el mouse).
export const cajasTexto = new WeakMap();
const sube = (x) => 1 - Math.pow(1 - x, 3);
const rebota = (x) => { const c = 1.70158 * 1.525; return x < 1 ? 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2) : 1; };
const azar = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function dibujarTexto(ctx, tx, t, W, H, f) {
  const e = estiloDe(tx);
  const dur = tx.hasta - tx.desde, dA = Math.max(0.05, Math.min(e.durAnim || 0.4, dur / 3));
  const pin = Math.max(0, Math.min(1, (t - tx.desde) / dA)), pout = Math.max(0, Math.min(1, (tx.hasta - t) / dA));
  const entrando = pin < 1, p = entrando ? pin : pout, modo = entrando ? e.entrada : e.salida;
  const lado = Math.min(W, H);
  const tam = lado * e.tam * (tx.tamano ? Math.pow(2, tx.tamano) : 1);
  let texto = String(tx.texto); if (e.mayus) texto = texto.toUpperCase();
  const lineas = texto.split("\n");
  const fam = `"${e.fuente}", Oswald, Impact, sans-serif`;
  ctx.font = `700 ${tam}px ${fam}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  const esp = tam * (e.espacio || 0);
  const anchos = lineas.map((l) => [...l].map((c) => ctx.measureText(c).width));
  const anchoL = anchos.map((a) => a.reduce((s, w) => s + w, 0) + Math.max(0, a.length - 1) * esp);
  const ancho = Math.max(1, ...anchoL), alto = lineas.length * tam * 1.12;
  const pos = tx.pos || [e.alinear === "izq" ? 0.05 + (ancho / W) / 2 : e.alinear === "der" ? 0.95 - (ancho / W) / 2 : 0.5, e.y];
  let cx = pos[0] * W, cy = pos[1] * H;
  if (!tx.pos && f.barras && tx.estilo === "subtitulo") cy = Math.min(cy, H - Math.max(0, (H - W / 2.39) / 2) - tam * 0.8);
  // Entrada y salida.
  let alfa = 1, dx = 0, dy = 0, esc = 1, borroso = 0, visibles = Infinity, porLetra = null;
  const q = sube(p);
  switch (modo) {
    case "corte": alfa = p > 0 ? 1 : 0; break;
    case "deslizarI": dx = -(1 - q) * (W * 0.6); alfa = q; break;
    case "deslizarD": dx = (1 - q) * (W * 0.6); alfa = q; break;
    case "subir": dy = (1 - q) * tam * 1.5; alfa = q; break;
    case "caer": dy = -(1 - (entrando ? rebota(p) : q)) * H * 0.5; alfa = Math.min(1, p * 3); break;
    case "crecer": esc = q; alfa = q; break;
    case "zoom": esc = 1 + (1 - q) * 3; alfa = q; break;
    case "rebote": esc = entrando ? Math.max(0, rebota(p)) : q; alfa = Math.min(1, p * 2); break;
    case "desenfoque": borroso = (1 - q) * tam * 0.4; alfa = q; esc = 1 + (1 - q) * 0.15; break;
    case "maquina": visibles = Math.floor(p * [...texto.replace(/\n/g, "")].length + 1e-6); break;
    case "letras": porLetra = p; break;
    case "parpadeo": alfa = p >= 1 ? 1 : (Math.floor(p * 12) % 2 ? 1 : 0.15) * p; break;
    default: alfa = p;
  }
  // Efecto que se repite mientras está en pantalla.
  const u = t - tx.desde;
  let brillo = e.brillo || 0;
  if (e.efecto === "brillo") brillo = Math.max(brillo, 0.4) * (0.65 + 0.35 * Math.sin(u * 5));
  if (e.efecto === "parpadeo") alfa *= Math.sin(u * 9) > -0.3 ? 1 : 0.2;
  if (e.efecto === "latido") esc *= 1 + 0.06 * Math.max(0, Math.sin(u * 7));
  if (e.efecto === "flotar") dy += Math.sin(u * 2) * tam * 0.15;
  if (alfa <= 0.001 || esc <= 0.001) { cajasTexto.set(tx, null); return; }
  ctx.save();
  ctx.globalAlpha *= alfa;
  ctx.translate(cx + dx, cy + dy);
  ctx.rotate(((e.giro || 0) * Math.PI) / 180);
  ctx.scale(esc, esc);
  if (borroso > 0.3) ctx.filter = `blur(${borroso}px)`;
  ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.lineJoin = "round";
  // Fondo tipo etiqueta.
  if (e.fondo) {
    const px = tam * 0.35, py = tam * 0.18;
    ctx.fillStyle = e.fondo;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-ancho / 2 - px, -alto / 2 - py, ancho + px * 2, alto + py * 2, tam * 0.15);
    else ctx.rect(-ancho / 2 - px, -alto / 2 - py, ancho + px * 2, alto + py * 2);
    ctx.fill();
  }
  // Letra por letra: posición, color y si ya apareció.
  const total = [...texto.replace(/\n/g, "")].length;
  const letras = [];
  let n = 0;
  lineas.forEach((l, i) => {
    const y = -alto / 2 + tam * 1.12 * (i + 0.5);
    let x = e.alinear === "izq" ? -ancho / 2 : e.alinear === "der" ? ancho / 2 - anchoL[i] : -anchoL[i] / 2;
    [...l].forEach((c, j) => { letras.push({ c, x, y, n, w: anchos[i][j] }); x += anchos[i][j] + esp; n++; });
  });
  const pasos = [];
  for (const L of letras) {
    if (L.n >= visibles) break;
    let ox = 0, oy = 0, a = 1, s = 1, color = null;
    if (porLetra != null) { const k = Math.max(0, Math.min(1, porLetra * (total + 4) / 5 - L.n / 5)); s = entrando ? Math.max(0, rebota(k)) : sube(k); a = Math.min(1, k * 2); oy = (1 - k) * -tam * 0.6; }
    if (e.efecto === "ola") oy += Math.sin(u * 6 - L.n * 0.5) * tam * 0.12;
    if (e.efecto === "temblor") { const fr = Math.floor(u * 24); ox += (azar(fr * 31 + L.n) - 0.5) * tam * 0.07; oy += (azar(fr * 17 + L.n * 3) - 0.5) * tam * 0.07; }
    if (e.efecto === "arcoiris") color = `hsl(${(u * 120 + L.n * 25) % 360} 95% 60%)`;
    pasos.push({ ...L, ox, oy, a, s, color });
  }
  const dibujarLetra = (L, accion) => {
    ctx.save(); ctx.globalAlpha *= L.a;
    ctx.translate(L.x + L.w / 2 + L.ox, L.y + L.oy); ctx.scale(L.s, L.s);
    accion(L); ctx.restore();
  };
  // Contorno (con resplandor y sombra), luego el relleno encima.
  const borde = tam * (e.borde || 0) * 2;
  if (e.sombra) {
    ctx.save(); ctx.fillStyle = `rgba(0,0,0,${0.55 * e.sombra})`;
    for (const L of pasos) dibujarLetra(L, (L) => { ctx.translate(tam * 0.06, tam * 0.08); if (borde) { ctx.lineWidth = borde; ctx.strokeStyle = ctx.fillStyle; ctx.strokeText(L.c, -L.w / 2, 0); } ctx.fillText(L.c, -L.w / 2, 0); });
    ctx.restore();
  }
  if (brillo > 0) { ctx.shadowColor = e.colorBrillo; ctx.shadowBlur = tam * 0.45 * brillo; }
  if (borde > 0) { ctx.lineWidth = borde; ctx.strokeStyle = e.colorBorde; for (const L of pasos) dibujarLetra(L, (L) => ctx.strokeText(L.c, -L.w / 2, 0)); }
  if (!(borde > 0) && brillo > 0) { ctx.fillStyle = e.colorBrillo; for (const L of pasos) dibujarLetra(L, (L) => ctx.fillText(L.c, -L.w / 2, 0)); }
  ctx.shadowBlur = 0;
  const relleno = e.color2 ? (() => { const g = ctx.createLinearGradient(0, -alto / 2, 0, alto / 2); g.addColorStop(0, e.color); g.addColorStop(1, e.color2); return g; })() : e.color;
  const glitch = e.efecto === "glitch" && azar(Math.floor(u * 12)) > 0.55;
  if (glitch) {
    const d = tam * 0.06 * (azar(Math.floor(u * 30)) + 0.3);
    ctx.globalCompositeOperation = "lighter";
    for (const [col, k] of [["rgba(255,0,60,.8)", -1], ["rgba(0,220,255,.8)", 1]]) { ctx.fillStyle = col; for (const L of pasos) dibujarLetra(L, (L) => ctx.fillText(L.c, -L.w / 2 + d * k, 0)); }
    ctx.globalCompositeOperation = "source-over";
  }
  for (const L of pasos) dibujarLetra(L, (L) => {
    if (L.color) { ctx.fillStyle = L.color; ctx.fillText(L.c, -L.w / 2, 0); return; }
    if (e.color2) { ctx.translate(-(L.x + L.w / 2 + L.ox), -(L.y + L.oy)); ctx.fillStyle = relleno; ctx.fillText(L.c, L.x + L.ox, L.y + L.oy); }
    else { ctx.fillStyle = relleno; ctx.fillText(L.c, -L.w / 2, 0); }
  });
  if (glitch && azar(Math.floor(u * 12) + 7) > 0.5) {
    // Una franja corrida, como señal que falla.
    const y0 = (azar(Math.floor(u * 20)) - 0.5) * alto, h = tam * 0.18;
    ctx.globalAlpha *= 0.9; ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(-ancho / 2 - tam * 0.2, y0, ancho + tam * 0.4, h * 0.3);
  }
  ctx.restore();
  cajasTexto.set(tx, { x: cx - ancho / 2 - tam * 0.2, y: cy - alto / 2 - tam * 0.1, w: ancho + tam * 0.4, h: alto + tam * 0.2, W, H });
}

export function componer(ctx, img3d, p, t, W, H, { duracion = 0, fps = 30 } = {}) {
  const f = p.filtros;
  const k = (v, a) => 1 + (v || 0) * a;
  ctx.save();
  ctx.filter = `brightness(${k(f.brillo, 0.5)}) contrast(${k(f.contraste, 0.6)}) saturate(${Math.max(0, k(f.saturacion, 1))})`;
  ctx.drawImage(img3d, 0, 0, W, H);
  ctx.filter = "none";
  // Calidez: naranja o azul suave por encima.
  if (f.calidez) {
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = Math.min(1, Math.abs(f.calidez) * 0.7);
    ctx.fillStyle = f.calidez > 0 ? "#ff9a3c" : "#3c8cff";
    ctx.fillRect(0, 0, W, H);
  }
  if (f.grano) {
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = f.grano * 0.35;
    ctx.fillStyle = ctx.createPattern(grano(Math.floor(t * fps)), "repeat");
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  if (f.vineta) {
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.85 * f.vineta})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (f.barras) {
    const alto = Math.max(0, (H - W / 2.39) / 2);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, alto);
    ctx.fillRect(0, H - alto, W, alto);
  }
  // Textos.
  for (const tx of p.textos || []) {
    if (!tx.texto || t < tx.desde || t > tx.hasta) { if (tx) cajasTexto.set(tx, null); continue; }
    dibujarTexto(ctx, tx, t, W, H, f);
  }
  ctx.globalAlpha = 1;
  for (const tr of p.transiciones || []) transicion(ctx, tr, t, W, H, fps);
  // Fundido a negro al empezar y al terminar.
  let a = 0;
  if (duracion > 0) {
    if (p.fundido?.entrada && t < 0.8) a = 1 - t / 0.8;
    if (p.fundido?.salida && t > duracion - 0.8) a = Math.max(a, (t - (duracion - 0.8)) / 0.8);
  }
  if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// Transiciones: { t, tipo, dur }. Llegan a su punto más fuerte en t (el corte).
export const TRANSICIONES = ["negro", "blanco", "destello", "barrido", "iris", "desenfoque", "zoom", "glitch"];
function transicion(ctx, tr, t, W, H, fps) {
  const dur = Math.max(0.1, tr.dur ?? 0.8), u = (t - (tr.t - dur / 2)) / dur;
  if (!(u > 0 && u < 1)) return;
  const a = 1 - Math.abs(2 * u - 1), suave = a * a * (3 - 2 * a);
  ctx.save();
  switch (tr.tipo) {
    case "blanco": ctx.fillStyle = `rgba(255,255,255,${suave})`; ctx.fillRect(0, 0, W, H); break;
    case "destello": ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,248,230,${Math.pow(a, 3)})`; ctx.fillRect(0, 0, W, H); break;
    case "barrido": {
      ctx.fillStyle = "#000";
      const x = u < 0.5 ? 0 : W * (2 * u - 1), w = u < 0.5 ? W * 2 * u : W - x;
      ctx.fillRect(x, 0, w, H); break;
    }
    case "iris": {
      const r = Math.hypot(W, H) * 0.5 * (1 - suave);
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, Math.max(0, r), 0, Math.PI * 2, true); ctx.fill(); break;
    }
    case "desenfoque": ctx.filter = `blur(${(suave * Math.min(W, H)) / 40}px)`; ctx.drawImage(ctx.canvas, 0, 0, W, H); break;
    case "zoom": {
      const k = 1 + suave * 0.5;
      ctx.filter = `blur(${(suave * Math.min(W, H)) / 120}px)`;
      ctx.drawImage(ctx.canvas, (W - W * k) / 2, (H - H * k) / 2, W * k, H * k);
      ctx.filter = "none"; ctx.fillStyle = `rgba(255,255,255,${suave * 0.25})`; ctx.fillRect(0, 0, W, H); break;
    }
    case "glitch": {
      const cuadro = Math.floor(t * fps), tiras = 14;
      for (let i = 0; i < tiras; i++) {
        if (azar(cuadro * 31 + i) > a * 0.9) continue;
        const y = Math.floor((H * i) / tiras), h = Math.ceil(H / tiras), dx = (azar(cuadro * 17 + i * 5) - 0.5) * W * 0.12 * a;
        ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
      }
      ctx.globalCompositeOperation = "screen"; ctx.fillStyle = `rgba(${azar(cuadro) > 0.5 ? "255,0,90" : "0,220,255"},${a * 0.25})`; ctx.fillRect(0, 0, W, H); break;
    }
    default: ctx.fillStyle = `rgba(0,0,0,${suave})`; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// Subtítulos en formato .srt (para subirlos aparte a YouTube).
export function srt(textos) {
  const hms = (s) => {
    const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return [...textos].filter((x) => x.texto).sort((a, b) => a.desde - b.desde)
    .map((x, i) => `${i + 1}\n${hms(x.desde)} --> ${hms(x.hasta)}\n${x.texto}\n`).join("\n");
}
