"use strict";

// Block textures swapped in the middle of a match, without reloading.
//
// Kirka builds one 256×256 block atlas per map (its __texture-blocks__ PNG, or
// with a custom URL a canvas it fills, clears where the see-through blocks go
// and draws the image on). Setting the URL in its store changes the setting
// but does not redraw the blocks (only its own Settings field does), so the
// client puts the new image straight on that GPU texture.
//
// Only uploads are hooked (texImage2D / texSubImage2D: a map loading): the
// binding and unpack state are read with getParameter at that moment, so the
// calls the game makes every frame (bindTexture, draws...) run untouched.
//
// The page and the preload talk with DOM events on window: "rite-blocks"
// (preload → page, detail = image URL, "" = Kirka's own) and
// "rite-blocks-state" (page → preload, detail = textures swapped, -1 = failed).

const ATLAS = 256;
const KIRKA_ATLAS = "/assets/img/__texture-blocks__.628d6825.png";

// Runs in the page's world (sent as source text: no outer variables).
function pageHook(SIZE, KIRKA) {
  const TEX2D = 0x0de1;
  const isMipmap = (f) => f >= 0x2700 && f <= 0x2703;

  // Kirka's custom-texture canvas: marked by its first see-through tile, and
  // copied right before the image is drawn on it (the base).
  let base = null;
  const C2D = CanvasRenderingContext2D.prototype;
  const clearRect = C2D.clearRect;
  const drawImage = C2D.drawImage;
  C2D.clearRect = function (x, y, w, h) {
    if (x === 16 && y === 16 && w === 16 && h === 16 && this.canvas && this.canvas.width === SIZE && this.canvas.height === SIZE) this.canvas.__riteBlocks = true;
    return clearRect.call(this, x, y, w, h);
  };
  C2D.drawImage = function (img, ...rest) {
    const c = this.canvas;
    if (c && c.__riteBlocks && rest.length === 4 && rest[2] === SIZE && rest[3] === SIZE) {
      try {
        const copy = document.createElement("canvas");
        copy.width = copy.height = SIZE;
        drawImage.call(copy.getContext("2d"), c, 0, 0);
        base = copy;
      } catch {}
    }
    return drawImage.call(this, img, ...rest);
  };
  const makeBase = () => {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const g = c.getContext("2d");
    g.fillStyle = "#808080";
    g.fillRect(0, 0, SIZE, SIZE);
    for (const r of [[16, 16, 16, 16], [80, 16, 16, 16], [112, 16, 32, 16], [176, 16, 16, 16], [224, 16, 16, 16], [112, 32, 16, 16], [32, 64, 128, 16], [32, 80, 16, 16], [192, 96, 16, 16], [192, 112, 16, 16]]) clearRect.apply(g, r);
    return c;
  };

  const isAtlas = (src) => {
    if (src instanceof HTMLCanvasElement) return Boolean(src.__riteBlocks);
    if (src instanceof HTMLImageElement) return /__texture-blocks__/.test(src.src || "");
    return false;
  };

  let override = null;
  let wantKirka = false;
  const tracked = new Map(); // WebGLTexture -> { gl, orig, sub, ifmt, fmt, type, flipY, premul }
  const originals = new Map();
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const P = C.prototype;
    const own = { texImage2D: P.texImage2D, texSubImage2D: P.texSubImage2D };
    originals.set(P, own);
    const watch = (sub) =>
      function (...a) {
        const src = a[a.length - 1];
        if (a[0] === TEX2D && a[1] === 0 && (sub ? a.length === 7 : a.length === 6) && src && typeof src === "object" && isAtlas(src)) {
          const tex = this.getParameter(this.TEXTURE_BINDING_2D);
          if (tex) {
            tracked.set(tex, {
              gl: this,
              orig: src,
              sub,
              ifmt: sub ? null : a[2],
              fmt: sub ? a[4] : a[3],
              type: sub ? a[5] : a[4],
              flipY: this.getParameter(this.UNPACK_FLIP_Y_WEBGL),
              premul: this.getParameter(this.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
            });
            if (override) a[a.length - 1] = override;
            // Kirka's own was picked but the game still builds its custom canvas.
            else if (wantKirka && !(src instanceof HTMLImageElement)) setTimeout(() => window.dispatchEvent(new CustomEvent("rite-blocks", { detail: "" })));
          }
        }
        return (sub ? own.texSubImage2D : own.texImage2D).apply(this, a);
      };
    P.texImage2D = watch(false);
    P.texSubImage2D = watch(true);
  }

  const upload = (pick) => {
    let n = 0;
    for (const [tex, t] of tracked) {
      const gl = t.gl;
      const own = originals.get(Object.getPrototypeOf(gl));
      const src = pick(t);
      if (!own || !src) continue;
      if ((gl.isContextLost && gl.isContextLost()) || !gl.isTexture(tex)) {
        tracked.delete(tex);
        continue;
      }
      const was = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const flipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
      const premul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
      try {
        gl.bindTexture(TEX2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, t.flipY);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, t.premul);
        const immutable = gl.TEXTURE_IMMUTABLE_FORMAT && gl.getTexParameter(TEX2D, gl.TEXTURE_IMMUTABLE_FORMAT);
        if (t.sub || immutable) own.texSubImage2D.call(gl, TEX2D, 0, 0, 0, t.fmt, t.type, src);
        else own.texImage2D.call(gl, TEX2D, 0, t.ifmt, t.fmt, t.type, src);
        if (isMipmap(gl.getTexParameter(TEX2D, gl.TEXTURE_MIN_FILTER))) gl.generateMipmap(TEX2D);
        n++;
      } catch {}
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
      gl.bindTexture(TEX2D, was);
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

// Kirka's own setting, so its Settings field shows the same URL. Runs in the page.
function pageSet(url) {
  const el = document.querySelector("#app");
  if (!el) return false;
  for (const key of ["__vue__", ...Object.keys(el)]) {
    const vm = el[key];
    if (!vm || typeof vm !== "object" || !vm.$store || !vm.$store.state) continue;
    for (const mod of Object.values(vm.$store.state)) {
      if (!mod || typeof mod !== "object") continue;
      for (const settings of Object.values(mod)) {
        const blocks = settings && typeof settings === "object" ? settings.BLOCKS___SETTING : null;
        if (blocks && typeof blocks === "object" && "TEXTURE_URL___SETTING" in blocks) {
          blocks.TEXTURE_URL___SETTING = url;
          return true;
        }
      }
    }
  }
  return false;
}

function hookLiveBlocks(webFrame) {
  return webFrame.executeJavaScript(`(${pageHook.toString()})(${ATLAS}, ${JSON.stringify(KIRKA_ATLAS)});`).catch((error) => console.error("[RITE] live blocks:", error));
}

// Swaps the atlas now ("" = Kirka's own) and keeps Kirka's setting in step.
function setLiveBlocks(webFrame, url) {
  window.dispatchEvent(new CustomEvent("rite-blocks", { detail: url || "" }));
  return webFrame.executeJavaScript(`(${pageSet.toString()})(${JSON.stringify(url || "")})`).catch(() => false);
}

module.exports = { hookLiveBlocks, setLiveBlocks, pageHook, pageSet, ATLAS };
