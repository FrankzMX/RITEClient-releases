"use strict";

// RITE WEB and Discord in Kirka's own lobby buttons, top right. Kirka's first
// button switches between its Discord and its Reddit every 30 s, the second
// one is CLIENT DOWNLOAD. Here the first is always RITE's Discord and the
// second is RITE.LAT, with Kirka's card shape and the client's colour.
//
// Nothing is added to Kirka's DOM and nothing watches it: one stylesheet and
// one click listener in capture, so a click on either button never reaches
// Kirka's handler (which would open its own links). A theme or the player's
// CSS (rite.lat/kirka/vidrio.css) can restyle the same two buttons.
//
// @author FRANKZ

const { dataUrl } = require("./assets");

const DISCORD_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.07 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z"/></svg>'
  );

// Client: gold. Light: silver (the same colours as their menus and icons).
const LOOKS = {
  client: { acc: "#e0b34a", hi: "#f3d48a", lo: "#8a6a24", logo: "logo-small.png" },
  light: { acc: "#c9ccd3", hi: "#eef0f4", lo: "#6f737c", logo: "logo-light-small.png" },
};

const WEB = "#settings-and-socicons > .soc-group:has(> .text-soc)";
const DISCORD = "#settings-and-socicons > .soc-group:not(:has(> .text-soc))";

function css({ acc, hi, lo, logo }) {
  return `
#settings-and-socicons > .soc-group > svg { display: none !important; }
#settings-and-socicons > .soc-group::after { content: ""; flex: none; width: 48px; height: 48px; margin: 3.2px 1.6px 0; transition: transform .3s; }
#settings-and-socicons > .soc-group:active::after { transform: scale(.9); }
${DISCORD} { background: #5865f2 !important; border-top-color: #8891f7 !important; border-bottom-color: #3f49c4 !important; border-right-color: #353da3 !important; }
${DISCORD}:hover { background: #6d78f4 !important; }
${DISCORD}::after { width: 42px; height: 42px; margin: 6px 4.6px 3px; background: #fff; -webkit-mask: url("${DISCORD_ICON}") center / contain no-repeat; filter: drop-shadow(0 1px 0 rgba(0,0,0,.4)); }
${WEB} { background: #0b0a0f !important; border-top-color: ${acc} !important; border-bottom-color: ${lo} !important; border-right-color: #1c1a20 !important; }
${WEB}:hover { background: #17151c !important; }
${WEB}::after { background: url("${dataUrl(logo)}") center / contain no-repeat; }
${WEB} > .text-soc > div { font-size: 0 !important; line-height: 1; }
${WEB} > .text-soc > div::before { font-size: 12.5px; letter-spacing: .14em; color: ${hi}; content: "ESPORTS"; }
${WEB} > .text-soc > .discord-name::before { font-size: 22px; letter-spacing: 0; color: ${acc}; content: "RITE.LAT"; }
`;
}

function createLinks({ api, links, edition = "client" }) {
  const web = links.find((l) => !/discord/i.test(l.url));
  const discord = links.find((l) => /discord/i.test(l.url));
  const style = document.createElement("style");
  style.id = "rite-lobby-links";
  style.textContent = css(LOOKS[edition] || LOOKS.client);
  // First in <head>: the RITE theme and the player's CSS come after and win.
  document.head.prepend(style);

  window.addEventListener(
    "click",
    (event) => {
      const button = event.target instanceof Element && event.target.closest("#settings-and-socicons > .soc-group");
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const link = button.querySelector(":scope > .text-soc") ? web : discord;
      if (link) api.openLink(link.url);
    },
    true
  );
}

module.exports = { createLinks, LOOKS, css };
