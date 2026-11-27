"use strict";

// Sound and image helpers of «Crear swapper», all in the page:
// - sounds are decoded, matched in loudness to Kirka's (same peak) and
//   written as WAV. Kirka decodes them with decodeAudioData, which looks at the
//   bytes and not at the name, so a WAV saved as __use__.<hash>.mp3 plays fine.
// - images become a WebP of 1024×1024 (the size of Kirka's weapon textures).
(function () {
  const RATE = 44100;
  const MAX_SECONDS = 10;
  let ctx = null;
  const audio = () => (ctx ||= new AudioContext());

  const decode = (bytes) => audio().decodeAudioData(bytes.slice().buffer);

  function peak(buffer) {
    let max = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
    }
    return max;
  }

  // Mono WAV, 16 bits, with `gain` applied. Cut at MAX_SECONDS.
  async function toWav(buffer, gain) {
    const length = Math.min(Math.ceil(buffer.duration * RATE), MAX_SECONDS * RATE);
    const off = new OfflineAudioContext(1, Math.max(1, length), RATE);
    const src = off.createBufferSource();
    src.buffer = buffer;
    const g = off.createGain();
    g.gain.value = gain;
    src.connect(g).connect(off.destination);
    src.start();
    const out = (await off.startRendering()).getChannelData(0);
    const view = new DataView(new ArrayBuffer(44 + out.length * 2));
    const text = (at, s) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + out.length * 2, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true);
    view.setUint32(28, RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, out.length * 2, true);
    for (let i = 0; i < out.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 0x7fff, true);
    return new Uint8Array(view.buffer);
  }

  // Ready-to-save sound: `volume` is the player's slider (1 = as is), times
  // the gain that brings it to Kirka's peak when `match` is on.
  async function prepareSound(bytes, { originalPeak = 0, match = true, volume = 1 } = {}) {
    const buffer = await decode(bytes);
    const own = peak(buffer) || 1;
    const gain = (match && originalPeak ? originalPeak / own : 1) * volume;
    if (gain === 1 && buffer.duration <= MAX_SECONDS) return { bytes, duration: buffer.duration };
    return { bytes: await toWav(buffer, gain), duration: Math.min(buffer.duration, MAX_SECONDS) };
  }

  let playing = null;
  async function play(bytes, volume = 1) {
    stop();
    const buffer = await decode(bytes);
    const src = audio().createBufferSource();
    const g = audio().createGain();
    g.gain.value = volume;
    src.buffer = buffer;
    src.connect(g).connect(audio().destination);
    src.start();
    playing = src;
  }
  function stop() {
    try {
      playing?.stop();
    } catch {}
    playing = null;
  }

  async function prepareImage(bytes, size = 1024) {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, size, size);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.95));
    return new Uint8Array(await blob.arrayBuffer());
  }

  window.riteAudio = { decode, peak, prepareSound, play, stop, prepareImage };
})();
