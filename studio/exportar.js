// Exporta el video MP4 dentro del navegador (WebCodecs + mp4-muxer), con la
// música y los sonidos mezclados. Cuadro por cuadro: no importa si la PC es
// lenta, el video sale fluido.
import { Muxer, ArrayBufferTarget } from "./vendor/mp4-muxer.mjs";
import { componer } from "./capas.js";
import { posCamara } from "./camara.js";

export const puedeVideo = () => "VideoEncoder" in window && "VideoFrame" in window;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Configuraciones de video a probar, de mejor a más compatible. Algunos equipos
// dicen que aceptan una y luego fallan a mitad del video («EncodingError»): por
// eso se reintenta con la siguiente (sin aceleración por hardware, menos bitrate).
async function codecsVideo(W, H, fps) {
  const tasa = Math.min(40e6, Math.round(W * H * fps * 0.15));
  const lista = [];
  for (const [codec, hw, factor] of [
    ["avc1.640034", "no-preference", 1], ["avc1.640033", "no-preference", 1], ["avc1.640028", "no-preference", 1],
    ["avc1.640034", "prefer-software", 1], ["avc1.640028", "prefer-software", 0.6],
    ["avc1.4d0034", "prefer-software", 0.6], ["avc1.42003e", "prefer-software", 0.5],
  ]) {
    const cfg = { codec, width: W, height: H, bitrate: Math.round(tasa * factor), framerate: fps, avc: { format: "avc" }, hardwareAcceleration: hw };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) lista.push(cfg); } catch { /* siguiente */ }
  }
  // Una de cada tipo (con hardware y sin hardware) basta para reintentar.
  const vistos = new Set();
  return lista.filter((c) => { const k = c.hardwareAcceleration + (c.bitrate < tasa ? "-bajo" : ""); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

async function codecAudio() {
  for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]]) {
    const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return [cfg, mux]; } catch { /* siguiente */ }
  }
  return [null, null];
}

// Mezcla los sonidos del proyecto en un solo audio de la duración del video.
export async function mezclar(sonidos, duracion) {
  const conAudio = sonidos.filter((s) => s.buffer);
  if (!conAudio.length) return null;
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(duracion * sr), sr);
  for (const s of conAudio) {
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    const g = ctx.createGain();
    g.gain.value = s.volumen ?? 0.8;
    // Bajar el volumen el último segundo para que no se corte de golpe.
    g.gain.setValueAtTime(s.volumen ?? 0.8, Math.max(0, duracion - 1));
    g.gain.linearRampToValueAtTime(0, duracion);
    src.connect(g).connect(ctx.destination);
    const ini = s.inicio || 0;
    if (ini >= 0) src.start(ini, s.recorte || 0);
    else src.start(0, -ini + (s.recorte || 0));
  }
  return ctx.startRendering();
}

// Tamaños a probar: el pedido y, si el equipo no puede (iPhone, PCs viejas),
// 1080p y 720p con la misma forma. Los celulares suelen fallar con 1440p/4K.
function tamanos(W, H) {
  const corto = Math.min(W, H), lista = [[W, H]];
  for (const lado of [1080, 720]) if (lado < corto) { const k = lado / corto, par = (v) => Math.round((v * k) / 2) * 2; lista.push([par(W), par(H)]); }
  return lista;
}

export async function exportarVideo(op) {
  const { fps, duracion, sonidos } = op;
  const audio = await mezclar(sonidos, duracion);
  const [acfg, amux] = audio ? await codecAudio() : [null, null];
  let ultimo = new Error("H.264"), n = 0;
  for (const [W, H] of tamanos(op.W, op.H)) {
    for (const vcfg of await codecsVideo(W, H, fps)) {
      try {
        const blob = await intento({ ...op, W, H, vcfg, audio, acfg, amux, intento: n++ });
        if (blob) blob.tamano = [W, H];
        return blob;
      } catch (e) {
        ultimo = e;
        console.warn("Video: falló", W, H, vcfg.codec, vcfg.hardwareAcceleration, e);
        if (op.cancelado()) return null;
      }
    }
  }
  throw ultimo;
}

async function intento({ motor, proyecto: p, W, H, fps, duracion, progreso, cancelado, vcfg, audio, acfg, amux, intento: n0 }) {
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: W, height: H, frameRate: fps },
    ...(acfg && { audio: { codec: amux, sampleRate: 48000, numberOfChannels: 2 } }),
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let error = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (error = e) });
  const cerrar = () => { try { if (venc.state !== "closed") venc.close(); } catch { /* ya cerrado */ } };
  venc.configure(vcfg);

  // Audio primero (es rápido).
  if (acfg) {
    let aerror = null;
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (aerror = e) });
    aenc.configure(acfg);
    const L = audio.getChannelData(0), R = audio.getChannelData(1), paso = 4800;
    for (let i = 0; i < audio.length && !aerror; i += paso) {
      const n = Math.min(paso, audio.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0);
      data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / 48000) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    if (!aerror) await aenc.flush().catch((e) => (aerror = e));
    if (aenc.state !== "closed") aenc.close();
    if (aerror) { cerrar(); throw aerror; }
  }

  const lienzo = document.createElement("canvas");
  lienzo.width = W; lienzo.height = H;
  const ctx = lienzo.getContext("2d");
  motor.tamano(W, H);
  motor.ayudantes(false);
  const n = Math.round(duracion * fps);
  const t0 = performance.now();
  try {
    for (let i = 0; i < n; i++) {
      if (cancelado()) { cerrar(); return null; }
      if (error) throw error;
      const t = i / fps;
      motor.animar(t);
      motor.poner(posCamara(p.camara, t), p.camara.seguir);
      componer(ctx, motor.dibujar(), p, t, W, H, { duracion, fps });
      const frame = new VideoFrame(lienzo, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      try { venc.encode(frame, { keyFrame: i % (fps * 2) === 0 }); } finally { frame.close(); }
      while (venc.encodeQueueSize > 4 && !error) await espera(2);
      if (i % 3 === 0) {
        const pasado = (performance.now() - t0) / 1000;
        progreso((i + 1) / n, pasado * (n / (i + 1) - 1), n0);
        await espera(0);
      }
    }
    await venc.flush();
  } catch (e) {
    throw error || e;
  } finally {
    cerrar();
  }
  if (error) throw error;
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}
