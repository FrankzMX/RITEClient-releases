"use strict";

// Kirka paints most of its menus (Hub, Clans, Market, Kirka TV, news, the end
// screen) with blue set in per-component styles that have no stable class to
// target. With the RITE theme on, this finds whatever is still Kirka blue and
// moves it onto the RITE palette. It only restyles what is already on screen.

const TEAM = ".team-score, .tab-info, .tab-team-info, .red, .blue";
const GOLD = [224, 179, 74];
const GOLD_2 = [243, 212, 138];
const LINE = [58, 51, 36];

function parseColor(value) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(String(value).trim());
  if (!m) return null;
  let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : Number(m[4]);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
}

function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

const rgba = ([r, g, b], a) => (a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`);

// Kirka's navy and blue family, from its darkest panels to its bright accents.
function isKirkaBlue({ h, s, l }) {
  return h >= 195 && h <= 262 && s >= 0.16 && l >= 0.08 && l <= 0.78;
}

function isKirkaGreen({ h, s, l }) {
  return h >= 120 && h <= 160 && s >= 0.45 && l >= 0.35 && l <= 0.7;
}

// Returns the RITE replacement for a colour, or null to leave it alone.
function mapColor(value, role) {
  const c = parseColor(value);
  if (!c || c.a === 0) return null;
  const hsl = toHsl(c);
  if (role === "text") {
    if (isKirkaBlue(hsl) && hsl.l >= 0.45) return rgba(GOLD_2, c.a);
    if (isKirkaGreen(hsl)) return rgba(GOLD, c.a);
    return null;
  }
  if (!isKirkaBlue(hsl)) return null;
  // Vivid sky blue is a tier or reward colour next to yellow and purple ones.
  if (role === "background" && hsl.s >= 0.8 && hsl.l >= 0.55) return null;
  if (role === "border") return rgba(hsl.l >= 0.42 && hsl.s >= 0.4 ? GOLD : LINE, c.a);
  // Backgrounds keep their relative depth: Kirka's lighter rows stay a step
  // lighter than the panel they sit on.
  return rgba(hslToRgb(262, 0.16, 0.05 + Math.min(hsl.l, 0.5) * 0.26), c.a);
}

function mapGradient(value) {
  if (!/gradient\(/.test(value)) return null;
  let changed = false;
  const out = value.replace(/rgba?\([^)]*\)/g, (token) => {
    const mapped = mapColor(token, "background");
    if (!mapped) return token;
    changed = true;
    return mapped;
  });
  return changed ? out : null;
}

// Reads every style of a batch before writing any (one style recalculation
// per batch instead of one per element), in idle time, and looks at each
// element once. Computed colours are kept per class: Kirka repeats the same
// few dozen classes everywhere.
function createRecolor(root = () => document.querySelector("#app")) {
  const touched = new Map(); // element -> { prop: [value, priority] }
  let seen = new WeakSet(); // elements already looked at
  let panels = new WeakSet(); // elements that get a RITE background (their children are not top-level panels)
  const looks = new Map(); // tag, classes, inline style and parent classes -> what the computed style says
  let enabled = false;
  let paused = false;
  let observer = null;
  let stack = [];
  let scheduled = null;

  // Never during play, in a match room, or while the client is entering one:
  // reading styles then costs frames.
  const quiet = () => !enabled || paused || Boolean(document.pointerLockElement) || /^\/games\//.test(location.pathname);

  const restore = (el) => {
    const saved = touched.get(el);
    if (!saved) return;
    for (const [prop, [value, priority]] of Object.entries(saved)) {
      if (value) el.style.setProperty(prop, value, priority);
      else el.style.removeProperty(prop);
    }
    touched.delete(el);
  };

  const set = (el, prop, value) => {
    let saved = touched.get(el);
    if (!saved) touched.set(el, (saved = {}));
    if (!(prop in saved)) saved[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
    el.style.setProperty(prop, value, "important");
  };

  // What the computed style asks for, for every element that looks the same.
  function lookOf(el) {
    const key = `${el.tagName}.${el.getAttribute("class") || ""}|${el.getAttribute("style") || ""}|${el.parentElement?.getAttribute("class") || ""}`;
    let look = looks.get(key);
    if (look) return look;
    const cs = getComputedStyle(el);
    if (cs.display === "none") return null; // not cached: it may show up later
    const sides = ["top", "right", "bottom", "left"];
    const widths = sides.map((side) => parseFloat(cs[`border-${side}-width`]) || 0);
    const colors = sides.map((side) => cs[`border-${side}-color`]);
    look = {
      bg: mapColor(cs.backgroundColor, "background"),
      round: parseFloat(cs.borderTopLeftRadius) > 4,
      grad: cs.backgroundImage !== "none" ? mapGradient(cs.backgroundImage) : null,
      // A border on a single side marks rarity or a team; only uniform frames change.
      border: widths.every((x) => x > 0) && colors.every((x) => x === colors[0]) ? mapColor(colors[0], "border") : null,
      text: mapColor(cs.color, "text"),
      heading: parseFloat(cs.fontSize) >= 20 && Number(cs.fontWeight) >= 600 && !/Oswald/.test(cs.fontFamily),
    };
    if (looks.size > 4000) looks.clear();
    looks.set(key, look);
    return look;
  }

  // Reads only: the changes one element needs, as [prop, value] pairs.
  function plan(el) {
    // Team colours stay red and blue.
    if (el instanceof HTMLCanvasElement || el.closest(TEAM)) return null;
    if (el instanceof SVGElement) {
      // Large decorative artwork (the Clans page blobs) goes dark and warm.
      if (el.tagName.toLowerCase() !== "svg") return null;
      const box = el.getBoundingClientRect();
      return box.width >= 300 && box.height >= 300 ? [["filter", "grayscale(1) sepia(0.5) brightness(0.22)"]] : null;
    }
    const look = lookOf(el);
    if (!look) return undefined;
    const out = [];
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Thin strips are information (rarity and clan tier colours), not chrome.
    if (!(w <= 40 || h <= 8)) {
      if (look.bg) {
        out.push(["background-color", look.bg]);
        // RITE corners are sharp; circles (avatars, badges) stay round.
        if (look.round && w !== h) out.push(["border-radius", "3px"]);
        // Top-level panels get RITE's gold top edge.
        if (w >= 220 && h >= 150 && !panels.has(el.parentElement)) out.push(["box-shadow", "inset 0 2px 0 rgb(224, 179, 74)"]);
        panels.add(el);
      }
      if (look.grad) out.push(["background-image", look.grad]);
    }
    if (look.border) for (const side of ["top", "right", "bottom", "left"]) out.push([`border-${side}-color`, look.border]);
    if ((look.text || look.heading) && !el.closest(".chat, .messages, .kill-bar-cont") && [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) {
      if (look.text) out.push(["color", look.text]);
      // Big bold headings (TOP PLAYERS, LEADERS, KIRKA NEWS) use the display face.
      if (look.heading) out.push(["font-family", '"Oswald", "Arial Narrow", sans-serif'], ["letter-spacing", "0.06em"]);
    }
    return out.length ? out : null;
  }

  function work(deadline) {
    scheduled = null;
    if (quiet()) return;
    for (const el of touched.keys()) if (!el.isConnected) touched.delete(el);
    const writes = [];
    while (stack.length && (deadline.timeRemaining() > 1 || (deadline.didTimeout && writes.length < 150))) {
      const el = stack.pop();
      if (!el.isConnected) continue;
      for (let c = el.lastElementChild; c; c = c.previousElementSibling) stack.push(c);
      if (seen.has(el)) continue;
      const changes = plan(el);
      if (changes === undefined) continue; // hidden: looked at again if it comes back
      seen.add(el);
      if (changes) writes.push([el, changes]);
    }
    for (const [el, changes] of writes) for (const [prop, value] of changes) set(el, prop, value);
    if (stack.length) schedule();
  }

  function schedule() {
    if (!scheduled && enabled) scheduled = requestIdleCallback(work, { timeout: 2000 });
  }

  const queue = (el) => {
    if (quiet()) return;
    stack.push(el);
    schedule();
  };

  const sweep = () => {
    const app = root();
    if (!app || quiet()) return;
    stack = [app];
    schedule();
  };

  // Only new elements are watched (not class changes): during a match Kirka's
  // HUD changes classes every frame. Nothing is watched while the mouse is
  // captured; one sweep when the player is back in the menus.
  const watch = () => {
    if (!observer) return;
    observer.disconnect();
    if (document.pointerLockElement) {
      stack = [];
      return;
    }
    observer.observe(document.documentElement, { subtree: true, childList: true });
    sweep();
  };

  return {
    update(on) {
      if (on === enabled) return;
      enabled = on;
      if (on) {
        observer = new MutationObserver((records) => {
          if (quiet()) return;
          for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) queue(n);
        });
        document.addEventListener("pointerlockchange", watch);
        watch();
      } else {
        document.removeEventListener("pointerlockchange", watch);
        observer?.disconnect();
        observer = null;
        if (scheduled) cancelIdleCallback(scheduled);
        scheduled = null;
        stack = [];
        seen = new WeakSet();
        panels = new WeakSet();
        looks.clear();
        for (const el of [...touched.keys()]) restore(el);
      }
    },
    // While the client is taking the player into a match: no work at all,
    // then one sweep of whatever is on screen afterwards.
    pause(on) {
      paused = Boolean(on);
      if (paused) stack = [];
      else sweep();
    },
  };
}

module.exports = { createRecolor, mapColor, mapGradient, parseColor };
