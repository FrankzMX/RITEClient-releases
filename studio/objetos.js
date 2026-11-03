// Objetos que se ponen en la escena además del mapa: personajes de bloques con
// skin y poses, utilería low-poly (calabazas, calaveras, faroles…), bloques de
// Kirka sueltos, luces y modelos 3D importados (GLB/GLTF u OBJ).
import { adjuntarArma, acomodarArmaKirka, crearFogonazo, animarFogonazo } from "./armas.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ATLAS_TILES, blockTile } from "./bloques.js";

const RAD = Math.PI / 180;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra });
const brillo = (color, fuerza = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(fuerza) });
const malla = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };

// ---------- Personajes ----------
// Skin de 64×64 con el acomodo clásico de los juegos de bloques (cabeza 8×8×8,
// cuerpo 8×12×4, brazos y piernas 4×12×4). [deducido] Kirka usa su propio modelo;
// esto es una aproximación hasta tener el modelo oficial.
function regiones(u, v, w, h, d) {
  return { top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h] };
}
const PARTES_BASE = {
  cabeza: { uv: [0, 0], t: [8, 8, 8], capa: [32, 0] },
  cuerpo: { uv: [16, 16], t: [8, 12, 4], capa: [16, 32] },
  brazoD: { uv: [40, 16], t: [4, 12, 4], capa: [40, 32] },
  brazoI: { uv: [32, 48], t: [4, 12, 4], capa: [48, 48] },
  piernaD: { uv: [0, 16], t: [4, 12, 4], capa: [0, 32] },
  piernaI: { uv: [16, 48], t: [4, 12, 4], capa: [0, 48] },
};

// tramo: [desde, hasta] en píxeles de la skin, para partir una caja en dos.
// cortes: en cuántas rebanadas se parte a lo alto (para doblarla con huesos).
function cajaConSkin([u, v], [w, h, d], escala, inflar = 0, tramo = null, cortes = 1) {
  const [y0, y1] = tramo || [0, h], alto = y1 - y0;
  const geo = new THREE.BoxGeometry((w + inflar) * escala, (alto + inflar) * escala, (d + inflar) * escala, 1, cortes, 1);
  const r = regiones(u, v, w, h, d);
  for (const k of ["right", "front", "left", "back"]) r[k] = [r[k][0], r[k][1] + y0, r[k][2], alto];
  // Orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z. El personaje mira a +z.
  const caras = [r.left, r.right, r.top, r.bottom, r.front, r.back];
  const verts = [2 * (cortes + 1), 2 * (cortes + 1), 4, 4, 2 * (cortes + 1), 2 * (cortes + 1)];
  const uv = geo.attributes.uv;
  let i = 0;
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = caras[f];
    for (let k = 0; k < verts[f]; k++, i++) {
      const a = uv.getX(i), b = uv.getY(i);
      uv.setXY(i, (rx + a * rw) / 64, 1 - (ry + (1 - b) * rh) / 64);
    }
  }
  return geo;
}

// Skins de ejemplo dibujadas aquí mismo.
export const SKINS = {
  kirka: { piel: "#9aa0a8", ropa: "#1d2027", pantalon: "#2b3242", zapato: "#121318", letra: true },
  zombi: { piel: "#5f9a4a", ropa: "#2f5a7a", pantalon: "#3a3170", zapato: "#2a2a2a", sangre: true },
  esqueleto: { piel: "#e6e6e0", ropa: "#e6e6e0", pantalon: "#e6e6e0", zapato: "#bdbdb5", huesos: true },
  calabaza: { piel: "#e2741d", ropa: "#2a3a1a", pantalon: "#3a2a1a", zapato: "#1e1e1e", cara: "calabaza" },
  fantasma: { piel: "#f2f4ff", ropa: "#f2f4ff", pantalon: "#e6e9f7", zapato: "#e6e9f7", cara: "fantasma" },
  rojo: { piel: "#e0b48f", ropa: "#c7322f", pantalon: "#26324a", zapato: "#151515" },
  azul: { piel: "#e0b48f", ropa: "#2f6fc7", pantalon: "#26324a", zapato: "#151515" },
};

export function dibujarSkin(nombre) {
  const s = SKINS[nombre] || SKINS.kirka;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const pintar = (parte, color, desdeY = 0, hastaY = 99) => {
    const p = PARTES_BASE[parte], r = regiones(p.uv[0], p.uv[1], ...p.t);
    for (const [k, [x, y, w, h]] of Object.entries(r)) {
      g.fillStyle = color;
      if (k === "top" || k === "bottom") { g.fillRect(x, y, w, h); continue; }
      g.fillRect(x, y + Math.min(desdeY, h), w, Math.max(0, Math.min(hastaY, h) - desdeY));
    }
  };
  // Un poco de ruido para que no se vea plano.
  const ruido = () => { const d = g.getImageData(0, 0, 64, 64); for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3]) { const n = (Math.random() - 0.5) * 18; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0); };
  pintar("cabeza", s.piel);
  pintar("cuerpo", s.ropa);
  for (const b of ["brazoD", "brazoI"]) { pintar(b, s.ropa, 0, 5); pintar(b, s.piel, 5, 12); }
  for (const l of ["piernaD", "piernaI"]) { pintar(l, s.pantalon, 0, 10); pintar(l, s.zapato, 10, 12); }
  ruido();
  // Cara (frente de la cabeza: x 8..16, y 8..16).
  g.fillStyle = "#101010";
  if (s.cara === "calabaza") { g.fillStyle = "#ffcf4a"; g.fillRect(9, 10, 2, 2); g.fillRect(13, 10, 2, 2); g.fillRect(9, 13, 6, 1); g.fillRect(10, 14, 1, 1); g.fillRect(13, 14, 1, 1); }
  else if (s.cara === "fantasma") { g.fillRect(9, 10, 2, 3); g.fillRect(13, 10, 2, 3); g.fillRect(11, 14, 2, 1); }
  else if (s.huesos) { g.fillRect(9, 10, 2, 2); g.fillRect(13, 10, 2, 2); g.fillRect(11, 12, 2, 1); g.fillRect(9, 14, 6, 1); g.fillStyle = "#e6e6e0"; for (let x = 9; x < 15; x += 2) g.fillRect(x, 14, 1, 1); }
  else { g.fillRect(10, 11, 1, 2); g.fillRect(13, 11, 1, 2); g.fillRect(11, 14, 2, 1); }
  if (s.letra) { g.fillStyle = "#e8e8e8"; g.fillRect(22, 22, 1, 6); g.fillRect(23, 24, 1, 1); g.fillRect(24, 23, 1, 1); g.fillRect(25, 22, 1, 1); g.fillRect(24, 25, 1, 1); g.fillRect(25, 26, 1, 2); }
  if (s.huesos) { g.fillStyle = "#1a1a1a"; for (let y = 22; y < 31; y += 2) { g.fillRect(20, y, 2, 1); g.fillRect(26, y, 2, 1); } for (const x of [44, 36]) for (let y = 21; y < 31; y += 2) g.fillRect(x, y, 4, 1); }
  if (s.sangre) { g.fillStyle = "#7a1010"; g.fillRect(9, 9, 2, 1); g.fillRect(21, 23, 2, 2); g.fillRect(25, 27, 1, 2); }
  return c.toDataURL("image/png");
}

const texturas = new Map();
function texturaSkin(url) {
  if (!texturas.has(url)) {
    const t = new THREE.TextureLoader().load(url, () => dispatchEvent(new Event("rite-textura")));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    texturas.set(url, t);
  }
  return texturas.get(url);
}

// Skins de brazo delgado (3 px): en la skin, junto al brazo derecho quedan
// dos columnas vacías (x 54-55, y 20-31). Así las reconocemos solas.
export function esBrazoDelgado(img) {
  if (!img || img.width !== 64 || img.height !== 64) return false;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(54, 20, 2, 12).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
  return true;
}
const brazosDetectados = new Map();
function detectarBrazos(url) {
  if (!brazosDetectados.has(url)) brazosDetectados.set(url, new Promise((ok) => {
    const im = new Image(); im.onload = () => ok(esBrazoDelgado(im) ? 3 : 4); im.onerror = () => ok(4); im.src = url;
  }));
  return brazosDetectados.get(url);
}

// ---------- Acabado de los personajes ----------
// Luz de estudio compartida por todos los personajes: contraluz (un borde de luz
// que los separa del fondo) y relleno (los aclara sin tocar el mapa).
export const ESTUDIO = { rim: { value: 0 }, rimColor: { value: new THREE.Color("#bcd7ff") }, relleno: { value: 0 } };
let entorno = null; // reflejos para los acabados brillantes (lo pone el motor)
export function ponerEntorno(tex) { entorno = tex; }
export const ACABADOS = ["mate", "satinado", "brillante", "metal"];
function matPersonaje(desc, extra = {}) {
  const a = ACABADOS.includes(desc.acabado) ? desc.acabado : "mate";
  const op = {
    mate: { roughness: 0.9, metalness: 0, envMapIntensity: 0.15 },
    satinado: { roughness: 0.5, metalness: 0, envMapIntensity: 0.45 },
    brillante: { roughness: 0.25, metalness: 0, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.08 },
    metal: { roughness: 0.32, metalness: 0.85, envMapIntensity: 1.1 },
  }[a];
  const Clase = a === "brillante" ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const { clearcoat, clearcoatRoughness, ...base } = op;
  const m = new Clase({ ...base, ...(a === "brillante" ? { clearcoat, clearcoatRoughness } : {}), envMap: entorno, alphaTest: 0.5, ...extra });
  // Partes de la skin que brillan en la oscuridad.
  if (desc.emision > 0 && (extra.map || m.map)) { m.emissiveMap = extra.map || m.map; m.emissive = new THREE.Color("#ffffff"); m.emissiveIntensity = desc.emision * 1.6; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimFuerza = ESTUDIO.rim; sh.uniforms.rimColor = ESTUDIO.rimColor; sh.uniforms.relleno = ESTUDIO.relleno;
    sh.fragmentShader = "uniform float rimFuerza; uniform vec3 rimColor; uniform float relleno;\n" + sh.fragmentShader.replace("#include <opaque_fragment>",
      "{ float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.5);\n outgoingLight += rimColor * rimFuerza * fr * 1.6 + diffuseColor.rgb * relleno; }\n#include <opaque_fragment>");
  };
  m.customProgramCacheKey = () => "personaje-" + a;
  return m;
}

// Segunda capa de la skin con relieve: cada píxel es un cubito, como en los
// visores 3D. Devuelve una malla con colores por vértice (sin textura).
const pixelesCache = new Map();
function pixelesSkin(url) {
  if (!pixelesCache.has(url)) pixelesCache.set(url, new Promise((ok) => {
    const im = new Image();
    im.onload = () => { if (im.width !== 64 || im.height !== 64) return ok(null); const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.drawImage(im, 0, 0); ok(g.getImageData(0, 0, 64, 64).data); };
    im.onerror = () => ok(null); im.src = url;
  }));
  return pixelesCache.get(url);
}
function capaVoxel(pix, [u, v], [w, h, d], px, grosor = 0.6) {
  const r = regiones(u, v, w, h, d);
  const pos = [], nor = [], col = [], ind = [];
  const color = new THREE.Color();
  const cubo = (cx, cy, cz, sx, sy, sz, rgb) => {
    color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    const caras = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    for (const [n, a, b] of caras) {
      const base = pos.length / 3;
      for (const [ka, kb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 1, 2].map((i) => (n[i] * [sx, sy, sz][i] + ka * a[i] * [sx, sy, sz][i] + kb * b[i] * [sx, sy, sz][i]));
        pos.push((cx + p[0]) * px, (cy + p[1]) * px, (cz + p[2]) * px); nor.push(...n); col.push(color.r, color.g, color.b);
      }
      // Orden para que la cara mire hacia afuera.
      const cr = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  };
  const g2 = grosor / 2, lado = 0.5;
  const cara = (rect, alPunto) => {
    const [rx, ry, rw, rh] = rect;
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
      const k = ((ry + j) * 64 + rx + i) * 4;
      if (pix[k + 3] < 128) continue;
      alPunto(i, j, [pix[k], pix[k + 1], pix[k + 2]]);
    }
  };
  const o = 0.02 + g2;
  cara(r.front, (i, j, c) => cubo(-w / 2 + i + 0.5, h / 2 - j - 0.5, d / 2 + o, lado, lado, g2, c));
  cara(r.back, (i, j, c) => cubo(w / 2 - i - 0.5, h / 2 - j - 0.5, -d / 2 - o, lado, lado, g2, c));
  cara(r.left, (i, j, c) => cubo(w / 2 + o, h / 2 - j - 0.5, d / 2 - i - 0.5, g2, lado, lado, c));
  cara(r.right, (i, j, c) => cubo(-w / 2 - o, h / 2 - j - 0.5, -d / 2 + i + 0.5, g2, lado, lado, c));
  cara(r.top, (i, j, c) => cubo(-w / 2 + i + 0.5, h / 2 + o, -d / 2 + j + 0.5, lado, g2, lado, c));
  cara(r.bottom, (i, j, c) => cubo(-w / 2 + i + 0.5, -h / 2 - o, d / 2 - j - 0.5, lado, g2, lado, c));
  if (!ind.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(ind);
  return geo;
}

function personaje(desc, ancho = 4, pix = null) {
  const px = 0.9 / 16; // 32 px de alto = 1.8 bloques
  const PARTES = { ...PARTES_BASE };
  if (ancho === 3) for (const b of ["brazoD", "brazoI"]) PARTES[b] = { ...PARTES[b], t: [3, 12, 4] };
  const hombro = 4 + ancho / 2;
  const tex = texturaSkin(desc.skin || dibujarSkin(desc.skinBase || "kirka"));
  const m = matPersonaje(desc, { map: tex });
  // Capa de encima: plana (con la textura) o con relieve (cubitos de color).
  const relieve = !!pix && desc.capa3d !== false;
  const capa = relieve ? matPersonaje({ ...desc, emision: 0 }, { vertexColors: true, alphaTest: 0 }) : matPersonaje(desc, { map: tex });
  const raiz = new THREE.Group();
  const cuerpoG = new THREE.Group(); raiz.add(cuerpoG);
  const parte = (nombre, piv, centro) => {
    const p = PARTES[nombre];
    const g = new THREE.Group(); g.position.set(...piv.map((v) => v * px));
    const a = malla(cajaConSkin(p.uv, p.t, px), m, ...centro.map((v) => v * px));
    g.add(a);
    if (desc.skin) {
      const geo = relieve ? capaVoxel(pix, p.capa, p.t, px) : cajaConSkin(p.capa, p.t, px, 0.5 + (nombre === "cabeza" ? 0.5 : 0));
      if (geo) { const b = malla(geo, capa, ...centro.map((v) => v * px)); b.castShadow = relieve; g.add(b); }
    }
    cuerpoG.add(g);
    return g;
  };
  // Brazos y piernas: una sola malla con dos huesos (hombro/cadera y codo/rodilla),
  // como el modelo de Kirka. Los píxeles cerca del codo se reparten entre los dos
  // huesos, así al doblar la pieza se curva en vez de abrirse un hueco.
  // sobre: cuántos px sube la pieza arriba del punto de giro; dx: cuánto se corre
  // de lado. Los brazos giran desde dentro del hombro (como en los juegos de
  // bloques), así al levantarlos no se despegan del cuerpo.
  const extremidad = (nombre, piv, sobre = 0, dx = 0) => {
    const p = PARTES[nombre];
    const g = new THREE.Group(); g.position.set(...piv.map((v) => v * px));
    const arriba = new THREE.Bone(), codo = new THREE.Bone();
    codo.position.y = (sobre - 6) * px; arriba.add(codo); g.add(arriba);
    const mallas = [[p.uv, 0, m]];
    if (desc.skin) mallas.push([p.capa, 0.5, capa]);
    const hechas = mallas.map(([uv, inflar, mat]) => {
      const geo = inflar && relieve ? capaVoxel(pix, uv, p.t, px) : cajaConSkin(uv, p.t, px, inflar, null, 24);
      if (!geo) return null;
      geo.translate(dx * px, (sobre - 6) * px, 0);
      const pos = geo.attributes.position, n = pos.count;
      const idx = new Uint16Array(n * 4), pes = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) {
        // y en píxeles: 0 arriba, -12 abajo. Entre -4 y -8 se mezcla.
        const y = pos.getY(k) / px - sobre, w = Math.min(1, Math.max(0, (-y - 4) / 4));
        const s2 = w * w * (3 - 2 * w);
        idx.set([0, 1, 0, 0], k * 4); pes.set([1 - s2, s2, 0, 0], k * 4);
      }
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(pes, 4));
      const sm = new THREE.SkinnedMesh(geo, mat);
      sm.castShadow = inflar === 0 || relieve; sm.receiveShadow = true; sm.frustumCulled = false;
      g.add(sm);
      return sm;
    }).filter(Boolean);
    g.updateMatrixWorld(true);
    const esqueleto = new THREE.Skeleton([arriba, codo]);
    for (const sm of hechas) sm.bind(esqueleto);
    cuerpoG.add(g);
    return [g, codo];
  };
  const [piernaD, rodillaD] = extremidad("piernaD", [-2, 12, 0]);
  const [piernaI, rodillaI] = extremidad("piernaI", [2, 12, 0]);
  const [brazoD, codoD] = extremidad("brazoD", [-5, 22, 0], 2, -(hombro - 5));
  const [brazoI, codoI] = extremidad("brazoI", [5, 22, 0], 2, hombro - 5);
  const j = {
    piernaD, piernaI, brazoD, brazoI, codoD, codoI, rodillaD, rodillaI,
    cuerpo: parte("cuerpo", [0, 12, 0], [0, 6, 0]),
    cabeza: parte("cabeza", [0, 24, 0], [0, 4, 0]),
  };
  raiz.userData.pose = (estado) => aplicarPose(j, cuerpoG, estado);
  // La mano derecha: al final del antebrazo (el hueso del codo).
  raiz.userData.mano = { hueso: codoD, pos: new THREE.Vector3(-(hombro - 5) * px, -5.5 * px, 0) };
  return raiz;
}

export const POSES = ["parado", "caminar", "correr", "saludar", "zombi", "apuntar", "festejar", "sentado", "bailar", "asustado"];
// Partes que se pueden girar a mano. «cuerpo» inclina todo el personaje.
export const ARTICULACIONES = ["cabeza", "cuerpo", "brazoD", "codoD", "brazoI", "codoI", "piernaD", "rodillaD", "piernaI", "rodillaI"];
// Codos y rodillas solo se doblan (un eje).
export const SOLO_DOBLAR = new Set(["codoD", "codoI", "rodillaD", "rodillaI"]);
const vacio = () => ({ cabeza: [0, 0, 0], cuerpo: [0, 0, 0], brazoD: [0, 0, 0], brazoI: [0, 0, 0], piernaD: [0, 0, 0], piernaI: [0, 0, 0], codoD: [0, 0, 0], codoI: [0, 0, 0], rodillaD: [0, 0, 0], rodillaI: [0, 0, 0], alto: 0 });
// Ángulos (en radianes) de cada parte para una pose ya hecha en el segundo t.
function posar(pose, t) {
  const r = vacio();
  const s = (f, a = 1) => Math.sin(t * f) * a;
  r.brazoD[2] = -0.06; r.brazoI[2] = 0.06;
  switch (pose) {
    case "caminar": { const a = s(6, 0.6); r.piernaD[0] = a; r.piernaI[0] = -a; r.brazoD[0] = -a * 0.8; r.brazoI[0] = a * 0.8; r.alto = Math.abs(s(6, 0.03));
      r.rodillaD[0] = 0.1 + Math.max(0, Math.sin(t * 6 + 1.3)) * 0.7; r.rodillaI[0] = 0.1 + Math.max(0, -Math.sin(t * 6 + 1.3)) * 0.7; r.codoD[0] = r.codoI[0] = -0.25; break; }
    case "correr": { const a = s(10, 1.0); r.piernaD[0] = a; r.piernaI[0] = -a; r.brazoD[0] = -a; r.brazoI[0] = a; r.cuerpo[0] = 0.15; r.alto = Math.abs(s(10, 0.07));
      r.rodillaD[0] = 0.2 + Math.max(0, Math.sin(t * 10 + 1.3)) * 1.3; r.rodillaI[0] = 0.2 + Math.max(0, -Math.sin(t * 10 + 1.3)) * 1.3; r.codoD[0] = r.codoI[0] = -1.4; break; }
    case "saludar": r.brazoD[2] = -2.5; r.codoD[2] = s(8, 0.5); r.cabeza[2] = 0.08; break;
    case "zombi": { const a = s(3, 0.35); r.brazoD[0] = -1.5 + s(2, 0.08); r.brazoI[0] = -1.5 - s(2, 0.08); r.piernaD[0] = a; r.piernaI[0] = -a; r.cabeza[2] = 0.25; r.cuerpo[0] = 0.1; r.codoD[0] = -0.3 + s(2, 0.1); r.codoI[0] = -0.3 - s(2, 0.1); r.rodillaD[0] = r.rodillaI[0] = 0.25; break; }
    case "apuntar": r.brazoD[0] = -1.55; r.brazoI[0] = -1.45; r.brazoI[1] = 0.5; r.cabeza[1] = 0.05; break;
    case "festejar": r.brazoD[2] = -2.8; r.brazoI[2] = 2.8; r.codoD[2] = -0.3; r.codoI[2] = 0.3; r.alto = Math.max(0, s(7, 0.25)); r.rodillaD[0] = r.rodillaI[0] = r.alto < 0.05 ? 0.3 : 0; break;
    case "sentado": r.piernaD[0] = -1.57; r.piernaI[0] = -1.57; r.rodillaD[0] = r.rodillaI[0] = 1.57; r.alto = -0.34; r.brazoD[0] = -0.4; r.brazoI[0] = -0.4; r.codoD[0] = r.codoI[0] = -0.6; break;
    case "bailar": r.brazoD[2] = -1.8 + s(5, 0.8); r.brazoI[2] = 1.8 + s(5, 0.8); r.codoD[2] = -0.9 + s(5, 0.4); r.codoI[2] = 0.9 + s(5, 0.4); r.rodillaD[0] = 0.25 + s(10, 0.2); r.rodillaI[0] = 0.25 - s(10, 0.2); r.cuerpo[2] = s(5, 0.12); r.cabeza[2] = s(5, -0.15); r.piernaD[2] = s(5, 0.15); r.piernaI[2] = s(5, 0.15); break;
    case "asustado": r.brazoD[0] = -2.6; r.brazoI[0] = -2.6; r.brazoD[2] = -0.4; r.brazoI[2] = 0.4; r.cuerpo[0] = -0.12; r.codoD[0] = r.codoI[0] = -1.1; r.rodillaD[0] = r.rodillaI[0] = 0.15; r.alto = Math.abs(s(20, 0.01)); break;
    default: r.cabeza[1] = s(0.7, 0.15); r.brazoD[0] = s(1.5, 0.03); r.brazoI[0] = -s(1.5, 0.03);
  }
  return r;
}
const mezclar = (a, b, u) => {
  const r = vacio();
  for (const p of ARTICULACIONES) r[p] = a[p].map((v, i) => v + (b[p][i] - v) * u);
  r.alto = a.alto + (b.alto - a.alto) * u;
  return r;
};
// Giros a mano (en grados) que se suman a la pose; vienen del objeto o de sus marcas.
const giros = (g) => (g && typeof g === "object" ? g : {});
const giro = (g, p, i) => { const v = +giros(g)[p]?.[i]; return Number.isFinite(v) ? Math.max(-360, Math.min(360, v)) : 0; };
// Signo de cada eje para que en todas las partes positivo sea: adelante, a la
// derecha del personaje y (cabeza y cuerpo) inclinarse a su derecha o (brazos y piernas) hacia afuera.
const SIGNO = { cabeza: [1, -1, 1], cuerpo: [1, -1, 1], brazoD: [-1, -1, -1], brazoI: [-1, -1, 1], piernaD: [-1, -1, -1], piernaI: [-1, -1, 1], codoD: [-1, 0, 0], codoI: [-1, 0, 0], rodillaD: [1, 0, 0], rodillaI: [1, 0, 0] };
function sumarGiros(r, ga, gb = ga, u = 0) {
  for (const p of ARTICULACIONES) for (let i = 0; i < 3; i++) r[p][i] += SIGNO[p][i] * (giro(ga, p, i) + (giro(gb, p, i) - giro(ga, p, i)) * u) * RAD;
  return r;
}
function aplicarPose(j, cuerpo, r) {
  for (const p of ["cabeza", "brazoD", "brazoI", "piernaD", "piernaI", "codoD", "codoI", "rodillaD", "rodillaI"]) j[p].rotation.set(...r[p], "YXZ");
  j.cuerpo.rotation.set(0, 0, 0);
  // El cuerpo gira desde la cadera.
  cuerpo.rotation.set(...r.cuerpo, "YXZ");
  cuerpo.position.set(0, r.alto, 0);
}
// Cuánto dura el paso de una pose a otra al llegar a una marca.
const TRANSICION = 0.4;

// ---------- Utilería low-poly ----------
function calabaza(color = "#e2741d", cara = false) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.5, 16, 10);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 - 0.07 * (1 - Math.cos(a * 8)) / 2;
    p.setXYZ(i, x * k, y * 0.72, z * k);
  }
  geo.computeVertexNormals();
  g.add(malla(geo, mat(color), 0, 0.36, 0));
  const tallo = malla(new THREE.CylinderGeometry(0.04, 0.07, 0.2, 6), mat("#5a3d1e"), 0, 0.78, 0); tallo.rotation.z = 0.2; g.add(tallo);
  if (cara) {
    const luz = brillo("#ffb43a", 2.4);
    const tri = (x, y, s, rot = 0) => { const sh = new THREE.Shape(); sh.moveTo(-s, -s * 0.7); sh.lineTo(s, -s * 0.7); sh.lineTo(0, s * 0.8); const m2 = new THREE.Mesh(new THREE.ShapeGeometry(sh), luz); m2.position.set(x, y, 0.475); m2.rotation.z = rot; return m2; };
    g.add(tri(-0.16, 0.48, 0.08), tri(0.16, 0.48, 0.08), tri(0, 0.36, 0.05));
    const boca = new THREE.Shape(); boca.moveTo(-0.24, 0.26); boca.quadraticCurveTo(0, 0.08, 0.24, 0.26); boca.quadraticCurveTo(0, 0.18, -0.24, 0.26);
    const b = new THREE.Mesh(new THREE.ShapeGeometry(boca), luz); b.position.z = 0.47; g.add(b);
    const l = new THREE.PointLight("#ff9a3a", 1.5, 4, 2); l.position.set(0, 0.4, 0.8); g.add(l);
  }
  return g;
}
function calavera() {
  const g = new THREE.Group(), hueso = mat("#e9dfc6");
  const c = malla(new THREE.IcosahedronGeometry(0.3, 1), hueso, 0, 0.36, 0); c.scale.set(1, 0.95, 1.1); g.add(c);
  g.add(malla(new THREE.BoxGeometry(0.34, 0.14, 0.26), hueso, 0, 0.12, 0.08));
  const negro = mat("#181210");
  for (const x of [-0.11, 0.11]) g.add(malla(new THREE.IcosahedronGeometry(0.075, 0), negro, x, 0.33, 0.27));
  g.add(malla(new THREE.ConeGeometry(0.035, 0.08, 3), negro, 0, 0.22, 0.31));
  return g;
}
function vela(color = "#f2ecd8") {
  const g = new THREE.Group();
  g.add(malla(new THREE.CylinderGeometry(0.06, 0.065, 0.32, 8), mat(color), 0, 0.16, 0));
  g.add(malla(new THREE.ConeGeometry(0.03, 0.09, 6), brillo("#ffcc55", 3), 0, 0.37, 0));
  const l = new THREE.PointLight("#ffb050", 1.2, 3.5, 2); l.position.y = 0.45; g.add(l);
  return g;
}
function farol(color = "#2a2a2e") {
  const g = new THREE.Group(), m = mat(color);
  g.add(malla(new THREE.BoxGeometry(0.4, 0.06, 0.4), m, 0, 0.03, 0));
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) g.add(malla(new THREE.BoxGeometry(0.04, 0.42, 0.04), m, x, 0.27, z));
  g.add(malla(new THREE.BoxGeometry(0.28, 0.34, 0.28), brillo("#ffe2a0", 2), 0, 0.27, 0));
  const techo = malla(new THREE.ConeGeometry(0.32, 0.18, 4), m, 0, 0.57, 0); techo.rotation.y = Math.PI / 4; g.add(techo);
  const l = new THREE.PointLight("#ffd28a", 2.5, 9, 2); l.position.y = 0.3; g.add(l);
  return g;
}
function lapida(color = "#7d8288") {
  const g = new THREE.Group(), m = mat(color);
  g.add(malla(new THREE.BoxGeometry(0.6, 0.62, 0.16), m, 0, 0.31, 0));
  // Medio cilindro acostado: el eje va de frente a atrás y la parte redonda hacia arriba.
  const top = malla(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12, 1, false, Math.PI / 2, Math.PI), m, 0, 0.62, 0); top.rotation.x = Math.PI / 2; g.add(top);
  g.add(malla(new THREE.BoxGeometry(0.06, 0.24, 0.02), mat("#4a4e54"), 0, 0.5, 0.085));
  g.add(malla(new THREE.BoxGeometry(0.18, 0.06, 0.02), mat("#4a4e54"), 0, 0.55, 0.085));
  g.add(malla(new THREE.BoxGeometry(0.8, 0.08, 0.4), mat("#4f5a3a"), 0, 0.04, 0.05));
  return g;
}
function ataud(color = "#3a2a22") {
  const g = new THREE.Group();
  const sh = new THREE.Shape([[-0.25, -1], [0.25, -1], [0.38, 0.45], [0.25, 1], [-0.25, 1], [-0.38, 0.45]].map(([x, y]) => new THREE.Vector2(x, y)));
  const caja = malla(new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: false }), mat(color), 0, 0, 0);
  caja.rotation.x = -Math.PI / 2; g.add(caja);
  const tapa = malla(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }), mat(new THREE.Color(color).offsetHSL(0, 0, 0.06)), 0, 0.4, 0);
  tapa.rotation.x = -Math.PI / 2; g.add(tapa);
  return g;
}
function cubeta(color = "#d9621c") {
  const g = new THREE.Group(), m = mat(color, { side: THREE.DoubleSide });
  g.add(malla(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 12, 1, true), m, 0, 0.15, 0));
  g.add(malla(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12), m, 0, 0.01, 0));
  g.add(malla(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), mat("#e85aa0"), 0, 0.26, 0));
  const asa = malla(new THREE.TorusGeometry(0.21, 0.015, 4, 12, Math.PI), mat("#202020"), 0, 0.3, 0); g.add(asa);
  const negro = mat("#1a0d05");
  for (const x of [-0.07, 0.07]) { const o = malla(new THREE.ConeGeometry(0.035, 0.05, 3), negro, x, 0.19, 0.205); g.add(o); }
  return g;
}
function arbol(color = "#3f8f3a", seco = false) {
  const g = new THREE.Group(), tronco = mat(seco ? "#3a3030" : "#6b4a2b");
  g.add(malla(new THREE.CylinderGeometry(0.14, 0.2, 2.2, 6), tronco, 0, 1.1, 0));
  if (seco) {
    for (const [a, b, l] of [[0.7, 0.3, 1], [-0.6, 1.5, 0.9], [0.5, 2.6, 0.7], [-0.8, 4, 0.8]]) {
      const r = malla(new THREE.CylinderGeometry(0.04, 0.08, l, 5), tronco, 0, 0, 0);
      r.position.set(Math.sin(b) * l * 0.4, 1.5 + l * 0.35, Math.cos(b) * l * 0.4); r.rotation.set(a * Math.cos(b), b, a); g.add(r);
    }
    return g;
  }
  const hojas = mat(color);
  g.add(malla(new THREE.IcosahedronGeometry(1.1, 0), hojas, 0, 2.6, 0));
  g.add(malla(new THREE.IcosahedronGeometry(0.8, 0), hojas, 0.6, 2.2, 0.3));
  g.add(malla(new THREE.IcosahedronGeometry(0.75, 0), hojas, -0.5, 3.1, -0.3));
  return g;
}
function buzon(color = "#3d6f8a") {
  const g = new THREE.Group();
  g.add(malla(new THREE.BoxGeometry(0.1, 1.1, 0.1), mat("#c06a2c"), 0, 0.55, 0));
  g.add(malla(new THREE.BoxGeometry(0.32, 0.22, 0.5), mat(color), 0, 1.2, 0));
  const t = malla(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 10, 1, false, Math.PI / 2, Math.PI), mat(color), 0, 1.31, 0); t.rotation.x = Math.PI / 2; g.add(t);
  g.add(malla(new THREE.BoxGeometry(0.03, 0.18, 0.06), mat("#c33"), 0.17, 1.35, 0.1));
  return g;
}
function cerca(color = "#c06a2c") {
  const g = new THREE.Group(), m = mat(color);
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + i * 0.5;
    g.add(malla(new THREE.BoxGeometry(0.16, 1.1, 0.06), m, x, 0.55, 0));
    const p = malla(new THREE.ConeGeometry(0.115, 0.16, 4), m, x, 1.18, 0); p.rotation.y = Math.PI / 4; p.scale.z = 0.4; g.add(p);
  }
  for (const y of [0.35, 0.85]) g.add(malla(new THREE.BoxGeometry(3, 0.1, 0.05), m, 0, y, -0.06));
  return g;
}
function luna(color = "#f3efd8") {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), brillo(color, 1.6)));
  return g;
}

export const PROPS = {
  calabaza: (d) => calabaza(d.color), calabazaCara: (d) => calabaza(d.color, true), calavera, vela: (d) => vela(d.color), farol: (d) => farol(d.color),
  lapida: (d) => lapida(d.color), ataud: (d) => ataud(d.color), cubeta: (d) => cubeta(d.color), arbol: (d) => arbol(d.color), arbolSeco: () => arbol(null, true),
  buzon: (d) => buzon(d.color), cerca: (d) => cerca(d.color), luna: (d) => luna(d.color),
};
export const COLOR_PROP = { calabaza: "#e2741d", calabazaCara: "#e2741d", vela: "#f2ecd8", farol: "#2a2a2e", lapida: "#7d8288", ataud: "#3a2a22", cubeta: "#d9621c", arbol: "#3f8f3a", buzon: "#3d6f8a", cerca: "#c06a2c", luna: "#f3efd8" };

// ---------- Piezas para crear objetos ----------
// Formas simples que se combinan (y se agrupan) para armar objetos nuevos.
// Miden 1 bloque; el tamaño se cambia por eje con las flechas.
export const FORMAS = {
  cubo: () => new THREE.BoxGeometry(1, 1, 1),
  cilindro: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  esfera: () => new THREE.SphereGeometry(0.5, 16, 12),
  cono: () => new THREE.ConeGeometry(0.5, 1, 16),
  piramide: () => { const g = new THREE.ConeGeometry(0.71, 1, 4); g.rotateY(Math.PI / 4); return g; },
  rampa: () => { const s = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(-0.5, 0.5)]); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; },
  placa: () => new THREE.BoxGeometry(1, 0.06, 1),
  anillo: () => { const g = new THREE.TorusGeometry(0.4, 0.1, 8, 20); return g; },
};
function pieza(d, atlas) {
  const geo = (FORMAS[d.forma] || FORMAS.cubo)();
  geo.translate(0, 0.5, 0); // apoyada en el piso
  let m;
  if (d.bloque && d.forma === "cubo") return bloque(d.bloque, atlas, d.brillo);
  if (d.brillo) m = brillo(d.color || "#ffd28a", 1.8);
  else m = mat(d.color || "#b0b4bc", { flatShading: d.forma !== "esfera" && d.forma !== "cilindro" });
  const g = new THREE.Group(); g.add(malla(geo, m));
  return g;
}

// ---------- Grupos ----------
// Los hijos guardan su posición relativa al grupo; se mueven todos juntos.
async function grupo(d, atlas) {
  const g = new THREE.Group();
  g.userData.hijos = [];
  for (const h of d.hijos || []) {
    const o = await crearObjeto(h, atlas);
    transformar(o, h, 0);
    g.add(o);
    g.userData.hijos.push([o, h]);
  }
  return g;
}

// ---------- Bloque de Kirka ----------
function bloque(id, atlas, brilla = false) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uv = geo.attributes.uv, cell = 1 / ATLAS_TILES, ins = cell / 64;
  const ups = [0, 0, 1, -1, 0, 0];
  for (let f = 0; f < 6; f++) {
    const tile = blockTile(id, ups[f]) ?? 0;
    const u0 = (tile % ATLAS_TILES) * cell + ins, v0 = 1 - Math.floor(tile / ATLAS_TILES) * cell - cell + ins, s = cell - 2 * ins;
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, u0 + uv.getX(i) * s, v0 + uv.getY(i) * s); }
  }
  const o = malla(geo, brilla ? new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(1.8, 1.8, 1.8), alphaTest: 0.5 }) : new THREE.MeshStandardMaterial({ map: atlas, roughness: 1, alphaTest: 0.5 }), 0, 0.5, 0);
  const g = new THREE.Group(); g.add(o);
  return g;
}

// ---------- Modelos importados ----------
const modelos = new Map();
async function cargarModelo(desc) {
  const clave = desc.datos.length + ":" + desc.archivo;
  if (!modelos.has(clave)) {
    const buf = await (await fetch(desc.datos)).arrayBuffer();
    let obj;
    if (/\.obj$/i.test(desc.archivo)) obj = new OBJLoader().parse(new TextDecoder().decode(buf));
    else obj = (await new GLTFLoader().parseAsync(buf, "")).scene;
    // Que mida 2 bloques en su lado más largo y quede parado en el piso.
    const caja = new THREE.Box3().setFromObject(obj), s = caja.getSize(new THREE.Vector3());
    const k = 2 / Math.max(s.x, s.y, s.z, 1e-6);
    obj.scale.multiplyScalar(k);
    const c = caja.getCenter(new THREE.Vector3());
    obj.position.set(-c.x * k, -caja.min.y * k, -c.z * k);
    obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material?.map) m.material.map.colorSpace = THREE.SRGBColorSpace; } });
    modelos.set(clave, obj);
  }
  const g = new THREE.Group(); g.add(modelos.get(clave).clone(true));
  return g;
}

// ---------- Personaje oficial de Kirka ----------
// El modelo (con huesos y sus animaciones) y las texturas de las skins salen de
// la copia propia de RITE Web (/api/kirka/…), que se llena sola desde el visor
// de skywalk. Solo funciona con el estudio abierto en rite.lat/studio.
export const API_KIRKA = "/api/kirka";
let modeloKirka = null;
const bytesModeloKirka = () => (modeloKirka ||= fetch(API_KIRKA + "/model").then((r) => { if (!r.ok) throw new Error("modelo"); return r.arrayBuffer(); }).catch((e) => { modeloKirka = null; throw e; }));
const texturasKirka = new Map();
function texturaKirka(nombre) {
  if (!texturasKirka.has(nombre)) {
    const t = new THREE.TextureLoader().load(API_KIRKA + "/texture?item=" + encodeURIComponent(nombre), () => dispatchEvent(new Event("rite-textura")));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    texturasKirka.set(nombre, t);
  }
  return texturasKirka.get(nombre);
}
// Armas oficiales: un GLB por tipo y una textura por skin.
const modelosArma = new Map();
const bytesArma = (tipo) => {
  // Primero la copia que viene con el estudio (armas-kirka/); si falta, la de RITE Web.
  const pedir = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error("arma"); return r.arrayBuffer(); });
  if (!modelosArma.has(tipo)) modelosArma.set(tipo, pedir(new URL(`armas-kirka/${encodeURIComponent(tipo)}.glb`, import.meta.url).href)
    .catch(() => pedir(API_KIRKA + "/weapon-model?type=" + encodeURIComponent(tipo)))
    .catch((e) => { modelosArma.delete(tipo); throw e; }));
  return modelosArma.get(tipo);
};
const texturasArma = new Map();
function texturaArma(tipo, skin) {
  const k = tipo + "/" + skin;
  if (!texturasArma.has(k)) {
    const t = new THREE.TextureLoader().load(`${API_KIRKA}/weapon-texture?type=${encodeURIComponent(tipo)}&item=${encodeURIComponent(skin)}`, () => dispatchEvent(new Event("rite-textura")));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    texturasArma.set(k, t);
  }
  return texturasArma.get(k);
}
async function armaKirka(tipo, skin) {
  const modelo = (await new GLTFLoader().parseAsync((await bytesArma(tipo)).slice(0), "")).scene;
  const tex = skin ? texturaArma(tipo, skin) : null;
  modelo.traverse((m) => {
    if (!m.isMesh) return;
    const viejo = Array.isArray(m.material) ? m.material[0] : m.material;
    const map = tex || viejo?.map || null;
    m.material = new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : "#5a5e68", roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide, transparent: viejo?.transparent, alphaTest: viejo?.alphaTest || 0 });
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  });
  return acomodarArmaKirka(modelo, tipo);
}

// Poses de la estudio que no existen en el modelo oficial: la más parecida.
const POSE_OFICIAL = { parado: "stand", caminar: "run", correr: "run", sentado: "squat", festejar: "pose1", saludar: "pose2", bailar: "pose3" };
async function personajeKirka(desc) {
  const gltf = await new GLTFLoader().parseAsync((await bytesModeloKirka()).slice(0), "");
  const modelo = gltf.scene;
  const tex = texturaKirka(desc.kirka);
  modelo.traverse((m) => {
    if (!m.isMesh) return;
    m.material = matPersonaje(desc, { map: tex, side: THREE.DoubleSide });
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  });
  // Que mida 1.8 bloques (como un jugador) y quede parado en el piso.
  modelo.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(modelo), tam = caja.getSize(new THREE.Vector3());
  const k = 1.8 / Math.max(tam.y, 1e-6);
  const raiz = new THREE.Group(), ajuste = new THREE.Group();
  // El modelo de Kirka mira hacia -z (RITE Web lo dibuja de frente con yaw 172°);
  // en el studio los personajes miran a +z, así que se voltea media vuelta.
  ajuste.scale.setScalar(k); ajuste.rotation.y = Math.PI;
  const c = caja.getCenter(new THREE.Vector3());
  ajuste.position.set(c.x * k, -caja.min.y * k, c.z * k);
  const cuerpoK = new THREE.Group();
  ajuste.add(modelo); cuerpoK.add(ajuste); raiz.add(cuerpoK);
  const mezclador = new THREE.AnimationMixer(modelo);
  const acciones = new Map(gltf.animations.map((clip) => [clip.name, mezclador.clipAction(clip)]));
  // Huesos del modelo de Kirka: head, body2, leftArm1/2, rightArm1/2,
  // leftLeg1/2, rightLeg1/2 (1 = hombro o cadera, 2 = codo o rodilla).
  const nodos = []; modelo.traverse((h) => { if (h.isBone) nodos.push(h); });
  const buscar = (re) => nodos.find((h) => re.test(h.name || ""));
  const huesos = {};
  huesos.cabeza = buscar(/^head$/i) || buscar(/head|cabeza/i);
  // Derecha e izquierda del personaje según dónde quedan, no según el nombre.
  raiz.updateMatrixWorld(true);
  const xDe = (h) => cuerpoK.worldToLocal(h.getWorldPosition(new THREE.Vector3())).x;
  const par = (re1, re2, d, i, dd, ii) => {
    const unos = nodos.filter((h) => re1.test(h.name || ""));
    if (unos.length < 2) return;
    unos.sort((x, y) => xDe(x) - xDe(y)); // el de x menor es el derecho (mira a +z)
    for (const [h, parte, hijo] of [[unos[0], d, dd], [unos[1], i, ii]]) {
      huesos[parte] = h;
      huesos[hijo] = h.children.find((c) => c.isBone && re2.test(c.name || "")) || h.children.find((c) => c.isBone);
    }
  };
  par(/arm[_ .-]?1$|upper[_ .-]?arm/i, /arm[_ .-]?2$|fore|lower/i, "brazoD", "brazoI", "codoD", "codoI");
  par(/leg[_ .-]?1$|thigh|up[_ .-]?leg/i, /leg[_ .-]?2$|shin|calf|knee|lower/i, "piernaD", "piernaI", "rodillaD", "rodillaI");
  for (const k of Object.keys(huesos)) if (!huesos[k]) delete huesos[k];
  const base = new Map(Object.values(huesos).map((h) => [h, h.quaternion.clone()]));
  // Postura con la que se modeló la malla ("bind pose"): brazos y piernas
  // derechos. Se guarda cada hueso respecto al cuerpo (body2), y las poses del
  // studio parten de ahí, igual que el personaje de bloques.
  const antes = new Map(nodos.map((h) => [h, [h.position.clone(), h.quaternion.clone(), h.scale.clone()]]));
  let esq = null; modelo.traverse((m) => { if (m.isSkinnedMesh && !esq) esq = m.skeleton; });
  const tronco = buscar(/^body/i) || nodos[0];
  const relativo = new Map();
  if (esq) {
    esq.pose();
    const qt = tronco.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const h of nodos) relativo.set(h, qt.clone().multiply(h.getWorldQuaternion(new THREE.Quaternion())));

  }
  for (const [h, [p, q2, e2]] of antes) { h.position.copy(p); h.quaternion.copy(q2); h.scale.copy(e2); }
  raiz.updateMatrixWorld(true);
  if (esq) {
    // En esa postura los brazos van un poco hacia adelante: se enderezan para que
    // cada tramo (su eje +y va a lo largo) apunte derecho hacia abajo.
    const qCi0 = cuerpoK.getWorldQuaternion(new THREE.Quaternion()).invert();
    const qT0 = qCi0.clone().multiply(tronco.getWorldQuaternion(new THREE.Quaternion()));
    for (const h of nodos) {
      if (!/arm|leg/i.test(h.name || "")) continue;
      const enC = qT0.clone().multiply(relativo.get(h)); // en el espacio del personaje
      const eje = new THREE.Vector3(0, 1, 0).applyQuaternion(enC);
      const recto = new THREE.Quaternion().setFromUnitVectors(eje, new THREE.Vector3(0, -1, 0));
      relativo.set(h, qT0.clone().invert().multiply(recto.multiply(enC)));
    }
  }
  const nombre = (p) => (acciones.has(p) ? p : acciones.has(POSE_OFICIAL[p]) ? POSE_OFICIAL[p] : acciones.has("stand") ? "stand" : [...acciones.keys()][0]);
  raiz.userData.clips = [...acciones.keys()];
  // Si tiene huesos de brazos, piernas y cabeza, puede hacer las mismas poses
  // y animaciones que los personajes de bloques (las del ejemplo, las marcas…).
  raiz.userData.rig = ["cabeza", "brazoD", "brazoI", "piernaD", "piernaI"].every((p) => huesos[p] && relativo.has(huesos[p]));
  // Orden de padre a hijo; cada giro se suma al de su padre, como en el de bloques.
  const CADENA = [["cabeza", null], ["brazoD", null], ["codoD", "brazoD"], ["brazoI", null], ["codoI", "brazoI"], ["piernaD", null], ["rodillaD", "piernaD"], ["piernaI", null], ["rodillaI", "piernaI"]];
  const qC = new THREE.Quaternion(), qW = new THREE.Quaternion(), qP = new THREE.Quaternion(), e = new THREE.Euler();
  raiz.userData.oficial = (pa, pb, w, t, r, rig = false) => {
    for (const [h, qb] of base) h.quaternion.copy(qb);
    if (rig) for (const [h, [p, q2]] of antes) { h.position.copy(p); h.quaternion.copy(q2); }
    const A = rig ? nombre("parado") : nombre(pa), B = rig ? A : nombre(pb);
    for (const [n, acc] of acciones) {
      // Con las poses del studio se parte del modelo quieto (brazos abajo), sin clip.
      const peso = rig ? 0 : (n === A ? 1 - w : 0) + (n === B ? w : 0);
      acc.enabled = peso > 0; acc.setEffectiveWeight(peso); acc.play();
      acc.time = rig ? 0 : t % (acc.getClip().duration || 1);
    }
    mezclador.update(0);
    if (rig) {
      cuerpoK.rotation.set(...r.cuerpo, "YXZ");
      cuerpoK.position.y = r.alto || 0;
    } else { cuerpoK.rotation.set(0, 0, 0); cuerpoK.position.y = 0; }
    // Los giros van en los ejes del personaje (adelante, de lado…), no en los
    // ejes propios de cada hueso, que en el modelo de Kirka están chuecos.
    raiz.updateMatrixWorld(true);
    cuerpoK.getWorldQuaternion(qC); const qCi = qC.clone().invert();
    const marco = new Map(); // orientación de cada hueso en el espacio del personaje
    const qT = qCi.clone().multiply(tronco.getWorldQuaternion(qW));
    for (const [parte] of CADENA) if (huesos[parte]) marco.set(parte, rig && relativo.has(huesos[parte]) ? qT.clone().multiply(relativo.get(huesos[parte])) : qCi.clone().multiply(huesos[parte].getWorldQuaternion(qW)));
    const acum = {};
    for (const [parte, padre] of CADENA) {
      const h = huesos[parte]; if (!h) continue;
      const g = r[parte] || [0, 0, 0];
      const D = new THREE.Quaternion().setFromEuler(e.set(g[0], g[1], g[2], "YXZ"));
      if (padre && acum[padre]) D.premultiply(acum[padre]);
      acum[parte] = D;
      if (!rig && !g.some(Boolean)) continue; // sin giro propio sigue a su padre solo
      // Orientación deseada en el personaje → local respecto al padre.
      const T = D.clone().multiply(marco.get(parte));
      h.parent.getWorldQuaternion(qP); qP.premultiply(qCi);
      h.quaternion.copy(qP.invert().multiply(T));
      h.updateMatrixWorld(true);
    }
  };
  // Mano derecha: al final del antebrazo. Cada tramo corre a lo largo de su eje +y
  // y el antebrazo mide más o menos lo mismo que el brazo (hombro → codo).
  if (huesos.codoD && huesos.brazoD) {
    const w = (h) => h.getWorldPosition(new THREE.Vector3());
    const largo = w(huesos.brazoD).distanceTo(w(huesos.codoD)) / (huesos.codoD.getWorldScale(new THREE.Vector3()).x || 1);
    raiz.userData.mano = { hueso: huesos.codoD, pos: new THREE.Vector3(0, largo * 0.85, 0) };
  }
  return raiz;
}

// ---------- Luz ----------
function luzPuntual(d) {
  const g = new THREE.Group();
  const l = new THREE.PointLight(d.color || "#ffd28a", (d.fuerza ?? 1) * 6, (d.alcance ?? 1) * 12, 2);
  l.castShadow = !!d.sombra; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002;
  g.add(l);
  const foco = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), brillo(d.color || "#ffd28a", 2));
  foco.userData.ayudante = !d.verFoco;
  g.add(foco);
  return g;
}

// Arma el objeto 3D de una descripción del proyecto.
export async function crearObjeto(d, atlas) {
  let o;
  if (d.tipo === "personaje" && typeof d.kirka === "string" && d.kirka) o = await personajeKirka(d).catch(() => personaje(d));
  else if (d.tipo === "personaje") o = personaje(d, d.skin ? (d.brazos === 3 || d.brazos === 4 ? d.brazos : await detectarBrazos(d.skin)) : 4, d.skin && d.capa3d !== false ? await pixelesSkin(d.skin) : null);
  else if (d.tipo === "prop") o = (PROPS[d.cual] || PROPS.calabaza)(d);
  else if (d.tipo === "bloque") o = bloque(d.bloque || 1, atlas);
  else if (d.tipo === "modelo") o = await cargarModelo(d);
  else if (d.tipo === "luz") o = luzPuntual(d);
  else if (d.tipo === "pieza") o = pieza(d, atlas);
  else if (d.tipo === "grupo") o = await grupo(d, atlas);
  else o = new THREE.Group();
  if (d.tipo === "personaje" && d.armaKirka && o.userData.mano) {
    // Modelo oficial de Kirka; si no carga (estudio fuera de rite.lat), va sin arma.
    const arma = await armaKirka(d.armaKirka, d.skinArma).catch(() => null);
    if (arma) {
      // Postura base (brazos abajo) para que el arma quede bien tomada.
      if (o.userData.oficial && o.userData.rig) o.userData.oficial("parado", "parado", 0, 0, vacio(), true);
      const env = adjuntarArma(o, o.userData.mano, arma);
      o.userData.fogonazo = crearFogonazo(env, arma, d.armaKirka);
    }
  }
  o.traverse((m) => { if (m.isMesh && m.castShadow === undefined) m.castShadow = true; });
  o.userData.desc = d;
  return o;
}

// La forma: si cambia, hay que volver a armar el objeto.
export const forma = (d) => JSON.stringify([d.tipo, d.cual, d.forma, d.brillo, d.color, d.bloque, d.skin?.length, d.skin?.slice(-40), d.skinBase, d.brazos, d.kirka, d.acabado, d.emision, d.capa3d, d.armaKirka, d.skinArma, d.datos?.length, d.archivo, d.fuerza, d.alcance, d.sombra,
  d.hijos && d.hijos.map((h) => [forma(h), h.pos, h.rot, h.escala, h.escalaXYZ, h.pose, h.giros])]);

const suaviza = (u) => u * u * (3 - 2 * u);
const poseDe = (d, k, moviendo) => {
  const p = (k && k.pose) || d.pose || "auto";
  return p === "auto" ? (moviendo ? "caminar" : "parado") : p;
};
const girosDe = (d, k) => (k && k.giros) || d.giros;
// Dónde está y cómo se mueve el objeto en el segundo t.
export function transformar(o, d, t) {
  let pos = d.pos, rot = d.rot || [0, 0, 0];
  let moviendo = false, a = null, b = null, u = 0;
  const k = d.claves || [];
  if (k.length) {
    if (t <= k[0].t) a = b = k[0];
    else if (t >= k.at(-1).t) a = b = k.at(-1);
    else {
      const i = k.findIndex((q, j) => t >= q.t && t <= k[j + 1].t);
      a = k[i]; b = k[i + 1];
      u = suaviza((t - a.t) / (b.t - a.t || 1));
      moviendo = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]) > 0.05;
    }
    pos = a.pos.map((v, n) => v + (b.pos[n] - v) * u);
    rot = a.rot.map((v, n) => v + (b.rot[n] - v) * u);
  }
  o.position.set(...pos);
  o.rotation.set(rot[0] * RAD, rot[1] * RAD, rot[2] * RAD, "YXZ");
  if (o.userData.fogonazo) animarFogonazo(o.userData.fogonazo, d.disparos, t);
  if (d.escalaXYZ) o.scale.set(...d.escalaXYZ); else o.scale.setScalar(d.escala ?? 1);
  if (o.userData.hijos) for (const [h, hd] of o.userData.hijos) if (hd.tipo === "personaje" || hd.tipo === "grupo") transformar(h, hd, t);
  const esNuestra = (p) => POSES.includes(p) || p === "auto";
  if (o.userData.oficial) {
    const tt = t + (d.fase || 0), pa = poseDe(d, a, moviendo), pb = b && b !== a ? poseDe(d, b, moviendo) : pa;
    const w = pb === pa ? 0 : suaviza(Math.min(1, Math.max(0, (t - (b.t - TRANSICION)) / TRANSICION)));
    if (o.userData.rig && esNuestra(pa) && esNuestra(pb)) {
      // Las poses del studio (caminar, saludar, zombi…) se hacen igual que con
      // la skin de bloques, así una animación no cambia al ponerle skin de Kirka.
      let r = posar(pa, tt);
      if (w > 0) r = mezclar(r, posar(pb, tt), w);
      o.userData.oficial(pa, pb, 0, tt, sumarGiros(r, girosDe(d, a), girosDe(d, b), u), true);
    } else o.userData.oficial(pa, pb, w, tt, sumarGiros(vacio(), girosDe(d, a), girosDe(d, b), u));
  }
  if (o.userData.pose) {
    const tt = t + (d.fase || 0);
    let r = posar(poseDe(d, a, moviendo), tt);
    if (b && b !== a) {
      // La pose de la marca siguiente entra en los últimos instantes del tramo.
      const pb = poseDe(d, b, moviendo);
      const w = suaviza(Math.min(1, Math.max(0, (t - (b.t - TRANSICION)) / TRANSICION)));
      if (w > 0 && pb !== poseDe(d, a, moviendo)) r = mezclar(r, posar(pb, tt), w);
    }
    o.userData.pose(sumarGiros(r, girosDe(d, a), girosDe(d, b), u));
  }
}

// Pose y giros del personaje en el segundo t (para empezar una marca nueva).
export function estadoPose(d, t) {
  const k = d.claves || [];
  if (!k.length) return { pose: d.pose || "auto", giros: structuredClone(giros(d.giros)) };
  let a = k[0], b = k[0], u = 0;
  if (t >= k.at(-1).t) a = b = k.at(-1);
  else if (t > k[0].t) { const i = k.findIndex((q, j) => t >= q.t && t <= k[j + 1].t); a = k[i]; b = k[i + 1]; u = suaviza((t - a.t) / (b.t - a.t || 1)); }
  const g = {};
  for (const p of ARTICULACIONES) {
    const v = [0, 1, 2].map((i) => { const x = giro(girosDe(d, a), p, i); return Math.round(x + (giro(girosDe(d, b), p, i) - x) * u); });
    if (v.some(Boolean)) g[p] = v;
  }
  return { pose: (a.pose || d.pose || "auto"), giros: g };
}
