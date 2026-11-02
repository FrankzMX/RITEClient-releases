// Partículas: nieve, lluvia, brasas, chispas, humo, confeti, polvo, luciérnagas y magia.
//
// Cada efecto va en P.escena.particulas: { tipo, cantidad (0-1), viento (-1 a 1),
// desde, hasta, objeto (id, opcional) }.
// - Sin objeto llenan el aire alrededor de la cámara (clima).
// - Con objeto salen de ese objeto (una fogata, una antorcha, un personaje).
// La posición de cada partícula depende solo del tiempo, así que el video
// exportado sale igual a lo que ves en el estudio.

export const TIPOS = {
  nieve: { n: 2400, caja: [32, 20], vel: [0, -1.3, 0], azar: [0.2, 0.4, 0.2], oscila: 0.7, frec: 0.8, tam: 0.14, colores: ["#ffffff", "#e8f2ff"], forma: 0, alfa: 0.95 },
  lluvia: { n: 2600, caja: [30, 22], vel: [0.6, -19, 0], azar: [0.2, 3, 0.2], tam: 0.42, colores: ["#b4cdf5"], forma: 1, alfa: 0.55 },
  brasas: { n: 260, caja: [26, 14], vel: [0, 1.1, 0], azar: [0.18, 0.5, 0.18], oscila: 0.35, frec: 1.3, tam: 0.055, colores: ["#ffb347", "#ff6a00", "#ffd27a"], forma: 0, alfa: 1, suma: true, vida: 3.2, radio: 0.35, titila: 6 },
  chispas: { n: 400, caja: [20, 10], vel: [0, 4.5, 0], azar: [2.6, 1.8, 2.6], gravedad: -7, tam: 0.06, colores: ["#fff2b0", "#ffc04a"], forma: 0, alfa: 1, suma: true, vida: 1.1, radio: 0.25, apaga: true },
  humo: { n: 70, caja: [30, 12], vel: [0.1, 0.6, 0], azar: [0.12, 0.15, 0.12], oscila: 0.25, frec: 0.3, tam: 0.5, crece: 2.5, colores: ["#6f6f74", "#8a8a90", "#55555a"], forma: 3, alfa: 0.22, vida: 6, radio: 0.3 },
  confeti: { n: 1200, caja: [24, 16], vel: [0, -2.4, 0], azar: [0.4, 0.8, 0.4], oscila: 0.9, frec: 2.1, tam: 0.14, colores: ["#ff3b6b", "#ffd23b", "#3bd1ff", "#7dff5a", "#b56bff", "#ff8a3b"], forma: 2, alfa: 1, gira: true },
  polvo: { n: 900, caja: [26, 12], vel: [0.12, 0.03, 0.05], azar: [0.1, 0.06, 0.1], oscila: 0.35, frec: 0.25, tam: 0.045, colores: ["#fff0d0"], forma: 0, alfa: 0.7, suma: true, titila: 1.2 },
  luciernagas: { n: 220, caja: [24, 6], vel: [0, 0, 0], azar: [0.3, 0.15, 0.3], oscila: 1.1, frec: 0.45, tam: 0.16, colores: ["#d8ff6a", "#b6ff3a"], forma: 0, alfa: 1, suma: true, titila: 1.6, abajo: true },
  magia: { n: 300, caja: [20, 10], vel: [0, 0.9, 0], azar: [0.2, 0.3, 0.2], oscila: 0.5, frec: 1.5, tam: 0.06, colores: ["#b06bff", "#6be3ff", "#ffffff"], forma: 0, alfa: 1, suma: true, titila: 5, vida: 2.6, radio: 0.9 },
};

// Números al azar que siempre salen iguales para la misma partícula.
const azar = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fr = (x) => x - Math.floor(x);

const VERT = `
attribute float tam; attribute float alfa; attribute vec3 color;
uniform float escala; varying vec3 vColor; varying float vAlfa;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(tam * escala / max(-mv.z, 0.05), 0.0, 160.0);
  // Las que pasan pegadas a la cámara se desvanecen (si no, tapan todo).
  vColor = color; vAlfa = alfa * smoothstep(0.6, 2.5, -mv.z);
}`;
const FRAG = `
uniform int forma; uniform float total; varying vec3 vColor; varying float vAlfa;
void main() {
  vec2 c = gl_PointCoord - 0.5; float a;
  if (forma == 1) a = smoothstep(0.5, 0.0, abs(c.x) * 7.0) * smoothstep(0.5, 0.25, abs(c.y));
  else if (forma == 2) a = step(max(abs(c.x), abs(c.y) * 1.6), 0.3);
  else if (forma == 3) a = pow(smoothstep(0.5, 0.0, length(c)), 1.6);
  else a = smoothstep(0.5, 0.12, length(c));
  a *= vAlfa * total;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export function crearParticulas(THREE, scene) {
  const sistemas = []; // uno por efecto de la lista
  const tmp = new THREE.Vector3();

  function armar(tipo) {
    const T = TIPOS[tipo];
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(T.n * 3), col = new Float32Array(T.n * 3), tam = new Float32Array(T.n), alfa = new Float32Array(T.n);
    const c = new THREE.Color();
    for (let i = 0; i < T.n; i++) {
      c.set(T.colores[Math.floor(azar(i * 7 + 3) * T.colores.length)]);
      col.set([c.r, c.g, c.b], i * 3);
      tam[i] = T.tam * (0.6 + azar(i * 13 + 5) * 0.8);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("tam", new THREE.BufferAttribute(tam, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alfa", new THREE.BufferAttribute(alfa, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: T.suma ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { escala: { value: 500 }, forma: { value: T.forma }, total: { value: 1 } },
    });
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    p.renderOrder = 5;
    p.userData.tamBase = tam.slice();
    return p;
  }

  return {
    // lista: P.escena.particulas; cam: la cámara ya puesta; buscar(id) → objeto 3D.
    actualizar(lista = [], t, cam, altoPx, buscar) {
      lista = Array.isArray(lista) ? lista.filter((e) => e && TIPOS[e.tipo]) : [];
      while (sistemas.length > lista.length) { const s = sistemas.pop(); scene.remove(s.p); s.p.geometry.dispose(); s.p.material.dispose(); }
      const escala = altoPx / (2 * Math.tan((cam.fov * Math.PI) / 360));
      lista.forEach((e, k) => {
        if (!sistemas[k] || sistemas[k].tipo !== e.tipo) {
          if (sistemas[k]) { scene.remove(sistemas[k].p); sistemas[k].p.geometry.dispose(); sistemas[k].p.material.dispose(); }
          sistemas[k] = { tipo: e.tipo, p: armar(e.tipo) };
          scene.add(sistemas[k].p);
        }
        const T = TIPOS[e.tipo], p = sistemas[k].p, g = p.geometry;
        const desde = e.desde ?? 0, hasta = e.hasta ?? 1e9;
        // Aparece y se va suave.
        const total = Math.min(1, Math.max(0, (t - desde) / 0.6), Math.max(0, (hasta - t) / 0.6));
        p.visible = total > 0.001;
        if (!p.visible) return;
        p.material.uniforms.total.value = total;
        p.material.uniforms.escala.value = escala;
        const n = Math.max(1, Math.round(T.n * Math.min(1, Math.max(0.02, e.cantidad ?? 0.5))));
        g.setDrawRange(0, n);
        const pos = g.attributes.position.array, alfa = g.attributes.alfa.array, tam = g.attributes.tam.array, base = p.userData.tamBase;
        const viento = (e.viento || 0) * 4;
        const fuente = e.objeto && buscar?.(e.objeto);
        const origen = fuente ? fuente.getWorldPosition(tmp).clone().add(new THREE.Vector3(0, 0.3, 0)) : null;
        const [ancho, alto] = T.caja, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
        for (let i = 0; i < n; i++) {
          const s = i * 9.13;
          const vx = T.vel[0] + viento + (azar(s + 1) - 0.5) * 2 * T.azar[0];
          const vy = T.vel[1] + (azar(s + 2) - 0.5) * 2 * T.azar[1];
          const vz = T.vel[2] + (azar(s + 3) - 0.5) * 2 * T.azar[2];
          const ph = azar(s + 4) * 6.283;
          const os = T.oscila || 0, f = T.frec || 1;
          let x, y, z, a = T.alfa, tm = base[i];
          if (origen) {
            // Sale del objeto, vive un rato y se apaga.
            const vida = T.vida || 3, fase = fr(t / vida + azar(s + 5)), edad = fase * vida;
            const r = (T.radio || 0.5) * Math.sqrt(azar(s + 6)), ang = azar(s + 7) * 6.283;
            x = origen.x + Math.cos(ang) * r + vx * edad + Math.sin(t * f + ph) * os * fase;
            y = origen.y + vy * edad + 0.5 * (T.gravedad || 0) * edad * edad;
            z = origen.z + Math.sin(ang) * r + vz * edad + Math.cos(t * f * 0.8 + ph) * os * fase;
            a *= T.apaga ? 1 - fase : Math.sin(Math.PI * fase);
            if (T.crece) tm *= 1 + T.crece * fase;
          } else {
            // Llena una caja que viaja con la cámara (da la vuelta por los lados).
            const bx = azar(s + 5) * ancho * 2, by = azar(s + 6) * alto, bz = azar(s + 7) * ancho * 2;
            x = bx + vx * t + Math.sin(t * f + ph) * os;
            y = by + vy * t + (os ? Math.sin(t * f * 1.3 + ph * 2) * os * 0.3 : 0);
            z = bz + vz * t + Math.cos(t * f * 0.8 + ph) * os;
            const ox = cx - ancho, oz = cz - ancho, oy = T.abajo ? cy - alto * 0.85 : cy - alto * 0.5;
            x = ox + ((((x - ox) % (ancho * 2)) + ancho * 2) % (ancho * 2));
            y = oy + ((((y - oy) % alto) + alto) % alto);
            z = oz + ((((z - oz) % (ancho * 2)) + ancho * 2) % (ancho * 2));
            // Se desvanece cerca de las orillas de la caja para que no se note.
            const bordeY = Math.min(y - oy, oy + alto - y) / (alto * 0.15);
            const bordeH = Math.min(x - ox, ox + ancho * 2 - x, z - oz, oz + ancho * 2 - z) / (ancho * 0.25);
            a *= Math.min(1, bordeY, bordeH);
            if (T.crece) tm *= 1 + T.crece * azar(s + 8);
          }
          if (T.titila) a *= 0.45 + 0.55 * Math.max(0, Math.sin(t * T.titila + ph * 3));
          if (T.gira) tm *= 0.35 + 0.65 * Math.abs(Math.sin(t * 5 + ph * 2));
          pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
          alfa[i] = Math.max(0, a); tam[i] = tm;
        }
        g.attributes.position.needsUpdate = true; g.attributes.alfa.needsUpdate = true; g.attributes.tam.needsUpdate = true;
      });
    },
  };
}
