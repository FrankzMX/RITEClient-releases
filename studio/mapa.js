// Arma el mapa de Kirka como una sola malla con la luz ya "horneada" en cada
// vértice: luz del cielo, luz de los bloques de luz (212-214), sombra en las
// esquinas (oclusión ambiental) y el sombreado por cara. Los colores pasan de 1
// en los bloques de luz para que el bloom los haga brillar.
import * as THREE from "three";
import { ATLAS_TILES, BLOCK_SHAPES, SEE_THROUGH, HIDDEN, blockTile } from "./bloques.js";
import { FACES, CUBE_UV, hides, shapeQuads } from "./formas.js";

export const CHUNK = 16;
const idx = (x, y, z) => x + CHUNK * z + CHUNK * CHUNK * y;

// Bloques que dan luz y cuánta (0-15). [deducido] Kirka no documenta el alcance.
export const LUCES = { 212: 15, 213: 15, 214: 15 };

// Lee chunks___DATA (tramos [índice, id, cuántos]) a arreglos de 16³.
export function leerChunks(json, ocultar = []) {
  const chunks = {};
  const fuera = new Set(ocultar);
  for (const [k, tramos] of Object.entries(json.chunks___DATA || {})) {
    const a = new Uint16Array(CHUNK ** 3);
    for (const [i, id, n] of tramos) if (!fuera.has(id)) a.fill(id, i, i + (n || 1));
    chunks[k] = a;
  }
  return chunks;
}

// Quita los bloques de una caja (para ver adentro: techos, muros).
export function cortar(chunks, [x1, y1, z1, x2, y2, z2]) {
  for (const [k, a] of Object.entries(chunks)) {
    const [cx, cy, cz] = k.split(",").map(Number);
    for (let i = 0; i < a.length; i++) {
      const x = cx * 16 + (i % 16), y = cy * 16 + Math.floor(i / 256), z = cz * 16 + (Math.floor(i / 16) % 16);
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2 && z >= z1 && z <= z2) a[i] = 0;
    }
  }
}

export function lector(chunks) {
  return (x, y, z) => {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), cz = Math.floor(z / CHUNK);
    const b = chunks[`${cx},${cy},${cz}`];
    return b ? b[idx(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK)] : 0;
  };
}

// Tapa la luz: bloque completo que no se ve a través.
const opaco = (id) => !!id && !BLOCK_SHAPES[id] && !SEE_THROUGH.has(id) && !HIDDEN.has(id);

// Luz por celdas (0-15) dentro de la caja del mapa, como en los juegos de
// bloques: baja 1 por cada bloque que avanza y no cruza bloques opacos.
function calcularLuz(bloque, caja) {
  const m = 16;
  const x0 = caja.min.x - m, y0 = Math.max(caja.min.y - m, -64), z0 = caja.min.z - m;
  const X = caja.max.x - x0 + m, Y = caja.max.y - y0 + m, Z = caja.max.z - z0 + m;
  const n = X * Y * Z;
  const op = new Uint8Array(n);
  const cielo = new Uint8Array(n);
  const lamp = new Uint8Array(n);
  const at = (x, y, z) => (x - x0) + X * ((z - z0) + Z * (y - y0));
  for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const id = bloque(x + x0, y + y0, z + z0);
    const i = x + X * (z + Z * y);
    if (opaco(id)) op[i] = 1;
    if (LUCES[id]) lamp[i] = LUCES[id];
  }
  // Cielo: columnas abiertas hacia arriba en 15.
  for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    for (let y = Y - 1; y >= 0; y--) { const i = x + X * (z + Z * y); if (op[i]) break; cielo[i] = 15; }
  }
  const esparcir = (luz) => {
    let cola = [];
    for (let i = 0; i < n; i++) if (luz[i] > 1) cola.push(i);
    const pasos = [1, -1, X, -X, X * Z, -X * Z];
    while (cola.length) {
      const sig = [];
      for (const i of cola) {
        const v = luz[i] - 1;
        const x = i % X, rest = (i - x) / X, z = rest % Z;
        for (let s = 0; s < 6; s++) {
          if ((s === 0 && x === X - 1) || (s === 1 && x === 0) || (s === 2 && z === Z - 1) || (s === 3 && z === 0)) continue;
          const j = i + pasos[s];
          if (j < 0 || j >= n || op[j] || luz[j] >= v) continue;
          luz[j] = v; if (v > 1) sig.push(j);
        }
      }
      cola = sig;
    }
  };
  esparcir(cielo); esparcir(lamp);
  const dentro = (x, y, z) => x >= x0 && y >= y0 && z >= z0 && x < x0 + X && y < y0 + Y && z < z0 + Z;
  return {
    cielo: (x, y, z) => (dentro(x, y, z) ? cielo[at(x, y, z)] : 15),
    lamp: (x, y, z) => (dentro(x, y, z) ? lamp[at(x, y, z)] : 0),
    opaco: (x, y, z) => (dentro(x, y, z) ? op[at(x, y, z)] === 1 : false),
  };
}

// Ajustes de luz a partir del JSON del mapa (los nombres de Kirka) y extras.
export function ajustesLuz(json, extra = {}) {
  const g = (k, d) => (json[k + "___DATA"] ?? d);
  const a = {
    luz: g("light", 0.5), luzBloques: g("blockLight", 0.9), brillo: g("brightness", 1.6),
    tinte: g("fogAmbientColor", "#ffffff"), sol: [g("sunX", -30), g("sunY", 60), g("sunZ", 25)],
    fuerzaSol: g("sunStrength", 0.6), colorLampara: "#ffe2b0", ao: 0.55, curva: 1.8, interior: 0.35,
  };
  return { ...a, ...extra };
}

export function construirMapa(chunks, L) {
  const bloque = lector(chunks);
  // Caja de lo que hay.
  const caja = new THREE.Box3();
  for (const [k, a] of Object.entries(chunks)) {
    const [cx, cy, cz] = k.split(",").map(Number);
    for (let i = 0; i < a.length; i++) if (a[i]) {
      const x = cx * 16 + (i % 16), y = cy * 16 + Math.floor(i / 256), z = cz * 16 + (Math.floor(i / 16) % 16);
      caja.expandByPoint(new THREE.Vector3(x, y, z));
    }
  }
  const luz = calcularLuz(bloque, caja);
  // Por vértice se guarda la luz "cruda"; colorear() la convierte en color
  // con los ajustes, así cambiar la luz no rearma la malla.
  const pos = [], uvs = [], ind = [], plano = [];
  const vCie = [], vLam = [], vOcc = [], vSh = [], vN = [], vTipo = [];
  const cell = 1 / ATLAS_TILES, inset = cell / 64;
  for (const [key, blocks] of Object.entries(chunks)) {
    const [cx, cy, cz] = key.split(",").map(Number);
    for (let i = 0; i < blocks.length; i++) {
      const id = blocks[i];
      if (!id || HIDDEN.has(id)) continue;
      const wx = cx * 16 + (i % 16), wy = cy * 16 + Math.floor(i / 256), wz = cz * 16 + (Math.floor(i / 16) % 16);
      const forma = BLOCK_SHAPES[id];
      const quads = forma ? shapeQuads(forma) : FACES.map((f) => ({ ...f, side: f.n, uv: CUBE_UV }));
      const brilla = LUCES[id];
      for (const q of quads) {
        if (q.side && hides(bloque(wx + q.side[0], wy + q.side[1], wz + q.side[2]), id)) continue;
        const base = pos.length / 3;
        const eje = q.n.findIndex((c) => Math.abs(c) > 0.9);
        const cubo = !forma && eje >= 0;
        const tile = brilla ? null : blockTile(id, Math.round(q.n[1]));
        const tipo = brilla ? 1 : tile === null ? 2 : 0;
        const peso = [];
        for (const v of q.v) {
          pos.push(wx + v[0], wy + v[1], wz + v[2]);
          vSh.push(q.shade); vN.push(...q.n); vTipo.push(tipo);
          let c = 0, l = 0, occ = 0;
          if (brilla) { c = 1; l = 15; }
          else if (!cubo) { c = luz.cielo(wx, wy, wz) / 15; l = luz.lamp(wx, wy, wz); }
          else {
            // Luz suave: las 4 celdas frente a la cara que tocan esta esquina.
            const f = [wx + q.n[0], wy + q.n[1], wz + q.n[2]];
            const [t1, t2] = [0, 1, 2].filter((k) => k !== eje);
            const p = [wx + v[0], wy + v[1], wz + v[2]];
            let sc = 0, sl = 0, cuenta = 0, lados = 0, esquina = false;
            for (const o1 of [p[t1] - 1, p[t1]]) for (const o2 of [p[t2] - 1, p[t2]]) {
              const cc = [...f]; cc[t1] = o1; cc[t2] = o2;
              const d1 = o1 !== f[t1], d2 = o2 !== f[t2];
              if (luz.opaco(cc[0], cc[1], cc[2])) { if (d1 && d2) esquina = true; else if (d1 || d2) lados++; continue; }
              sc += luz.cielo(cc[0], cc[1], cc[2]); sl += luz.lamp(cc[0], cc[1], cc[2]); cuenta++;
            }
            occ = lados === 2 ? 3 : lados + (esquina ? 1 : 0);
            const k = Math.max(cuenta, 1);
            c = sc / k / 15; l = sl / k;
          }
          vCie.push(c); vLam.push(l); vOcc.push(occ);
          peso.push(c * 15 + l - occ * 5);
        }
        if (tile === null) { uvs.push(0, 0, 0, 0, 0, 0, 0, 0); plano.push(base, base + 1, base + 2, base, base + 2, base + 3); continue; }
        const u0 = (tile % ATLAS_TILES) * cell + inset, v0 = 1 - Math.floor(tile / ATLAS_TILES) * cell - cell + inset, s = cell - inset * 2;
        for (const [u, v] of q.uv) uvs.push(u0 + u * s, v0 + v * s);
        // Partir el cuadro por la diagonal más clara (evita rayas en la sombra).
        if (peso[0] + peso[2] < peso[1] + peso[3]) ind.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
        else ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  const nv = pos.length / 3;
  const col = new Float32Array(nv * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(vN, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute([...ind, ...plano], 1) : [...ind, ...plano]);
  geo.addGroup(0, ind.length, 0);
  geo.addGroup(ind.length, plano.length, 1);
  geo.computeBoundingSphere();
  // Lambert: la luz horneada va en los colores y encima suman el sol, las
  // sombras y las luces que se agreguen en el estudio.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const matPlano = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, [mat, matPlano]);
  mesh.receiveShadow = true; mesh.castShadow = true;

  // div: la luz ambiente de la escena (AmbientLight); los colores se dividen
  // entre ella para que mapa y objetos queden igual de iluminados.
  function colorear(L, div = [1, 1, 1]) {
    const tinte = new THREE.Color(L.tinte), lampC = new THREE.Color(L.colorLampara);
    const sd = new THREE.Vector3(...L.sol).normalize();
    for (let i = 0; i < nv; i++) {
      const o = i * 3;
      if (vTipo[i] === 1) { const b = L.brilloLuces ?? 1.7; col[o] = (b * lampC.r) / div[0]; col[o + 1] = (b * lampC.g) / div[1]; col[o + 2] = (b * lampC.b) / div[2]; continue; }
      const cie = vCie[i];
      const sol = Math.max(0, vN[o] * sd.x + vN[o + 1] * sd.y + vN[o + 2] * sd.z) * L.fuerzaSol * 0.45 * cie;
      const amb = L.luz * (L.interior + (1 - L.interior) * cie + sol);
      const lb = L.luzBloques * Math.pow(vLam[i] / 15, L.curva);
      const f = L.brillo * vSh[i] * (1 - (vOcc[i] / 3) * L.ao) * (vTipo[i] === 2 ? 0.55 : 1);
      col[o] = (f * (amb * tinte.r + lb * lampC.r)) / div[0];
      col[o + 1] = (f * (amb * tinte.g + lb * lampC.g)) / div[1];
      col[o + 2] = (f * (amb * tinte.b + lb * lampC.b)) / div[2];
    }
    geo.attributes.color.needsUpdate = true;
  }
  colorear(L);
  return { mesh, caja, bloque, colorear, solido: (x, y, z) => opaco(bloque(x, y, z)), ponerAtlas: (t) => { mat.map = t; mat.needsUpdate = true; }, liberar: () => { geo.dispose(); mat.dispose(); matPlano.dispose(); } };
}
