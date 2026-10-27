"use strict";

// Crosshair and FPS counter. The crosshair only shows while the game has the
// pointer locked, i.e. while actually playing. The counter shows the frames the
// game really draws (counted in the page, see hookFrames in preload/game.js);
// outside the game it can be dragged anywhere, and its size is a setting.

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawCrosshair(ctx, s) {
  const { crosshairSize: size, crosshairThickness: t, crosshairGap: gap, crosshairStyle: style } = s;
  const extent = size + gap + t + 2;
  const dim = extent * 2;
  ctx.canvas.width = dim;
  ctx.canvas.height = dim;
  ctx.clearRect(0, 0, dim, dim);
  const c = extent;
  const color = hexToRgba(s.crosshairColor, s.crosshairOpacity / 100);
  const outline = `rgba(0, 0, 0, ${s.crosshairOpacity / 100})`;

  const rects = [];
  if (style === "cross" || style === "cross-dot") {
    rects.push([c - t / 2, c - gap - size, t, size]); // top
    rects.push([c - t / 2, c + gap, t, size]); // bottom
    rects.push([c - gap - size, c - t / 2, size, t]); // left
    rects.push([c + gap, c - t / 2, size, t]); // right
  }
  if (style === "dot" || style === "cross-dot") rects.push([c - t / 2, c - t / 2, t, t]);

  if (style === "circle") {
    const radius = gap + size / 2;
    if (s.crosshairOutline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = t + 2;
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

  if (s.crosshairOutline) {
    ctx.fillStyle = outline;
    for (const [x, y, w, h] of rects) ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  }
  ctx.fillStyle = color;
  for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
}

function createOverlay(initial) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    canvas { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 2147483646; image-rendering: pixelated; }
    .fps { position: fixed; top: 6px; left: 6px; z-index: 2147483646; pointer-events: none; font: 600 13px/1 ui-monospace, monospace; color: #f2b632; background: #000a; padding: .3em .45em; border-radius: 4px; user-select: none; white-space: nowrap; }
    .fps.drag { pointer-events: auto; cursor: move; }
    [hidden] { display: none !important; }
  </style><canvas hidden></canvas><div class="fps" hidden>-- FPS</div>`;
  document.documentElement.append(host);

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const fps = root.querySelector(".fps");
  let settings = initial;
  let colorOverride = null;
  let shown = 0;

  // The page sends the game's frame count every half second; with no news (the
  // game isn't drawing) it shows "--".
  window.addEventListener("rite-fps", (e) => {
    if (!settings.fpsCounter) return;
    shown = Date.now();
    fps.textContent = `${Number(e.detail) || 0} FPS`;
  });
  setInterval(() => {
    if (settings.fpsCounter && !document.pointerLockElement && Date.now() - shown > 1500) fps.textContent = "-- FPS";
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

  const redraw = () =>
    drawCrosshair(ctx, colorOverride ? { ...settings, crosshairColor: colorOverride } : settings);

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
    setColorOverride(color) {
      if (color === colorOverride) return;
      colorOverride = color;
      redraw();
    },
  };
}

module.exports = { createOverlay, drawCrosshair };
