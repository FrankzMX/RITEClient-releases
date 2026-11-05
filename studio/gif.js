// GIF animado hecho dentro del navegador, sin librerías.
// Cada cuadro lleva su propia paleta de 256 colores (corte por la mediana) y se
// comprime con LZW, como pide el formato GIF89a.

// Paleta de hasta 256 colores para los píxeles de un cuadro.
function paleta(px) {
  const muestras = [];
  const paso = Math.max(1, Math.floor(px.length / 4 / 12000));
  for (let i = 0; i < px.length; i += 4 * paso) muestras.push([px[i], px[i + 1], px[i + 2]]);
  let cajas = [muestras];
  while (cajas.length < 256) {
    // Parte la caja con más rango en su canal más largo.
    let mejor = -1, rango = -1, canal = 0;
    cajas.forEach((c, i) => {
      if (c.length < 2) return;
      for (let k = 0; k < 3; k++) {
        let mn = 255, mx = 0;
        for (const p of c) { if (p[k] < mn) mn = p[k]; if (p[k] > mx) mx = p[k]; }
        const r = (mx - mn) * Math.sqrt(c.length);
        if (r > rango) { rango = r; mejor = i; canal = k; }
      }
    });
    if (mejor < 0 || rango <= 0) break;
    const c = cajas[mejor].sort((a, b) => a[canal] - b[canal]);
    const m = c.length >> 1;
    cajas.splice(mejor, 1, c.slice(0, m), c.slice(m));
  }
  const pal = cajas.filter((c) => c.length).map((c) => {
    const s = [0, 0, 0];
    for (const p of c) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return s.map((v) => Math.round(v / c.length));
  });
  while (pal.length < 256) pal.push([0, 0, 0]);
  return pal;
}

// Cambia cada píxel por el índice del color más parecido de la paleta.
function indices(px, pal) {
  const cache = new Int16Array(32768).fill(-1);
  const out = new Uint8Array(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let c = cache[k];
    if (c < 0) {
      let d = Infinity;
      for (let p = 0; p < 256; p++) {
        const q = pal[p], dr = q[0] - r, dg = q[1] - g, db = q[2] - b, e = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (e < d) { d = e; c = p; }
      }
      cache[k] = c;
    }
    out[j] = c;
  }
  return out;
}

// Compresión LZW de los índices (tamaño mínimo de código 8).
function lzw(ind, salida) {
  const min = 8, clear = 256, fin = 257;
  let tam = min + 1, sig = 258, dic = new Map();
  let acc = 0, bits = 0;
  const bloque = [];
  const poner = (code) => {
    acc |= code << bits; bits += tam;
    while (bits >= 8) { bloque.push(acc & 255); acc >>>= 8; bits -= 8; }
  };
  salida.push(min);
  poner(clear);
  let w = ind[0];
  for (let i = 1; i < ind.length; i++) {
    const k = ind[i], clave = w * 256 + k;
    const hay = dic.get(clave);
    if (hay !== undefined) { w = hay; continue; }
    poner(w);
    if (sig < 4096) { dic.set(clave, sig++); if (sig > 1 << tam && tam < 12) tam++; }
    else { poner(clear); dic = new Map(); sig = 258; tam = min + 1; }
    w = k;
  }
  poner(w);
  poner(fin);
  if (bits > 0) bloque.push(acc & 255);
  for (let i = 0; i < bloque.length; i += 255) {
    const parte = bloque.slice(i, i + 255);
    salida.push(parte.length, ...parte);
  }
  salida.push(0);
}

export function crearGif(W, H, fps) {
  const bytes = [];
  const txt = (s) => { for (const c of s) bytes.push(c.charCodeAt(0)); };
  const u16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
  txt("GIF89a"); u16(W); u16(H); bytes.push(0, 0, 0); // sin paleta global
  // Repetir para siempre.
  bytes.push(0x21, 0xff, 11); txt("NETSCAPE2.0"); bytes.push(3, 1, 0, 0, 0);
  const demora = Math.round(100 / fps);
  const partes = [];
  return {
    // Píxeles RGBA de un cuadro (ImageData.data).
    cuadro(px) {
      const pal = paleta(px), ind = indices(px, pal);
      bytes.push(0x21, 0xf9, 4, 0, demora & 255, (demora >> 8) & 255, 0, 0);
      bytes.push(0x2c); u16(0); u16(0); u16(W); u16(H); bytes.push(0x87); // paleta local de 256
      for (const c of pal) bytes.push(c[0], c[1], c[2]);
      lzw(ind, bytes);
      // Pasa los bytes a un bloque para que el arreglo no crezca sin fin.
      partes.push(new Uint8Array(bytes)); bytes.length = 0;
    },
    terminar() { partes.push(new Uint8Array([0x3b])); return new Blob(partes, { type: "image/gif" }); },
  };
}
