"use strict";

// Crosshair and FPS counter. The crosshair only shows while the game has the
// pointer locked, i.e. while actually playing. The counter shows the frames the
// game really draws (counted in the page, see hookFrames in preload/game.js);
// outside the game it can be dragged anywhere, and its size is a setting.

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Draws in screen pixels (`dpr` = window.devicePixelRatio) so a 1 px dot is
// really one pixel on Windows with 125 % / 150 % scaling. Lengths are CSS px,
// rounded to whole screen pixels; the dot size is already in screen pixels.
function drawCrosshair(ctx, s, dpr = 1) {
  const px = (v) => Math.round(v * dpr);
  const style = s.crosshairStyle;
  const size = px(s.crosshairSize);
  const t = Math.max(1, px(s.crosshairThickness));
  const gap = px(s.crosshairGap);
  const dot = Math.max(1, Math.round(s.crosshairDotSize ?? s.crosshairThickness));
  const o = Math.max(1, Math.round(dpr)); // outline of the lines
  const lines = style === "dot" ? 0 : size + gap + t;
  const extent = Math.max(lines, Math.ceil(dot / 2)) + o + 2;
  const dim = extent * 2;
  ctx.canvas.width = dim;
  ctx.canvas.height = dim;
  ctx.clearRect(0, 0, dim, dim);
  const c = extent;
  const color = hexToRgba(s.crosshairColor, s.crosshairOpacity / 100);
  const outline = `rgba(0, 0, 0, ${s.crosshairOpacity / 100})`;

  if (style === "circle") {
    const radius = gap + size / 2;
    if (s.crosshairOutline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = t + o * 2;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = t;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  // [x, y, w, h, outline width]
  const rects = [];
  if (style === "cross" || style === "cross-dot") {
    const a = c - Math.floor(t / 2);
    rects.push([a, c - gap - size, t, size, o]); // top
    rects.push([a, c + gap, t, size, o]); // bottom
    rects.push([c - gap - size, a, size, t, o]); // left
    rects.push([c + gap, a, size, t, o]); // right
  }
  // The dot's outline is always one screen pixel so a small dot stays small.
  if (style === "dot" || style === "cross-dot") {
    const a = c - Math.floor(dot / 2);
    rects.push([a, a, dot, dot, 1]);
  }

  if (s.crosshairOutline) {
    ctx.fillStyle = outline;
    for (const [x, y, w, h, b] of rects) ctx.fillRect(x - b, y - b, w + b * 2, h + b * 2);
  }
  ctx.fillStyle = color;
  for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
}

// Sizes the canvas to its screen pixels and centers it on a whole pixel, so it
// is never resampled (a blurred 1 px dot would look like 2 px).
function placeCrosshair(canvas, dpr = window.devicePixelRatio || 1) {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.left = `${Math.round((innerWidth * dpr - canvas.width) / 2) / dpr}px`;
  canvas.style.top = `${Math.round((innerHeight * dpr - canvas.height) / 2) / dpr}px`;
}

function createOverlay(initial) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    canvas { position: fixed; pointer-events: none; z-index: 2147483646; image-rendering: pixelated; }
    .fps { position: fixed; top: 6px; left: 6px; z-index: 2147483646; pointer-events: none; font: 600 13px/1 ui-monospace, monospace; color: #f2b632; background: #000a; padding: .3em .45em; border-radius: 4px; user-select: none; white-space: nowrap; }
    .fps.drag { pointer-events: auto; cursor: move; }
    [hidden] { display: none !important; }
    .fps small { font-size: .78em; opacity: .8; margin-left: .5em; }
  </style><canvas hidden></canvas><div class="fps" hidden><span>-- FPS</span><small hidden></small></div>`;
  document.documentElement.append(host);

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const fps = root.querySelector(".fps");
  const fpsValue = fps.querySelector("span");
  const fpsDetail = fps.querySelector("small");
  let settings = initial;
  let colorOverride = null;
  let shown = 0;

  // The page sends the game's frame count every half second; with no news (the
  // game isn't drawing) it shows "--".
  window.addEventListener("rite-fps", (e) => {
    if (!settings.fpsCounter) return;
    shown = Date.now();
    fpsValue.textContent = `${Number(e.detail) || 0} FPS`;
  });
  setInterval(() => {
    if (settings.fpsCounter && !document.pointerLockElement && Date.now() - shown > 1500) fpsValue.textContent = "-- FPS";
  }, 1000);

  // Dragging: only with the mouse free (in menus), so it never gets in the way of playing.
  const POS_KEY = "rite-fps-pos";
  const place = (x, y) => {
    const maxX = Math.max(0, innerWidth - fps.offsetWidth);
    const maxY = Math.max(0, innerHeight - fps.offsetHeight);
    fps.style.left = `${Math.min(maxX, Math.max(0, x))}px`;
    fps.style.top = `${Math.min(maxY, Math.max(0, y))}px`;
  };
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) requestAnimationFrame(() => place(saved.x, saved.y));
  } catch {}
  fps.addEventListener("pointerdown", (e) => {
    if (document.pointerLockElement) return;
    e.preventDefault();
    const dx = e.clientX - fps.offsetLeft;
    const dy = e.clientY - fps.offsetTop;
    const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ x: fps.offsetLeft, y: fps.offsetTop }));
      } catch {}
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  });
  const refreshDrag = () => fps.classList.toggle("drag", !document.pointerLockElement);
  document.addEventListener("pointerlockchange", refreshDrag);
  window.addEventListener("resize", () => place(fps.offsetLeft, fps.offsetTop));

  const refreshCrosshairVisibility = () => {
    canvas.hidden = !(settings.crosshairEnabled && document.pointerLockElement);
  };
  document.addEventListener("pointerlockchange", refreshCrosshairVisibility);

  const redraw = () => {
    const dpr = window.devicePixelRatio || 1;
    drawCrosshair(ctx, colorOverride ? { ...settings, crosshairColor: colorOverride } : settings, dpr);
    placeCrosshair(canvas, dpr);
  };
  // Resizing or moving to a screen with another scaling changes the pixel ratio.
  window.addEventListener("resize", redraw);

  const update = (next) => {
    settings = next;
    redraw();
    refreshCrosshairVisibility();
    fps.hidden = !settings.fpsCounter;
    fps.style.fontSize = `${settings.fpsCounterSize || 13}px`;
    refreshDrag();
  };

  update(initial);
  return {
    update,
    // Temporarily replaces the crosshair color (used by health colors).
    // RITE Bench's line next to the FPS (1 % low, stutters, RAM); "" hides it.
    setDetail(text) {
      if (fpsDetail.textContent !== text) fpsDetail.textContent = text;
      fpsDetail.hidden = !text;
    },
    setColorOverride(color) {
      if (color === colorOverride) return;
      colorOverride = color;
      redraw();
    },
  };
}

module.exports = { createOverlay, drawCrosshair };
