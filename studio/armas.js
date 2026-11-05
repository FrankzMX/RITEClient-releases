// Armas oficiales de Kirka en la mano de los personajes.
import * as THREE from "three";

// Pone el arma en la mano derecha. «mano» = { hueso, pos } y el personaje debe
// estar en su postura base (brazos derechos hacia abajo): con el brazo abajo el
// cañón apunta al piso y, al levantarlo para apuntar, mira al frente.
export function adjuntarArma(raiz, mano, arma) {
  if (!arma || !mano?.hueso) return null;
  raiz.updateMatrixWorld(true);
  const qR = raiz.getWorldQuaternion(new THREE.Quaternion()).invert();
  const B = qR.multiply(mano.hueso.getWorldQuaternion(new THREE.Quaternion())); // hueso en el espacio del personaje
  const W0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // cañón abajo, arriba al frente
  const envoltura = new THREE.Group();
  envoltura.quaternion.copy(B.invert().multiply(W0));
  envoltura.position.copy(mano.pos);
  const s = mano.hueso.getWorldScale(new THREE.Vector3()).x / raiz.getWorldScale(new THREE.Vector3()).x;
  envoltura.scale.setScalar(1 / (s || 1));
  envoltura.add(arma);
  envoltura.userData.arma = true;
  mano.hueso.add(envoltura);
  return envoltura;
}

// ---------- Armas oficiales de Kirka ----------
// Los modelos (GLB) vienen de la copia propia de RITE Web. No se sabe de antemano
// hacia dónde mira cada modelo, así que se acomoda solo mirando su forma:
// el eje más largo es el cañón; la punta es el extremo más delgado (en el hacha,
// el más ancho); arriba es donde va el cañón en la punta; y la mano va en lo
// primero que cuelga hacia abajo desde atrás (la empuñadura).
export const ARMAS_KIRKA = ["AR-9", "SCAR", "LAR", "M60", "VITA", "Shark", "Weatie", "MAC-10", "Revolver", "Bayonet", "Tomahawk"];
// Largo en metros (un personaje mide 1.8).
const LARGO_KIRKA = { "AR-9": 1.05, SCAR: 1.05, LAR: 1.15, M60: 1.25, VITA: 1.3, Shark: 0.5, Weatie: 0.95, "MAC-10": 0.6, Revolver: 0.5, Bayonet: 0.45, Tomahawk: 0.65 };
const CUERPO_A_CUERPO = new Set(["Bayonet", "Tomahawk"]);

export function acomodarArmaKirka(modelo, tipo) {
  modelo.updateMatrixWorld(true);
  const pts = [];
  const v = new THREE.Vector3();
  modelo.traverse((m) => {
    const pos = m.isMesh && m.geometry?.attributes?.position;
    if (!pos) return;
    const paso = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += paso) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).toArray());
  });
  const g = new THREE.Group();
  if (!pts.length) { g.add(modelo); return g; }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const ext = [0, 1, 2].map((k) => max[k] - min[k]);
  const [L, H, W] = [0, 1, 2].sort((a, b) => ext[b] - ext[a]); // largo, alto, ancho
  const u = (p, k) => (p[k] - min[k]) / (ext[k] || 1); // 0..1 dentro de la caja
  // Alto de cada extremo (20 % del largo): la punta del cañón es el más delgado.
  const alto = (desde, hasta) => { let a = Infinity, b = -Infinity; for (const p of pts) { const x = u(p, L); if (x >= desde && x <= hasta) { a = Math.min(a, p[H]); b = Math.max(b, p[H]); } } return b > a ? b - a : 0; };
  let sL = alto(0.8, 1) <= alto(0, 0.2) ? 1 : -1;
  if (tipo === "Tomahawk") sL = -sL;
  // Arriba: en la punta, el cañón queda en la parte de arriba de la caja.
  const punta = pts.filter((p) => (sL > 0 ? u(p, L) >= 0.85 : u(p, L) <= 0.15));
  const medio = punta.reduce((a, p) => a + u(p, H), 0) / (punta.length || 1);
  const sH = CUERPO_A_CUERPO.has(tipo) || medio >= 0.5 ? 1 : -1;
  // Agarre: en la parte de atrás, lo primero que cuelga hacia abajo (la empuñadura).
  const atras = (p) => (sL > 0 ? u(p, L) : 1 - u(p, L));
  let agarre = [0, 0, 0];
  agarre[W] = (min[W] + max[W]) / 2;
  if (CUERPO_A_CUERPO.has(tipo)) {
    agarre[L] = sL > 0 ? min[L] + ext[L] * 0.12 : max[L] - ext[L] * 0.12;
    agarre[H] = (min[H] + max[H]) / 2;
  } else {
    // La empuñadura es lo que cuelga más atrás (el cargador cuelga más adelante).
    const bajo = (p) => (sH > 0 ? u(p, H) : 1 - u(p, H)) < 0.3;
    let atrasMax = null;
    for (const p of pts) { const a = atras(p); if (a < 0.02 || a > 0.65 || !bajo(p)) continue; if (atrasMax == null || a < atrasMax) atrasMax = a; }
    const a = (atrasMax ?? 0.4) + 0.06;
    agarre[L] = sL > 0 ? min[L] + ext[L] * a : max[L] - ext[L] * a;
    agarre[H] = sH > 0 ? min[H] + ext[H] * 0.45 : max[H] - ext[H] * 0.45;
  }
  // Los modelos de Kirka traen dos puntos: «Lever» (donde va la mano) y
  // «Muzzle» (la punta del cañón). Si están, mandan sobre lo que se adivinó.
  const lever = modelo.getObjectByName("Lever"), muzzle = modelo.getObjectByName("Muzzle");
  // (En el hacha y el cuchillo «Lever» no es el mango, así que ahí no se usa.)
  if (lever && muzzle) {
    const pL = lever.getWorldPosition(new THREE.Vector3());
    agarre = pL.toArray();
    {
      const pM = muzzle.getWorldPosition(new THREE.Vector3());
      const frente = pM.clone().sub(pL); frente.y = 0; frente.normalize();
      const arriba = new THREE.Vector3(0, 1, 0), lado = new THREE.Vector3().crossVectors(arriba, frente);
      // Matriz que lleva frente → +z, arriba → +y, lado → +x.
      const giro = new THREE.Matrix4().makeBasis(lado, arriba, frente).invert();
      let largo = 0; for (const p of pts) { const d = (p[0] - pL.x) * frente.x + (p[2] - pL.z) * frente.z; largo = Math.max(largo, d); }
      let atrasL = 0; for (const p of pts) { const d = (p[0] - pL.x) * frente.x + (p[2] - pL.z) * frente.z; atrasL = Math.min(atrasL, d); }
      return montar(modelo, agarre, giro, (LARGO_KIRKA[tipo] || 1) / ((largo - atrasL) || 1), pM.toArray());
    }
  }
  // Base nueva: largo → +z, alto → +y, ancho → x (mano derecha).
  const ejes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  ejes[L].set(0, 0, sL); ejes[H].set(0, sH, 0);
  ejes[W].crossVectors(ejes[(W + 1) % 3], ejes[(W + 2) % 3]); // base sin espejar
  const giro = new THREE.Matrix4().makeBasis(ejes[0], ejes[1], ejes[2]);
  // Punta del cañón adivinada: el extremo del largo, a la altura del cañón.
  const boca = [0, 0, 0];
  boca[L] = sL > 0 ? max[L] : min[L]; boca[W] = (min[W] + max[W]) / 2;
  boca[H] = punta.length ? punta.reduce((a, p) => a + p[H], 0) / punta.length : (min[H] + max[H]) / 2;
  return montar(modelo, agarre, giro, (LARGO_KIRKA[tipo] || 1) / (ext[L] || 1), CUERPO_A_CUERPO.has(tipo) ? null : boca);
}

// «boca» (punta del cañón, en el espacio del modelo) queda en g.userData.boca, en el
// espacio del arma ya acomodada: ahí salen los fogonazos de los disparos.
function montar(modelo, agarre, giro, k, boca = null) {
  const interior = new THREE.Group();
  interior.add(modelo);
  interior.position.set(-agarre[0], -agarre[1], -agarre[2]);
  const orient = new THREE.Group();
  orient.quaternion.setFromRotationMatrix(giro);
  orient.scale.setScalar(k);
  orient.add(interior);
  const g = new THREE.Group();
  g.add(orient);
  if (boca) g.userData.boca = new THREE.Vector3(...boca).sub(new THREE.Vector3(...agarre)).multiplyScalar(k).applyQuaternion(orient.quaternion);
  return g;
}

// ---------- Disparos: fogonazo en la punta del cañón ----------
// Disparos por segundo de cada arma (para el parpadeo del fogonazo).
export const CADENCIA = { "AR-9": 10, SCAR: 8, LAR: 6, M60: 12, VITA: 1.2, Shark: 4, Weatie: 1.6, "MAC-10": 14, Revolver: 2 };
let texFogonazo = null;
function texturaFogonazo() {
  if (texFogonazo) return texFogonazo;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,235,1)"); gr.addColorStop(0.25, "rgba(255,220,120,.95)"); gr.addColorStop(0.6, "rgba(255,130,30,.45)"); gr.addColorStop(1, "rgba(255,80,0,0)");
  x.fillStyle = gr;
  // Estrella de 5 puntas suave: se ve como el fogonazo de un arma.
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 22 : 64; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  x.closePath(); x.fill();
  x.globalCompositeOperation = "lighter"; x.beginPath(); x.arc(64, 64, 26, 0, Math.PI * 2); x.fill();
  texFogonazo = new THREE.CanvasTexture(c); texFogonazo.colorSpace = THREE.SRGBColorSpace;
  return texFogonazo;
}
// Crea el fogonazo (apagado) en la punta del arma; se prende con animarFogonazo.
export function crearFogonazo(envoltura, arma, tipo) {
  const boca = arma?.userData?.boca;
  if (!boca || !CADENCIA[tipo]) return null;
  const g = new THREE.Group();
  g.position.copy(boca);
  const mat = new THREE.MeshBasicMaterial({ map: texturaFogonazo(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const tam = tipo === "Shark" || tipo === "Revolver" ? 0.22 : tipo === "Weatie" ? 0.4 : 0.3;
  // Tres planos cruzados: se ve de frente y de lado.
  const frente = new THREE.Mesh(new THREE.PlaneGeometry(tam, tam), mat); frente.position.z = tam * 0.15;
  const lado1 = new THREE.Mesh(new THREE.PlaneGeometry(tam * 0.7, tam * 1.6), mat); lado1.rotation.x = Math.PI / 2; lado1.position.z = tam * 0.6;
  const lado2 = new THREE.Mesh(new THREE.PlaneGeometry(tam * 1.6, tam * 0.7), mat); lado2.rotation.y = Math.PI / 2; lado2.position.z = tam * 0.6;
  for (const m of [frente, lado1, lado2]) { m.renderOrder = 10; m.frustumCulled = false; g.add(m); }
  const luz = new THREE.PointLight("#ffb347", 0, 4, 2);
  luz.position.z = tam * 0.4;
  g.add(luz);
  g.visible = false;
  arma.add(g);
  return { g, luz, tam, cadencia: CADENCIA[tipo] };
}
// Prende o apaga el fogonazo en el segundo t según los tramos de disparo.
export function animarFogonazo(f, disparos, t) {
  if (!f) return;
  const tramo = (disparos || []).some((d) => t >= d.desde && t <= d.hasta);
  const u = (t * f.cadencia) % 1;
  // Cada disparo dura un poco más que un cuadro, para que se vea a 30 fps.
  const on = tramo && (f.cadencia < 3 ? u < 0.12 * f.cadencia + 0.05 : u < 0.45);
  f.g.visible = on;
  if (!on) { f.luz.intensity = 0; return; }
  const n = Math.floor(t * f.cadencia), azar = (Math.sin(n * 12.9898) * 43758.5453) % 1;
  const k = 0.75 + Math.abs(azar) * 0.5;
  f.g.scale.setScalar(k);
  f.g.rotation.z = Math.abs(azar) * Math.PI * 2;
  f.luz.intensity = 3 * k;
}
