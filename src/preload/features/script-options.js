"use strict";

// Scripts made for other Kirka clients (Juice, BKC) all put their options in
// one shared #scripts-options element. To give each script its own «Opciones»
// button in the menu, the client works out which script added each node: every
// userscript runs with a `//# sourceURL=rite-userscript/<key>/<name>`, so that
// key shows up in the stack of any call the script makes, even from a callback
// it set up later. The node then goes into that script's own
// `<div data-rite-script="<key>">` inside #scripts-options. Nodes it can't place
// (code the script injected another way) stay loose and show under «Otros».
// Nothing changes for the scripts: they still find #scripts-options as before.

const BOX_ID = "scripts-options";

// Like encodeURIComponent, but also escapes the characters a stack line wraps
// the URL in, so the key can be read back out of it.
const encode = (text) => encodeURIComponent(text).replace(/[()'!*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// `m.<id>` for a RITE module, `s.<file>` for a script from the scripts folder.
function scriptKey({ name, module }) {
  if (module && /^[a-z0-9-]{1,40}$/.test(module)) return `m.${module}`;
  return `s.${encode(name)}`;
}

function sourceUrl(script) {
  return `rite-userscript/${scriptKey(script)}/${encode(script.name)}`;
}

// Runs in the page's world (webFrame.executeJavaScript), before any userscript.
const PAGE_SOURCE = `(() => {
  const ID = ${JSON.stringify(BOX_ID)};
  const OWNER = /rite-userscript\\/([^\\/\\s:)]+)\\//;
  const owner = () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 80;
    const stack = new Error().stack || "";
    Error.stackTraceLimit = limit;
    const match = OWNER.exec(stack);
    return match ? match[1] : null;
  };
  const N = Node.prototype, E = Element.prototype;
  const appendChild = N.appendChild, append = E.append;
  // The node a script's call should land in: its own box, made the first time.
  const target = (el) => {
    if (el.nodeType !== 1 || el.id !== ID) return null;
    const key = owner();
    if (!key) return null;
    for (const child of el.children) if (child.dataset.riteScript === key) return child;
    const own = document.createElement("div");
    own.dataset.riteScript = key;
    append.call(el, own);
    return own;
  };
  const wrap = (proto, name, call) => {
    const original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = function (...args) {
      const own = target(this);
      return own ? call(original, own, args) : original.apply(this, args);
    };
  };
  wrap(N, "appendChild", (fn, own, args) => fn.apply(own, args));
  // The reference node lives in the shared box, not in the script's: append instead.
  wrap(N, "insertBefore", (fn, own, args) => (args[1] && args[1].parentNode === own ? fn.apply(own, args) : appendChild.call(own, args[0])));
  wrap(E, "append", (fn, own, args) => fn.apply(own, args));
  wrap(E, "prepend", (fn, own, args) => fn.apply(own, args));
  wrap(E, "insertAdjacentElement", (fn, own, args) => (/^(afterbegin|beforeend)$/i.test(args[0]) ? fn.apply(own, args) : fn.apply(own.parentNode, args)));
  wrap(E, "insertAdjacentHTML", (fn, own, args) => (/^(afterbegin|beforeend)$/i.test(args[0]) ? fn.apply(own, args) : fn.apply(own.parentNode, args)));
})();`;

module.exports = { BOX_ID, PAGE_SOURCE, scriptKey, sourceUrl };
