"use strict";

// The page's frame hook: counts the game's real frames and caps them. Kirka
// draws on requestAnimationFrame, so frames that come sooner than the limit
// are skipped (all callbacks of an allowed frame still run together). An early
// frame waits on a timer instead of asking for frame after frame. A cap always
// runs with vsync (see uncapped in main/performance.js): never a busy wait for
// a frame, which kept the page's thread from the game's network messages.
// Every half second it tells the FPS counter (which lives in the preload,
// where requestAnimationFrame isn't the game's) how many frames the game drew.
//
// The hop (#82): before asking for a frame, one hop through the page's task
// queue, so the server's messages that already arrived get handled first.
// Without it, on a weak PC drawing without a limit, Chromium gives every turn
// to the next frame and the mouse while shooting, and the messages wait in
// line for over a second: the other players freeze, then everything rushes by
// (Aethyr's recording of 8-nov: 51 waits over 150 ms in 84 s, 41 of them while
// shooting). But a hop on every frame is what made "sin límite" feel off on a
// strong PC (FRANKZ, 9-nov: «sin salto» so smooth). So by default ("auto") the
// hook watches the queue instead: every quarter second, from inside a frame, a
// probe goes through the queue; if it waited too long, messages are waiting
// too, and the hop turns on for a few seconds. A strong PC never hops.
//
// Modes (setting frameHook): auto | normal (always hop) | nohop (never) | off
// (no hook when there is no cap: Kirka draws alone, no FPS counter or Bench).
//
// @author FRANKZ

const MODES = Object.freeze(["auto", "normal", "nohop", "off"]);
// How long a probe may wait in the queue before the hop turns on (ms), how
// often a probe goes out, and how long the hop stays on after a slow one.
const PROBE_LAG_MS = 40;
const PROBE_EVERY_MS = 250;
const HOP_HOLD_MS = 5000;

// Source to run in the page's world, or null when there's nothing to hook.
function frameHookSource(limit, mode = "auto") {
  if (!MODES.includes(mode)) mode = "auto";
  if (mode === "off" && !limit) return null;
  return `(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    const now = () => performance.now();
    const step = ${limit > 0 ? 1000 / limit : 0};
    const mode = ${JSON.stringify(mode)};
    // How early a frame may come and still count: frame times wobble a little,
    // and skipping a frame for being 1 ms early is a visible hitch.
    const slack = step ? Math.max(1, Math.min(2, step * 0.15)) : 0;
    const ids = new Map();
    let seq = 0, last = -Infinity, open = -1, frames = 0, since = now();
    // The time between drawn frames, for RITE Bench (preload/features/perf.js):
    // sent once a second as text (an array would not cross into the preload's world).
    let prev = -1, times = [], sent = since;
    const count = (t) => {
      frames++;
      if (prev >= 0 && times.length < 4000) times.push(Math.round((t - prev) * 100) / 100);
      prev = t;
      if (t - since >= 500) {
        window.dispatchEvent(new CustomEvent("rite-fps", { detail: Math.round((frames * 1000) / (t - since)) }));
        frames = 0;
        since = t;
      }
      if (t - sent >= 1000) {
        window.dispatchEvent(new CustomEvent("rite-frames", { detail: times.join(",") }));
        times = [];
        sent = t;
      }
    };
    const HOP = 0;
    let hopping = [];
    const hop = new MessageChannel();
    hop.port1.onmessage = () => {
      const due = hopping;
      hopping = [];
      for (const [id, run] of due) if (ids.get(id) === HOP) ids.set(id, raf(run));
    };
    // "auto": a probe through the queue, sent from a frame (timers can starve
    // too, frames never do). One at a time.
    let hopUntil = mode === "normal" ? Infinity : -Infinity;
    let probeAt = -Infinity, probing = false;
    // For RITE Medidor: how many times the hop turned on and until when.
    const hops = { count: 0, until: -Infinity };
    Object.defineProperty(window, "__riteHops", { value: hops, configurable: true });
    const probe = new MessageChannel();
    probe.port1.onmessage = (e) => {
      probing = false;
      const t = now();
      if (t - e.data > ${PROBE_LAG_MS}) {
        hopUntil = t + ${HOP_HOLD_MS};
        hops.count++;
        hops.until = hopUntil;
      }
    };
    const watch = () => {
      if (mode !== "auto" || probing) return;
      const t = now();
      if (t - probeAt < ${PROBE_EVERY_MS}) return;
      probeAt = t;
      probing = true;
      probe.port2.postMessage(t);
    };
    window.requestAnimationFrame = (cb) => {
      const id = ++seq;
      const run = (t) => {
        if (t !== open) {
          if (step && t - last < step - slack) {
            // With vsync the next frame comes at the next refresh anyway.
            const wait = step - slack - (t - last);
            const again = () => ids.has(id) && ids.set(id, raf(run));
            if (wait > 2) ids.set(id, -setTimeout(again, wait - 1));
            else ids.set(id, raf(run));
            return;
          }
          last = step && t - last < step * 2 ? last + step : t;
          open = t;
          count(t);
          watch();
        }
        ids.delete(id);
        cb(t);
      };
      if (mode === "nohop" || now() >= hopUntil) {
        ids.set(id, raf(run));
        return id;
      }
      ids.set(id, HOP);
      if (hopping.push([id, run]) === 1) hop.port2.postMessage(0);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      const inner = ids.get(id);
      if (inner < 0) clearTimeout(-inner);
      else if (inner) caf(inner);
      ids.delete(id);
    };
  })();`;
}

module.exports = { MODES, frameHookSource, PROBE_LAG_MS, PROBE_EVERY_MS, HOP_HOLD_MS };
