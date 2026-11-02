// Dónde está la cámara en el segundo t de una toma.
//
// Una toma tiene "claves" (puntos por los que pasa la cámara) o un "orbita":
//   { "duracion": 10, "fps": 30,
//     "claves": [ { "t": 0, "pos": [x,y,z], "mira": [x,y,z], "fov": 55, "giro": 0 }, ... ],
//     "suave": true,          // curva que pasa por las claves sin frenar (por defecto)
//     "facil": true,          // arranca y termina despacio (por defecto)
//     "temblor": 0.03 }       // cámara en mano (0 = fija)
//   { "orbita": { "centro": [x,y,z], "radio": 40, "altura": 20, "desde": 0, "hasta": 90, "fov": 50, "miraY": 0 } }

const mezcla = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const facil = (u) => u * u * (3 - 2 * u);
// Catmull-Rom entre p1 y p2.
const cr = (p0, p1, p2, p3, u) => p1.map((_, i) => {
  const a = p0[i], b = p1[i], c = p2[i], d = p3[i];
  return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
});
// Ruido suave para el temblor (sumas de senos, siempre igual para el mismo t).
const ruido = (t, s) => Math.sin(t * 1.7 + s) * 0.6 + Math.sin(t * 3.1 + s * 2.3) * 0.3 + Math.sin(t * 7.3 + s * 4.1) * 0.1;

export function posCamara(toma, t) {
  const dur = toma.duracion ?? toma.claves?.at(-1)?.t ?? 8;
  let c;
  if (toma.orbita) {
    const o = toma.orbita;
    let u = Math.min(Math.max(t / dur, 0), 1);
    if (toma.facil) u = facil(u);
    const ang = (((o.desde ?? 0) + ((o.hasta ?? 360) - (o.desde ?? 0)) * u) * Math.PI) / 180;
    const [x, y, z] = o.centro;
    const alt = o.altura ?? o.radio * 0.5, altFin = o.alturaFin ?? alt;
    const r = (o.radio ?? 40) + ((o.radioFin ?? o.radio ?? 40) - (o.radio ?? 40)) * u;
    c = { pos: [x + Math.sin(ang) * r, y + alt + (altFin - alt) * u, z + Math.cos(ang) * r], mira: [x, y + (o.miraY ?? 0), z], fov: o.fov ?? 50 };
  } else {
    const k = toma.claves;
    if (k.length === 1 || t <= k[0].t) c = k[0];
    else if (t >= k.at(-1).t) c = k.at(-1);
    else {
      let i = k.findIndex((q, j) => t >= q.t && t <= k[j + 1].t);
      const a = k[i], b = k[i + 1];
      let u = (t - a.t) / (b.t - a.t || 1);
      // "facil": arranca despacio en la primera clave y frena en la última.
      if (toma.facil !== false) {
        const entra = (x) => x * x * (2 - x);
        const ultimo = i === k.length - 2;
        if (i === 0 && ultimo) u = facil(u);
        else if (i === 0) u = entra(u);
        else if (ultimo) u = 1 - entra(1 - u);
      }
      // Dos claves casi juntas (menos de 0.1 s) son un corte de toma: la curva no
      // mira al otro lado del corte, si no la cámara se va lejos antes de cortar.
      let p0 = k[Math.max(i - 1, 0)], p3 = k[Math.min(i + 2, k.length - 1)];
      if (a.t - p0.t < 0.1) p0 = a;
      if (p3.t - b.t < 0.1) p3 = b;
      const suave = toma.suave !== false;
      const f = (key) => (suave ? cr(p0[key], a[key], b[key], p3[key], u) : mezcla(a[key], b[key], u));
      c = {
        pos: f("pos"), mira: f("mira"),
        fov: (a.fov ?? 55) + ((b.fov ?? 55) - (a.fov ?? 55)) * u,
        giro: (a.giro ?? 0) + ((b.giro ?? 0) - (a.giro ?? 0)) * u,
      };
    }
  }
  const tb = toma.temblor ?? 0;
  if (tb) {
    c = { ...c, pos: c.pos.map((v, i) => v + ruido(t, i * 10) * tb), mira: c.mira.map((v, i) => v + ruido(t, 50 + i * 10) * tb * 2) };
  }
  // Sacudidas: un golpe fuerte que se calma solo (explosiones, caídas, impactos).
  for (const g of toma.golpes || []) {
    const d = t - g.t;
    if (!(d >= 0 && d < 1.6)) continue;
    const a = (g.fuerza ?? 0.5) * Math.exp(-d * 4.5);
    c = { ...c, pos: c.pos.map((v, i) => v + ruido(t * 14, 90 + i * 7) * a * 0.35), mira: c.mira.map((v, i) => v + ruido(t * 14, 130 + i * 7) * a * 0.9), giro: (c.giro || 0) + ruido(t * 11, 170) * a * 5 };
  }
  return c;
}
