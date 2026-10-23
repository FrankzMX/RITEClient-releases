"use strict";

// Puts the RITE Client badge next to players who use the client, wherever
// Kirka writes their name with its #ID as text (profiles, friends, menus).
// Nothing is watched during a match, and names drawn inside the 3D view are
// not text, so they get no badge.

const { dataUrl } = require("./assets");

const MARK = "data-rite-badge";
const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

// Matches "Name#TAG" and "#TAG" against the list. Only the ID counts: names
// repeat in Kirka (and short ones match menu words), so a bare name would put
// the badge on players who don't use the client.
function createMatcher(list) {
  const tags = new Set();
  for (const p of list) if (p.tag) tags.add(p.tag.toLowerCase());
  return (raw) => {
    if (!raw || raw.length > 48) return false;
    const text = norm(raw);
    const at = text.lastIndexOf("#");
    return at >= 0 && tags.has(text.slice(at + 1).trim());
  };
}

function createBadges() {
  let match = () => false;
  let enabled = false;
  const src = dataUrl("logo-small.png");
  const pending = new Set();
  let scheduled = false;
  let marked = new WeakMap(); // parent -> its badge, instead of searching the parent

  const badge = () => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.title = "Usa RITE Client";
    img.className = "rite-badge";
    img.setAttribute(MARK, "");
    img.style.cssText = "display:inline-block;width:1.05em;height:1.05em;margin:0 0 0 .3em;vertical-align:-0.15em;pointer-events:auto;";
    return img;
  };

  function mark(textNode) {
    const parent = textNode.parentElement;
    if (!parent || parent.hasAttribute(MARK) || marked.get(parent)?.parentNode === parent) return;
    if (/^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|TITLE)$/.test(parent.tagName)) return;
    if (!match(textNode.data)) return;
    const img = badge();
    marked.set(parent, img);
    parent.insertBefore(img, textNode.nextSibling);
  }

  function scan(node) {
    if (node.nodeType === Node.TEXT_NODE) return mark(node);
    if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute(MARK)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(), seen = 0; n && seen < 4000; n = walker.nextNode(), seen++) mark(n);
  }

  function flush() {
    scheduled = false;
    if (!enabled) return pending.clear();
    for (const node of pending) if (node.isConnected) scan(node);
    pending.clear();
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") pending.add(r.target);
      else for (const n of r.addedNodes) pending.add(n);
    }
    // In idle time, not in the next frame: the badges can wait for a quiet moment.
    if (!scheduled && pending.size) {
      scheduled = true;
      requestIdleCallback(flush, { timeout: 1000 });
    }
  });

  // Not during a match (mouse captured): the HUD text changes every frame.
  function watch() {
    observer.disconnect();
    pending.clear();
    if (enabled && !document.pointerLockElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      if (document.body) {
        pending.add(document.body);
        if (!scheduled) {
          scheduled = true;
          requestIdleCallback(flush, { timeout: 1000 });
        }
      }
    }
  }
  document.addEventListener("pointerlockchange", watch);

  function clear() {
    for (const el of document.querySelectorAll(`img[${MARK}]`)) el.remove();
    marked = new WeakMap();
  }

  return {
    // list: [{ name, tag }] from RITE WEB. Empty or disabled removes every badge.
    update(list, on) {
      enabled = Boolean(on) && list.length > 0;
      match = createMatcher(list);
      clear();
      watch();
    },
  };
}

module.exports = { createBadges, createMatcher };
