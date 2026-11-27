"use strict";

// RITE Bench, the preload's part: frame times of the time actually played (the
// pointer locked in a match, the window visible) go into a histogram; when the
// match ends the summary goes to the client (src/main/perf-stats.js), which
// keeps it with the settings it ran with. It also feeds the detailed FPS
// counter (FPS · 1 % low · stutters). Off with the "perfStats" setting.

const { BUCKETS, bucketOf, summarize, KIRKA_SETTINGS, kirkaStorageKey } = require("../../main/perf-stats");

// Kirka's graphics settings right now (its own menu, kept in localStorage).
function kirkaSettings() {
  const out = {};
  for (const [name, setting] of Object.entries(KIRKA_SETTINGS)) {
    try {
      const raw = localStorage.getItem(kirkaStorageKey(setting));
      if (raw != null) out[name] = JSON.parse(raw);
    } catch {}
  }
  return out;
}

// A match shorter than this (a quick leave) tells nothing.
const MIN_SECONDS = 30;
// How often the RAM and CPU of the client are asked for while playing.
const METRICS_MS = 5000;

// Asked once, after the first match measured (the player is back in the menu).
function askToShare(ipc) {
  if (document.getElementById("rite-bench-ask")) return;
  const host = document.createElement("div");
  host.id = "rite-bench-ask";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(380px, 92vw); box-sizing: border-box; padding: 14px 16px; background: #14121a; color: #ece6d6; border: 1px solid #c8a24a; border-radius: 3px; box-shadow: 0 12px 40px #000a; font: 13.5px/1.45 system-ui, sans-serif; }
    b { display: block; color: #e0b34a; letter-spacing: .08em; text-transform: uppercase; font-size: 12.5px; margin-bottom: 6px; }
    p { margin: 0 0 8px; }
    small { display: block; opacity: .7; font-size: 12px; margin-bottom: 10px; }
    .row { display: flex; gap: 8px; justify-content: flex-end; }
    button { cursor: pointer; padding: 7px 12px; border: 1px solid #c8a24a; background: transparent; color: #f3d48a; border-radius: 2px; font: inherit; font-size: 12.5px; }
    button.yes { background: #c8a24a; color: #16121c; font-weight: 700; }
  </style><div class="card"><b>RITE Bench</b><p>¿Compartir tus mediciones con RITE para que el cliente corra mejor en PCs como la tuya?</p><small>Solo FPS, tirones, tus ajustes de rendimiento y el tipo de PC (procesador, tarjeta de video, RAM). Sin tu nombre, cuenta ni IP. Lo cambias cuando quieras en Rendimiento.</small><div class="row"><button class="no">No, gracias</button><button class="yes">Sí, compartir</button></div></div>`;
  const answer = (value) => {
    host.remove();
    ipc.invoke("perf:share", value).catch(() => {});
  };
  root.querySelector(".yes").addEventListener("click", () => answer("yes"));
  root.querySelector(".no").addEventListener("click", () => answer("no"));
  document.documentElement.append(host);
}

function createPerfStats({ ipc, overlay, getSettings }) {
  let session = null;
  let wasPlaying = false;
  let ema = 0;
  // The last 5 s for the live counter: { hist, hitches } per second.
  const recent = [];
  let lastMetrics = 0;
  let live = null;

  const inMatch = () => /^\/games\//.test(location.pathname);
  const playing = () => inMatch() && Boolean(document.pointerLockElement) && !document.hidden;
  const on = () => Boolean(getSettings().perfStats);

  const newSession = () => ({
    path: location.pathname,
    hist: new Uint32Array(BUCKETS),
    seconds: 0,
    hitches: 0,
    ram: [],
    cpu: [],
  });

  function flush() {
    const s = session;
    session = null;
    if (!s || s.seconds < MIN_SECONDS) return;
    const hist = [];
    for (let b = 0; b < s.hist.length; b++) if (s.hist[b]) hist.push([b, s.hist[b]]);
    const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
    ipc
      .invoke("perf:session", {
        seconds: s.seconds,
        hist,
        hitches: s.hitches,
        process: { ramMB: mean(s.ram), cpu: mean(s.cpu) },
        width: innerWidth * devicePixelRatio,
        height: innerHeight * devicePixelRatio,
        kirka: kirkaSettings(),
      })
      .then((r) => r?.ask && askToShare(ipc))
      .catch(() => {});
  }

  window.addEventListener("rite-frames", (e) => {
    const now = playing();
    // The first second of play holds the gap since the last frame drawn while paused.
    const counts = now && wasPlaying;
    wasPlaying = now;
    if (!on()) return;
    if (session && session.path !== location.pathname) flush();
    if (!counts) return;
    const times = String(e.detail || "")
      .split(",")
      .map(Number)
      .filter((ms) => ms > 0 && ms < 5000);
    if (!times.length) return;
    session ??= newSession();
    const hist = new Uint32Array(BUCKETS);
    let hitches = 0;
    let total = 0;
    for (const ms of times) {
      // A stutter: a frame much slower than the ones around it.
      if (!ema) ema = ms;
      if (ms > Math.max(ema * 2.5, ema + 6)) hitches++;
      else ema = ema * 0.95 + ms * 0.05;
      const b = bucketOf(ms);
      hist[b]++;
      session.hist[b]++;
      total += ms;
    }
    session.seconds += total / 1000;
    session.hitches += hitches;
    recent.push({ hist, seconds: total / 1000, hitches });
    if (recent.length > 5) recent.shift();
    if (Date.now() - lastMetrics >= METRICS_MS) {
      lastMetrics = Date.now();
      ipc
        .invoke("perf:metrics")
        .then((m) => {
          live = m;
          if (session && m) {
            session.ram.push(m.ramMB);
            session.cpu.push(m.cpu);
          }
        })
        .catch(() => {});
    }
    showLive();
  });

  function showLive() {
    if (!getSettings().fpsCounterDetail) return overlay.setDetail?.("");
    const hist = new Uint32Array(BUCKETS);
    let seconds = 0;
    let hitches = 0;
    for (const r of recent) {
      for (let b = 0; b < BUCKETS; b++) if (r.hist[b]) hist[b] += r.hist[b];
      seconds += r.seconds;
      hitches += r.hitches;
    }
    const s = summarize(hist, seconds, hitches);
    if (!s) return;
    const parts = [`1% ${s.low1}`, `${hitches} ${hitches === 1 ? "tirón" : "tirones"}`];
    if (live?.ramMB) parts.push(`${(live.ramMB / 1024).toFixed(1)} GB`);
    overlay.setDetail?.(parts.join(" · "));
  }

  // Leaving the match (to the menu, another match or closing) ends the session.
  window.addEventListener("pagehide", flush);
  setInterval(() => {
    if (session && (!inMatch() || session.path !== location.pathname)) flush();
  }, 3000);

  return {
    update(next) {
      if (!next.perfStats) session = null;
      if (!next.fpsCounterDetail) overlay.setDetail?.("");
    },
  };
}

module.exports = { createPerfStats, kirkaSettings };
