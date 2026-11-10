"use strict";

// "Mis clips": list, play, trim and a copy for Discord. The copy is made here
// with Mediabunny (WebCodecs, the graphics card when it can): the trimmed part,
// re-encoded small enough for Discord without Nitro (10 MB).

(() => {
  const api = window.riteViewer;
  const MB = window.Mediabunny;
  const $ = (sel) => document.querySelector(sel);
  const video = $("#video");
  const list = $("#list");
  const status = $("#status");
  const progress = $("#progress");
  const share = $("#share");

  // Discord's limit without Nitro is 10 MB; this leaves room for the container.
  const TARGET_BYTES = 9.3e6;
  const LIMIT_BYTES = 10e6;
  const AUDIO_BPS = 96000;

  let clips = [];
  let current = null;
  let busy = false;

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmtTenth = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  const fmtSize = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
  const fmtDate = (ms) => new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const say = (text, error = false) => {
    status.textContent = text;
    status.className = error ? "error" : "";
  };

  async function load(keep) {
    clips = await api.list().catch(() => []);
    list.replaceChildren();
    $("#empty").hidden = clips.length > 0;
    for (const clip of clips) {
      const li = document.createElement("li");
      li.textContent = fmtDate(clip.at);
      const small = document.createElement("small");
      small.textContent = `${fmtSize(clip.size)} · ${clip.name}`;
      li.append(small);
      li.addEventListener("click", () => select(clip));
      clip.li = li;
      list.append(li);
    }
    const again = keep && clips.find((c) => c.name === keep);
    if (again) select(again);
    else if (clips.length) select(clips[0]);
    else {
      current = null;
      video.removeAttribute("src");
      $("#tools").hidden = true;
    }
  }

  function select(clip) {
    if (busy) return;
    current = clip;
    for (const c of clips) c.li.classList.toggle("on", c === clip);
    video.src = clip.url;
    $("#tools").hidden = false;
    say("");
  }

  // The trim bar: one track from 0 to the clip's whole length, with a handle
  // for the start and one for the end (never closer than MIN_GAP). Dragging a
  // handle shows that moment in the video; the line is where the video is.
  const MIN_GAP = 0.5;
  const track = $("#track");
  const sel = track.querySelector(".sel");
  const head = track.querySelector(".head");
  const handles = { start: track.querySelector(".h-start"), end: track.querySelector(".h-end") };
  const trim = { a: 0, b: 0, d: 0 };
  const pct = (t) => `${trim.d ? (t / trim.d) * 100 : 0}%`;
  const range = () => [trim.a, trim.b];

  function showRange() {
    sel.style.left = pct(trim.a);
    sel.style.width = `${trim.d ? ((trim.b - trim.a) / trim.d) * 100 : 0}%`;
    handles.start.style.left = pct(trim.a);
    handles.end.style.left = pct(trim.b);
    head.style.left = pct(Math.min(video.currentTime || 0, trim.d));
    $("#t-start").textContent = fmtTenth(trim.a);
    $("#t-end").textContent = fmtTenth(trim.b);
    $("#range").textContent = `${Math.max(0, trim.b - trim.a).toFixed(1)} s de ${trim.d.toFixed(1)} s`;
  }
  function setStart(t) {
    trim.a = Math.max(0, Math.min(t, trim.b - MIN_GAP));
    showRange();
  }
  function setEnd(t) {
    trim.b = Math.min(trim.d, Math.max(t, trim.a + MIN_GAP));
    showRange();
  }
  const timeAt = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * trim.d;
  };

  video.addEventListener("loadedmetadata", () => {
    trim.d = video.duration || 0;
    trim.a = 0;
    trim.b = trim.d;
    showRange();
  });

  for (const [which, el] of Object.entries(handles)) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      video.pause();
      const move = (ev) => {
        (which === "start" ? setStart : setEnd)(timeAt(ev.clientX));
        video.currentTime = which === "start" ? trim.a : trim.b;
        showRange();
      };
      move(e);
      el.onpointermove = move;
      el.onpointerup = el.onpointercancel = () => {
        el.onpointermove = el.onpointerup = el.onpointercancel = null;
      };
    });
    // Arrows move a handle by a tenth of a second (Shift: a second).
    el.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 1 : 0.1;
      const delta = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      if (!delta) return;
      e.preventDefault();
      if (which === "start") setStart(trim.a + delta);
      else setEnd(trim.b + delta);
      video.currentTime = which === "start" ? trim.a : trim.b;
    });
  }
  // A click on the bar (not a handle) moves the video there.
  track.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("handle")) return;
    video.currentTime = timeAt(e.clientX);
    showRange();
  });

  // Plays only the trimmed part, over and over; the line follows the video.
  video.addEventListener("timeupdate", () => {
    if (!video.paused && (video.currentTime > trim.b + 0.05 || video.currentTime < trim.a - 0.05)) video.currentTime = trim.a;
  });
  (function follow() {
    if (trim.d) head.style.left = pct(Math.min(video.currentTime || 0, trim.d));
    requestAnimationFrame(follow);
  })();

  $("#mark-start").addEventListener("click", () => setStart(video.currentTime));
  $("#mark-end").addEventListener("click", () => setEnd(video.currentTime));

  // Bitrate and size for the Discord copy: as big as fits in 10 MB.
  function plan(seconds, sourceHeight, scale = 1) {
    const total = ((TARGET_BYTES * 8) / seconds) * scale;
    const videoBps = Math.max(250000, Math.min(8e6, total - AUDIO_BPS));
    const height = Math.min(sourceHeight || 1080, videoBps >= 4e6 ? 1080 : videoBps >= 1.6e6 ? 720 : videoBps >= 800000 ? 540 : 360);
    return { videoBps: Math.round(videoBps), height: Math.floor(height / 2) * 2, frameRate: videoBps < 1.2e6 ? 30 : undefined };
  }

  async function convert(bytes, range, p) {
    if (!MB) throw new Error(`no cargó el convertidor (${window.riteLoadErrors?.join("; ") || "sin detalle"})`);
    // The graphics card first; without one (or that size), the processor.
    try {
      return await convertWith(bytes, range, p, "prefer-hardware");
    } catch (e) {
      if (!/not supported|configuration/i.test(String(e?.message))) throw e;
      return convertWith(bytes, range, p, "no-preference");
    }
  }

  async function convertWith(bytes, [a, b], p, hardwareAcceleration) {
    const input = new MB.Input({ source: new MB.BufferSource(bytes), formats: MB.ALL_FORMATS });
    const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }), target: new MB.BufferTarget() });
    const conversion = await MB.Conversion.init({
      input,
      output,
      trim: { start: a, end: b },
      video: { height: p.height, bitrate: p.videoBps, codec: "avc", frameRate: p.frameRate, forceTranscode: true, hardwareAcceleration },
      audio: { bitrate: AUDIO_BPS, forceTranscode: true },
    });
    if (!conversion.isValid) throw new Error("este clip no se puede convertir en esta PC");
    conversion.onProgress = (x) => {
      progress.firstElementChild.style.width = `${Math.round(x * 100)}%`;
    };
    await conversion.execute();
    return new Uint8Array(output.target.buffer);
  }

  share.addEventListener("click", async () => {
    if (!current || busy) return;
    const clip = current;
    const [a, b] = range();
    busy = true;
    share.disabled = true;
    progress.hidden = false;
    progress.firstElementChild.style.width = "0";
    say("Haciendo la versión para Discord…");
    try {
      const bytes = await api.read(clip.name);
      if (!bytes) throw new Error("no se pudo leer el clip");
      let out = await convert(bytes, [a, b], plan(b - a, video.videoHeight));
      // Rarely over the limit (a lot of motion): once more, smaller.
      if (out.byteLength > LIMIT_BYTES) out = await convert(bytes, [a, b], plan(b - a, video.videoHeight, (LIMIT_BYTES / out.byteLength) * 0.85));
      const saved = await api.saveShare(clip.name, out);
      if (!saved) throw new Error("no se pudo guardar la copia");
      say(
        saved.copied
          ? `Listo (${fmtSize(saved.size)}): pégalo en Discord con Ctrl+V. Si no se pega, usa «Mostrar archivo» y arrástralo.`
          : `Listo (${fmtSize(saved.size)}): está en la carpeta clips/discord. Usa «Mostrar archivo» para arrastrarlo a Discord.`,
      );
      current.shared = true;
    } catch (e) {
      say(`No se pudo hacer la copia: ${e?.message || e}`, true);
    } finally {
      busy = false;
      share.disabled = false;
      setTimeout(() => (progress.hidden = true), 600);
    }
  });

  $("#reveal").addEventListener("click", () => current && api.reveal(current.name, current.shared));
  $("#folder").addEventListener("click", () => api.reveal("", false));
  $("#delete").addEventListener("click", async () => {
    if (!current || busy) return;
    if (!confirm("¿Mandar este clip a la papelera?")) return;
    video.removeAttribute("src");
    video.load();
    await api.remove(current.name).catch(() => {});
    load();
  });

  api.onRefresh(() => load(current?.name));
  load();
})();
