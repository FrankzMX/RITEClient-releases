"use strict";

// Client language. Spanish is the source: every text in the code is written in
// Spanish and doubles as its own key, so nothing has to be renamed to
// translate it. `tr()` returns the English text when the client is in English
// and there is one in i18n-en.js; otherwise the Spanish text as it came.
//
// Keys with {name} are patterns, for texts built with values inside
// ("Swapper: {n} archivo(s) activos"). The values are kept as they are, or
// translated too when they are a known text on their own ("sin límite").
//
// Works in Node (main process, game preload) and as a plain <script> in the
// hub and «Mis clips» (after i18n-en.js), where it is window.riteI18n.

(function (root, factory) {
  const EN = typeof module === "object" && module.exports ? require("./i18n-en") : root.riteI18nEN;
  const api = factory(EN || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.riteI18n = api;
})(typeof self !== "undefined" ? self : this, (EN) => {
  const LANGUAGES = Object.freeze(["auto", "es", "en"]);
  const has = (key) => Object.prototype.hasOwnProperty.call(EN, key);

  // "auto" follows the system: Spanish for any es-*, English for the rest.
  function resolveLanguage(setting, systemLocale = "") {
    if (setting === "es" || setting === "en") return setting;
    return /^es\b/i.test(String(systemLocale)) ? "es" : "en";
  }

  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const PATTERNS = Object.entries(EN)
    .filter(([key]) => /\{\w+\}/.test(key))
    .map(([key, value]) => {
      const names = [];
      const source = escape(key).replace(/\\\{(\w+)\\\}/g, (_, name) => {
        names.push(name);
        return "([\\s\\S]*?)";
      });
      return { re: new RegExp(`^${source}$`), names, value };
    });

  let current = "es";

  function setLanguage(lang) {
    current = lang === "en" ? "en" : "es";
  }

  function getLanguage() {
    return current;
  }

  // `params` fills the {name} of a pattern from code: tr("Máximo {n} perfiles.", { n: 5 }).
  function tr(text, params, lang = current) {
    if (typeof text !== "string") return text;
    let out = text;
    if (lang === "en") {
      if (has(text)) out = EN[text];
      else if (!params) out = matchPattern(text) ?? text;
    }
    return params ? fill(out, params, lang) : out;
  }

  function fill(template, params, lang) {
    return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(word(params[name], lang)) : whole));
  }

  // A value inside a text: translated only when it is a whole known text.
  function word(value, lang = current) {
    if (lang !== "en" || typeof value !== "string") return value;
    return has(value) ? EN[value] : value;
  }

  // Texts that matched nothing, so a panel that redraws often does not run
  // every pattern again for the same player name or number.
  const misses = new Set();
  function matchPattern(text) {
    if (misses.has(text)) return null;
    for (const { re, names, value } of PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      const params = {};
      // Each value as a text of its own: a known one, or one that fits another pattern.
      names.forEach((name, i) => {
        const v = m[i + 1];
        params[name] = has(v) ? EN[v] : v && /\p{L}/u.test(v) ? (matchPattern(v) ?? v) : v;
      });
      return fill(value, params, "as-is");
    }
    if (misses.size > 2000) misses.clear();
    misses.add(text);
    return null;
  }

  // Translates a text node keeping the spaces around it.
  function translateText(node) {
    const text = node.nodeValue;
    if (!text || !/\p{L}/u.test(text)) return;
    let out = tr(text);
    if (out === text) {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
      if (m[2] !== text) out = m[1] + tr(m[2]) + m[3];
    }
    if (out !== text) node.nodeValue = out;
  }

  const ATTRS = ["title", "placeholder", "aria-label"];
  const SKIP = "script, style, textarea, [contenteditable], [data-no-tr]";

  function translateTree(node) {
    if (node.nodeType === 3) {
      if (!node.parentElement?.closest(SKIP)) translateText(node);
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (node.closest(SKIP)) return;
      translateAttrs(node);
    }
    const walker = (node.ownerDocument || node).createTreeWalker(node, 5 /* elements and text */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 1) {
        if (n.matches(SKIP)) continue;
        translateAttrs(n);
      } else if (!n.parentElement?.closest(SKIP)) translateText(n);
    }
  }

  function translateAttrs(el) {
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (value) {
        const out = tr(value);
        if (out !== value) el.setAttribute(name, out);
      }
    }
  }

  // Keeps a whole page or panel (a shadow root too) in English: translates it
  // now and whatever is added or changed later. In Spanish it does nothing at
  // all, so the Spanish client pays nothing for it.
  function watch(root) {
    if (current !== "en" || !root || typeof MutationObserver === "undefined") return null;
    translateTree(root);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList") r.addedNodes.forEach(translateTree);
        else if (r.type === "characterData") {
          if (!r.target.parentElement?.closest(SKIP)) translateText(r.target);
        } else if (r.type === "attributes") translateAttrs(r.target);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return observer;
  }

  return { LANGUAGES, resolveLanguage, setLanguage, getLanguage, tr, watch, EN };
});
