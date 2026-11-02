"use strict";

// Block textures swapped in the middle of a match, without reloading.
//
// Kirka builds one 256×256 block atlas per map: its own __texture-blocks__ PNG,
// or, with a custom texture URL, a canvas it fills with gray, clears where the
// see-through blocks go (glass, leaves...) and draws the image on top. A hook in
// the page's WebGL context remembers which GPU textures hold that atlas and
// uploads the new image over them; the game keeps drawing the same texture and
// never notices. Later uploads of the atlas (a new map) get the chosen texture
// too, until the page reloads and the game reads its setting again.
//
// The page and the preload talk with DOM events on window, the only thing both
// worlds share: "rite-blocks" (preload → page, detail = image URL, "" = Kirka's
// own) and "rite-blocks-state" (page → preload, detail = textures swapped).

const ATLAS = 256;
// Kirka's own atlas when the page never loaded it (it had a custom texture).
const KIRKA_ATLAS = "/assets/img/__texture-blocks__.628d6825.png";

// Runs in the page's world (injected as source text: no outer variables).
function pageHook(SIZE, KIRKA) {
  const TEX2D = 0x0de1;
  const MIN_FILTER = 0x2801;
  const FLIP_Y = 0x9240;
  const PREMUL = 0x9241;
  const isMipmap = (f) => f >= 0x2700 && f <= 0x2703;

  // The gray-and-holes canvas Kirka draws a custom texture over, copied the
  // moment it draws; until then, the same thing made here.
  let base = null;
  const makeBase = () => {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const g = c.getContext("2d");
    g.fillStyle = "#808080";
    g.fillRect(0, 0, SIZE, SIZE);
    for (const r of [[16, 16, 16, 16], [80, 16, 16, 16], [112, 16, 32, 16], [176, 16, 16, 16], [224, 16, 16, 16], [112, 32, 16, 16], [32, 64, 128, 16], [32, 80, 16, 16], [192, 96, 16, 16], [192, 112, 16, 16]]) g.clearRect(...r);
    return c;
  };

  const C2D = CanvasRenderingContext2D.prototype;
  const clearRect = C2D.clearRect;
  const drawImage = C2D.drawImage;
  const isAtlasCanvas = (c) => c && c.width === SIZE && c.height === SIZE;
  C2D.clearRect = function (x, y, w, h) {
    // Kirka's first hole: this canvas is the custom-texture atlas.
    if (x === 16 && y === 16 && w === 16 && h === 16 && isAtlasCanvas(this.canvas)) this.canvas.__riteBlocks = true;
    return clearRect.call(this, x, y, w, h);
  };
  C2D.drawImage = function (img, ...rest) {
    const c = this.canvas;
    if (c && c.__riteBlocks && rest.length === 4 && rest[0] === 0 && rest[1] === 0 && rest[2] === SIZE && rest[3] === SIZE) {
      try {
        const copy = document.createElement("canvas");
        copy.width = copy.height = SIZE;
        drawImage.call(copy.getContext("2d"), c, 0, 0);
        base = copy;
      } catch {}
    }
    return drawImage.call(this, img, ...rest);
  };

  const isAtlas = (src) => {
    if (!src || typeof src !== "object") return false;
    if (typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement) return Boolean(src.__riteBlocks);
    if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) return /__texture-blocks__/.test(src.src || "");
    return false;
  };

  let override = null; // canvas with the chosen texture, or null = what the game uploads
  let wantKirka = false; // "Kirka" picked: a custom canvas from the game gets Kirka's atlas
  const tracked = new Map(); // WebGLTexture -> { gl, orig, how, ifmt, fmt, type, flipY, premul }
  const states = new WeakMap();
  const S = (gl) => {
    let s = states.get(gl);
    if (!s) states.set(gl, (s = { unit: 0, bound: [], flipY: false, premul: false, min: new WeakMap(), immutable: new WeakSet() }));
    return s;
  };

  const protos = [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean).map((c) => c.prototype);
  const orig = new Map();
  for (const P of protos) {
    const o = {};
    for (const k of ["activeTexture", "bindTexture", "pixelStorei", "texImage2D", "texSubImage2D", "texStorage2D", "texParameteri", "deleteTexture", "generateMipmap"]) {
      if (typeof P[k] === "function") o[k] = P[k];
    }
    orig.set(P, o);
    P.activeTexture = function (u) {
      S(this).unit = u - 0x84c0;
      return o.activeTexture.call(this, u);
    };
    P.bindTexture = function (t, tex) {
      if (t === TEX2D) S(this).bound[S(this).unit] = tex;
      return o.bindTexture.call(this, t, tex);
    };
    P.pixelStorei = function (p, v) {
      if (p === FLIP_Y) S(this).flipY = Boolean(v);
      if (p === PREMUL) S(this).premul = Boolean(v);
      return o.pixelStorei.call(this, p, v);
    };
    P.texParameteri = function (t, p, v) {
      if (t === TEX2D && p === MIN_FILTER) {
        const tex = S(this).bound[S(this).unit];
        if (tex) S(this).min.set(tex, v);
      }
      return o.texParameteri.call(this, t, p, v);
    };
    if (o.texStorage2D) {
      P.texStorage2D = function (t, ...rest) {
        const tex = t === TEX2D && S(this).bound[S(this).unit];
        if (tex) S(this).immutable.add(tex);
        return o.texStorage2D.call(this, t, ...rest);
      };
    }
    P.deleteTexture = function (tex) {
      tracked.delete(tex);
      return o.deleteTexture.call(this, tex);
    };
    // The atlas as a DOM source: texImage2D(target, 0, ifmt, fmt, type, src)
    // or, on immutable textures, texSubImage2D(target, 0, 0, 0, fmt, type, src).
    const watch = (how) =>
      function (...a) {
        const src = a[a.length - 1];
        if (a[0] === TEX2D && a[1] === 0 && (how === "image" ? a.length === 6 : a.length === 7 && a[2] === 0 && a[3] === 0) && isAtlas(src)) {
          const s = S(this);
          const tex = s.bound[s.unit];
          if (tex) {
            tracked.set(tex, how === "image" ? { gl: this, orig: src, how, ifmt: a[2], fmt: a[3], type: a[4], flipY: s.flipY, premul: s.premul } : { gl: this, orig: src, how, fmt: a[4], type: a[5], flipY: s.flipY, premul: s.premul });
            if (override) a[a.length - 1] = override;
            // Kirka's own was picked but the game still builds its custom canvas.
            else if (wantKirka && !(src instanceof HTMLImageElement)) setTimeout(() => window.dispatchEvent(new CustomEvent("rite-blocks", { detail: "" })));
          }
        }
        return o[how === "image" ? "texImage2D" : "texSubImage2D"].apply(this, a);
      };
    P.texImage2D = watch("image");
    if (o.texSubImage2D) P.texSubImage2D = watch("sub");
  }

  // Uploads `src` over every atlas texture, leaving the GL state as it was.
  const upload = (pick) => {
    let n = 0;
    for (const [tex, t] of tracked) {
      const gl = t.gl;
      const o = orig.get(Object.getPrototypeOf(gl));
      const src = pick(t);
      if (!o || !src || (gl.isContextLost && gl.isContextLost())) continue;
      const s = S(gl);
      try {
        o.bindTexture.call(gl, TEX2D, tex);
        o.pixelStorei.call(gl, FLIP_Y, t.flipY);
        o.pixelStorei.call(gl, PREMUL, t.premul);
        if (t.how === "sub" || s.immutable.has(tex)) o.texSubImage2D.call(gl, TEX2D, 0, 0, 0, t.fmt, t.type, src);
        else o.texImage2D.call(gl, TEX2D, 0, t.ifmt, t.fmt, t.type, src);
        if (isMipmap(s.min.get(tex))) o.generateMipmap.call(gl, TEX2D);
        n++;
      } catch {}
      o.pixelStorei.call(gl, FLIP_Y, s.flipY);
      o.pixelStorei.call(gl, PREMUL, s.premul);
      o.bindTexture.call(gl, TEX2D, s.bound[s.unit] || null);
    }
    window.dispatchEvent(new CustomEvent("rite-blocks-state", { detail: n }));
  };

  const load = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  // Kirka's atlas, for "Kirka" when the game had loaded a custom texture.
  const kirkaUrl = () => {
    try {
      const seen = performance.getEntriesByType("resource").map((e) => e.name).find((n) => /\/__texture-blocks__\.[0-9a-f]+\.png/.test(n));
      if (seen) return seen;
    } catch {}
    return KIRKA;
  };

  let seq = 0;
  window.addEventListener("rite-blocks", async (e) => {
    const url = typeof e.detail === "string" ? e.detail : "";
    const mine = ++seq;
    wantKirka = !url;
    try {
      if (!url) {
        // Kirka's own: what the game uploaded when it was its own atlas.
        // If the game had a custom texture it keeps making that canvas for
        // every map until it reloads, so Kirka's atlas stays as the override.
        const needKirka = [...tracked.values()].some((t) => !(t.orig instanceof HTMLImageElement));
        const kirka = needKirka ? await load(kirkaUrl()).catch(() => null) : null;
        if (mine !== seq) return;
        override = kirka;
        if (kirka) wantKirka = false;
        upload((t) => (t.orig instanceof HTMLImageElement ? t.orig : kirka));
        return;
      }
      const img = await load(url);
      if (mine !== seq) return;
      const c = document.createElement("canvas");
      c.width = c.height = SIZE;
      const g = c.getContext("2d");
      drawImage.call(g, base || makeBase(), 0, 0);
      drawImage.call(g, img, 0, 0, SIZE, SIZE);
      override = c;
      upload(() => c);
    } catch {
      window.dispatchEvent(new CustomEvent("rite-blocks-state", { detail: -1 }));
    }
  });
}

function hookLiveBlocks(webFrame) {
  return webFrame.executeJavaScript(`(${pageHook.toString()})(${ATLAS}, ${JSON.stringify(KIRKA_ATLAS)});`).catch((error) => console.error("[RITE] live blocks:", error));
}

// From the preload: swap the atlas now. `url` "" puts Kirka's back.
function setLiveBlocks(url) {
  window.dispatchEvent(new CustomEvent("rite-blocks", { detail: url || "" }));
}

module.exports = { hookLiveBlocks, setLiveBlocks, pageHook, ATLAS };
