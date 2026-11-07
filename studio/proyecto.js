// Qué guarda un proyecto del estudio, y los ajustes ya hechos (ambientes,
// filtros y movimientos de cámara de ejemplo).

export const VERSION = 1;

export function proyectoNuevo() {
  return {
    rite: "escena", version: VERSION, nombre: "",
    mapa: null, mapaNombre: "",
    salida: { formato: "16:9", calidad: "1080", fps: 30 },
    // Los sliders van de -1 a 1 (0 = como el mapa).
    escena: { ambiente: "mapa", claridad: 0, lamparas: 0, niebla: 0, resplandor: 0, sol: 0, sombras: true, altura: null, desenfoque: 0, cortes: [], ocultar: [], particulas: [] },
    objetos: [], // personajes, utilería, luces, bloques y modelos (ver objetos.js)
    camara: { claves: [], duracion: 10, suave: true, facil: true, temblor: 0, golpes: [], seguir: null },
    filtros: { preset: "ninguno", brillo: 0, contraste: 0, saturacion: 0, calidez: 0, vineta: 0, grano: 0, barras: false },
    textos: [],
    transiciones: [], // { t, tipo, dur } (ver capas.js)
    fuentes: [], // { nombre, datos } fuentes que subió el usuario (data:font/…)
    sonidos: [], // { nombre, inicio, volumen, datos } (el audio va adentro como data:audio/…)
    fundido: { entrada: true, salida: true },
  };
}

// Completa un proyecto viejo o a medias con lo que falte.
export function normalizar(p) {
  const n = proyectoNuevo();
  for (const k of Object.keys(n)) {
    if (p[k] === undefined) continue;
    n[k] = n[k] && typeof n[k] === "object" && !Array.isArray(n[k]) ? { ...n[k], ...p[k] } : p[k];
  }
  n.objetos = limpiarObjetos(n.objetos);
  n.fuentes = (Array.isArray(n.fuentes) ? n.fuentes : []).filter((f) => f && typeof f.nombre === "string" && /^[\w \-]{1,40}$/.test(f.nombre) && typeof f.datos === "string" && /^data:(font|application)\/[\w.+-]+;base64,/.test(f.datos)).slice(0, 10);
  n.textos = (Array.isArray(n.textos) ? n.textos : []).filter((x) => x && typeof x === "object");
  n.transiciones = (Array.isArray(n.transiciones) ? n.transiciones : []).filter((x) => x && typeof x.t === "number");
  n.escena.particulas = (Array.isArray(n.escena.particulas) ? n.escena.particulas : []).filter((x) => x && typeof x.tipo === "string").slice(0, 12);
  n.camara.golpes = (Array.isArray(n.camara.golpes) ? n.camara.golpes : []).filter((x) => x && typeof x.t === "number");
  return n;
}

// Un proyecto puede venir de cualquiera: las skins y los modelos solo se
// aceptan si vienen adentro del archivo (data:), nunca como dirección de internet.
function limpiarObjetos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter((d) => d && typeof d === "object").map((d) => {
    const o = { ...d };
    if (o.skin != null && !(typeof o.skin === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(o.skin))) delete o.skin;
    if (o.kirka != null && !(typeof o.kirka === "string" && o.kirka.length <= 80)) delete o.kirka;
    // Las armas de bloques de antes pasan a la de Kirka más parecida.
    if (o.arma != null) { if (!o.armaKirka) o.armaKirka = { rifle: "AR-9", subfusil: "MAC-10", francotirador: "VITA", escopeta: "Shark", pistola: "Revolver", cuchillo: "Bayonet" }[o.arma]; delete o.arma; delete o.colorArma; }
    if (o.armaKirka != null && !["AR-9", "SCAR", "LAR", "M60", "VITA", "Shark", "Weatie", "MAC-10", "Revolver", "Bayonet", "Tomahawk"].includes(o.armaKirka)) delete o.armaKirka;
    if (o.skinArma != null && !(typeof o.skinArma === "string" && o.skinArma.length <= 80)) delete o.skinArma;
    if (o.brazos != null && o.brazos !== 3 && o.brazos !== 4) delete o.brazos;
    if (o.disparos != null) o.disparos = Array.isArray(o.disparos) ? o.disparos.filter((x) => x && typeof x.desde === "number" && typeof x.hasta === "number" && x.hasta > x.desde).slice(0, 50).map(({ desde, hasta }) => ({ desde, hasta })) : undefined;
    if (o.datos != null && !(typeof o.datos === "string" && o.datos.startsWith("data:"))) delete o.datos;
    if (o.tipo === "modelo" && !o.datos) o.tipo = "bloque";
    if (o.hijos) o.hijos = limpiarObjetos(o.hijos);
    return o;
  });
}

export const FORMATOS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:5": [4, 5], "4:3": [4, 3], "21:9": [21, 9] };
export const CALIDADES = { "720": 720, "1080": 1080, "1440": 1440, "2160": 2160 };
export function tamanoSalida(salida) {
  const [a, b] = FORMATOS[salida.formato] || FORMATOS["16:9"];
  const lado = CALIDADES[salida.calidad] || 1080;
  // "1080" es el lado corto, como en los videos de YouTube o TikTok.
  const par = (v) => Math.round(v / 2) * 2;
  return a >= b ? [par((lado * a) / b), lado] : [lado, par((lado * b) / a)];
}

// Ambientes: cambian la luz, el cielo y la niebla del mapa.
export const AMBIENTES = {
  mapa: {},
  dia: { luz: { luz: 0.6, brillo: 1.6, tinte: "#ffffff", fuerzaSol: 1 }, cielo: "#8cc4f0", niebla: { color: "#b9daf2", cerca: 80, lejos: 320 } },
  atardecer: { luz: { luz: 0.55, brillo: 1.6, tinte: "#ffb27a", fuerzaSol: 1.3, sol: [-60, 28, -25] }, cielo: "#f2a46f", niebla: { color: "#e9a07a", cerca: 45, lejos: 200 } },
  noche: { luz: { luz: 0.2, brillo: 2.1, tinte: "#8ea2c8" }, cielo: "#05070d", niebla: { color: "#0b1020", cerca: 30, lejos: 140 } },
  terror: { luz: { luz: 0.13, brillo: 2.0, tinte: "#a8b89a", colorLampara: "#ffb070" }, cielo: "#020403", niebla: { color: "#0d1a0e", cerca: 6, lejos: 60 } },
  radioactivo: { luz: { luz: 0.16, brillo: 2.0, tinte: "#9fe07a", colorLampara: "#d8ff9a" }, cielo: "#020604", niebla: { color: "#0b2410", cerca: 12, lejos: 80 } },
  sangre: { luz: { luz: 0.15, brillo: 2.1, tinte: "#d88a8a", colorLampara: "#ff9a7a" }, cielo: "#140203", niebla: { color: "#2a0606", cerca: 10, lejos: 75 } },
};

// Filtros ya hechos. Los números van de -1 a 1 (vineta y grano de 0 a 1).
export const FILTROS = {
  ninguno: { brillo: 0, contraste: 0, saturacion: 0, calidez: 0, vineta: 0, grano: 0, barras: false },
  cine: { brillo: 0, contraste: 0.25, saturacion: -0.1, calidez: 0.2, vineta: 0.55, grano: 0.2, barras: true },
  vibrante: { brillo: 0.05, contraste: 0.2, saturacion: 0.5, calidez: 0, vineta: 0.2, grano: 0, barras: false },
  terror: { brillo: -0.1, contraste: 0.35, saturacion: -0.45, calidez: -0.35, vineta: 0.85, grano: 0.45, barras: false },
  retro: { brillo: 0.05, contraste: -0.1, saturacion: -0.3, calidez: 0.55, vineta: 0.5, grano: 0.6, barras: false },
  byn: { brillo: 0, contraste: 0.3, saturacion: -1, calidez: 0, vineta: 0.5, grano: 0.3, barras: false },
  frio: { brillo: 0, contraste: 0.1, saturacion: -0.1, calidez: -0.6, vineta: 0.3, grano: 0, barras: false },
  sueno: { brillo: 0.15, contraste: -0.25, saturacion: 0.2, calidez: 0.3, vineta: 0.4, grano: 0.1, barras: false },
};

// Movimientos de cámara de ejemplo, a partir del mapa (caja) y la vista actual.
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, k) => a.map((v) => v * k);
const largo = (a) => Math.hypot(...a);

export const MOVIMIENTOS = {
  // Vuelta alrededor de lo que estás viendo.
  orbita(v, dur) {
    const centro = v.mira, d = sub(v.pos, centro);
    const r = Math.hypot(d[0], d[2]) || 20, a0 = Math.atan2(d[0], d[2]), n = 8;
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + (i / n) * Math.PI * 2;
      return { t: (dur * i) / n, pos: [centro[0] + Math.sin(a) * r, v.pos[1], centro[2] + Math.cos(a) * r], mira: [...centro], fov: v.fov };
    });
  },
  // Media vuelta lenta, más cinematográfica.
  arco(v, dur) {
    return MOVIMIENTOS.orbita(v, dur * 4).filter((k) => k.t <= dur + 1e-6);
  },
  // Se acerca a lo que estás viendo.
  acercar(v, dur) {
    const d = sub(v.mira, v.pos);
    return [{ t: 0, pos: [...v.pos], mira: [...v.mira], fov: v.fov }, { t: dur, pos: add(v.pos, mul(d, 0.55)), mira: [...v.mira], fov: v.fov }];
  },
  // Se aleja y sube, como al final de un video.
  alejar(v, dur) {
    const d = sub(v.pos, v.mira);
    const fin = add(v.pos, add(mul(d, 0.9), [0, largo(d) * 0.35, 0]));
    return [{ t: 0, pos: [...v.pos], mira: [...v.mira], fov: v.fov }, { t: dur, pos: fin, mira: [...v.mira], fov: v.fov }];
  },
  // Se desliza de lado sin dejar de mirar al frente.
  lateral(v, dur) {
    const d = sub(v.mira, v.pos), lado = [-d[2], 0, d[0]], l = largo(lado) || 1, paso = mul(lado, (largo(d) * 0.35) / l);
    return [
      { t: 0, pos: sub(v.pos, paso), mira: sub(v.mira, paso), fov: v.fov },
      { t: dur, pos: add(v.pos, paso), mira: add(v.mira, paso), fov: v.fov },
    ];
  },
  // Baja desde el cielo hasta la vista actual.
  entrada(v, dur) {
    const d = sub(v.pos, v.mira), alto = add(v.pos, add(mul(d, 1.2), [0, largo(d) * 1.2, 0]));
    return [{ t: 0, pos: alto, mira: [...v.mira], fov: v.fov }, { t: dur, pos: [...v.pos], mira: [...v.mira], fov: v.fov }];
  },
};
