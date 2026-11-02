// Efectos de sonido hechos con síntesis (sin archivos ni licencias).
// Cada uno se arma en un OfflineAudioContext y se guarda como WAV, así que el
// proyecto lo lleva adentro igual que cualquier audio que subas.

const SR = 44100;

// Ruido blanco de cierta duración.
function ruido(ctx, seg) {
  const b = ctx.createBuffer(1, Math.ceil(seg * SR), SR), d = b.getChannelData(0);
  let s = 1234567;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
  const n = ctx.createBufferSource(); n.buffer = b; return n;
}
// Envolvente: sube en "ataque" y cae a casi cero en "caida".
function env(ctx, t0, pico, ataque, caida) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(pico, t0 + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ataque + caida);
  return g;
}
function filtro(ctx, tipo, frec, q = 1) { const f = ctx.createBiquadFilter(); f.type = tipo; f.frequency.value = frec; f.Q.value = q; return f; }
function tono(ctx, tipo, frec) { const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = frec; return o; }

export const EFECTOS_SONIDO = {
  disparo: { seg: 0.6, hacer(c) {
    const n = ruido(c, 0.6), f = filtro(c, "lowpass", 4000), g = env(c, 0, 1, 0.002, 0.25);
    f.frequency.setValueAtTime(6000, 0); f.frequency.exponentialRampToValueAtTime(500, 0.2);
    n.connect(f).connect(g).connect(c.destination); n.start(0);
    const o = tono(c, "sine", 150), g2 = env(c, 0, 0.9, 0.002, 0.18);
    o.frequency.exponentialRampToValueAtTime(40, 0.18); o.connect(g2).connect(c.destination); o.start(0); o.stop(0.3);
  } },
  rafaga: { seg: 1.1, hacer(c) {
    for (let k = 0; k < 6; k++) {
      const t = k * 0.11, n = ruido(c, 0.3), f = filtro(c, "lowpass", 3500), g = env(c, t, 0.8, 0.002, 0.09);
      n.connect(f).connect(g).connect(c.destination); n.start(t);
      const o = tono(c, "sine", 130), g2 = env(c, t, 0.6, 0.002, 0.08);
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.08); o.connect(g2).connect(c.destination); o.start(t); o.stop(t + 0.15);
    }
  } },
  explosion: { seg: 2.6, hacer(c) {
    const n = ruido(c, 2.6), f = filtro(c, "lowpass", 900), g = env(c, 0, 1, 0.01, 2.3);
    f.frequency.setValueAtTime(2500, 0); f.frequency.exponentialRampToValueAtTime(120, 2);
    n.connect(f).connect(g).connect(c.destination); n.start(0);
    const o = tono(c, "sine", 70), g2 = env(c, 0, 1, 0.01, 1.2);
    o.frequency.exponentialRampToValueAtTime(25, 1.2); o.connect(g2).connect(c.destination); o.start(0); o.stop(1.5);
  } },
  golpe: { seg: 0.5, hacer(c) {
    const o = tono(c, "sine", 120), g = env(c, 0, 1, 0.002, 0.3);
    o.frequency.exponentialRampToValueAtTime(45, 0.25); o.connect(g).connect(c.destination); o.start(0); o.stop(0.45);
    const n = ruido(c, 0.2), f = filtro(c, "bandpass", 1800, 0.8), g2 = env(c, 0, 0.5, 0.001, 0.06);
    n.connect(f).connect(g2).connect(c.destination); n.start(0);
  } },
  whoosh: { seg: 0.9, hacer(c) {
    const n = ruido(c, 0.9), f = filtro(c, "bandpass", 400, 2.5), g = env(c, 0, 0.9, 0.35, 0.5);
    f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(3500, 0.4); f.frequency.exponentialRampToValueAtTime(600, 0.85);
    n.connect(f).connect(g).connect(c.destination); n.start(0);
  } },
  pasos: { seg: 2.2, hacer(c) {
    for (let k = 0; k < 5; k++) {
      const t = 0.1 + k * 0.42, n = ruido(c, 0.2), f = filtro(c, "lowpass", 700), g = env(c, t, 0.7, 0.004, 0.09);
      n.connect(f).connect(g).connect(c.destination); n.start(t);
      const o = tono(c, "sine", 90), g2 = env(c, t, 0.4, 0.003, 0.06); o.connect(g2).connect(c.destination); o.start(t); o.stop(t + 0.1);
    }
  } },
  salto: { seg: 0.45, hacer(c) {
    const o = tono(c, "square", 220), f = filtro(c, "lowpass", 2500), g = env(c, 0, 0.35, 0.005, 0.38);
    o.frequency.exponentialRampToValueAtTime(880, 0.3); o.connect(f).connect(g).connect(c.destination); o.start(0); o.stop(0.45);
  } },
  moneda: { seg: 0.6, hacer(c) {
    const o = tono(c, "square", 988), f = filtro(c, "lowpass", 5000), g = env(c, 0, 0.3, 0.003, 0.5);
    o.frequency.setValueAtTime(1319, 0.08); o.connect(f).connect(g).connect(c.destination); o.start(0); o.stop(0.6);
  } },
  victoria: { seg: 1.6, hacer(c) {
    [523, 659, 784, 1047].forEach((fr, k) => {
      const t = k * 0.14, o = tono(c, "triangle", fr), g = env(c, t, 0.4, 0.01, k === 3 ? 1 : 0.25);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1.3);
    });
  } },
  error: { seg: 0.7, hacer(c) {
    [0, 0.25].forEach((t) => { const o = tono(c, "sawtooth", 140), f = filtro(c, "lowpass", 900), g = env(c, t, 0.35, 0.01, 0.2); o.connect(f).connect(g).connect(c.destination); o.start(t); o.stop(t + 0.3); });
  } },
  latido: { seg: 2, hacer(c) {
    [0.1, 0.32, 1.1, 1.32].forEach((t, k) => { const o = tono(c, "sine", k % 2 ? 50 : 60), g = env(c, t, k % 2 ? 0.6 : 1, 0.01, 0.16); o.frequency.exponentialRampToValueAtTime(35, t + 0.15); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25); });
  } },
  trueno: { seg: 4, hacer(c) {
    const n = ruido(c, 4), f = filtro(c, "lowpass", 300), g = c.createGain();
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(1, 0.05); g.gain.exponentialRampToValueAtTime(0.4, 0.5);
    g.gain.exponentialRampToValueAtTime(0.8, 0.9); g.gain.exponentialRampToValueAtTime(0.0001, 3.9);
    f.frequency.setValueAtTime(1500, 0); f.frequency.exponentialRampToValueAtTime(150, 1.5);
    n.connect(f).connect(g).connect(c.destination); n.start(0);
  } },
  campana: { seg: 3, hacer(c) {
    [[440, 1], [880, 0.5], [1320, 0.3], [1767, 0.2]].forEach(([fr, a]) => { const o = tono(c, "sine", fr), g = env(c, 0, 0.35 * a, 0.005, 2.8); o.connect(g).connect(c.destination); o.start(0); o.stop(3); });
  } },
  susto: { seg: 2.2, hacer(c) {
    [311, 330, 466, 494].forEach((fr) => { const o = tono(c, "sawtooth", fr), f = filtro(c, "lowpass", 2200), g = env(c, 0, 0.18, 0.01, 2); o.frequency.linearRampToValueAtTime(fr * 0.97, 2); o.connect(f).connect(g).connect(c.destination); o.start(0); o.stop(2.2); });
    const n = ruido(c, 0.5), f2 = filtro(c, "highpass", 3000), g2 = env(c, 0, 0.4, 0.005, 0.4); n.connect(f2).connect(g2).connect(c.destination); n.start(0);
  } },
};

// WAV de 16 bits a partir de un AudioBuffer.
function aWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, datos = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) datos.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, "RIFF"); datos.setUint32(4, 36 + n * ch * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
  datos.setUint32(16, 16, true); datos.setUint16(20, 1, true); datos.setUint16(22, ch, true); datos.setUint32(24, buf.sampleRate, true);
  datos.setUint32(28, buf.sampleRate * ch * 2, true); datos.setUint16(32, ch * 2, true); datos.setUint16(34, 16, true);
  txt(36, "data"); datos.setUint32(40, n * ch * 2, true);
  const canales = [...Array(ch)].map((_, k) => buf.getChannelData(k));
  for (let i = 0, o = 44; i < n; i++) for (let k = 0; k < ch; k++, o += 2) datos.setInt16(o, Math.max(-1, Math.min(1, canales[k][i])) * 0x7fff, true);
  return datos.buffer;
}

// Devuelve { buffer, bytes } listos para la lista de sonidos.
export async function hacerEfecto(nombre) {
  const e = EFECTOS_SONIDO[nombre];
  const c = new OfflineAudioContext(1, Math.ceil(e.seg * SR), SR);
  e.hacer(c);
  const buffer = await c.startRendering();
  return { buffer, bytes: aWav(buffer) };
}
