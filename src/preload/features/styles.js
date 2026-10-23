"use strict";

const { dataUrl, text } = require("./assets");
const { PERF_CSS } = require("../../main/perf-mode");

const ICONS = ["hub", "store", "servers", "quests", "friends", "inventory", "editor"];
// Oswald and Outfit (OFL, see assets/fonts) ship with the client: no request
// to Google Fonts, and they only load with the RITE theme on.
const FONTS = [
  ["Oswald", "fonts/oswald.woff2"],
  ["Outfit", "fonts/outfit.woff2"],
];
const fontFaces = () =>
  FONTS.map(([family, file]) => `@font-face { font-family: "${family}"; src: url("${dataUrl(file)}") format("woff2"); font-weight: 200 700; font-style: normal; font-display: swap; }`).join("\n");

function createStyles() {
  const theme = document.createElement("style");
  theme.id = "rite-theme";
  const user = document.createElement("style");
  user.id = "rite-user-styles";
  const custom = document.createElement("style");
  custom.id = "rite-custom-css";
  const perf = document.createElement("style");
  perf.id = "rite-perf";
  // Order matters: the player's own styles override the RITE theme.
  document.head.append(theme, user, custom, perf);

  let themeCss = null;

  return {
    setTheme(enabled) {
      if (enabled && themeCss === null) {
        const vars = [`--rite-bg: url("${dataUrl("themes/rite-bg.jpg")}");`]
          .concat(ICONS.map((name) => `--rite-icon-${name}: url("${dataUrl(`icons/${name}.svg`)}");`));
        themeCss = `${fontFaces()}\n:root { ${vars.join(" ")} }\n${text("themes/rite.css")}`;
      }
      theme.textContent = enabled ? themeCss : "";
    },
    // Performance mode: no blur, animations or will-change anywhere.
    setPerf(on) {
      perf.textContent = on ? PERF_CSS : "";
      document.documentElement.classList.toggle("rite-perf", Boolean(on));
    },
    setCustomCss(css) {
      custom.textContent = css || "";
    },
    setUserStyles(styles) {
      user.textContent = styles.map(({ name, code }) => `/* ${name.replace(/\*\//g, "")} */\n${code}`).join("\n");
    },
  };
}

module.exports = { createStyles, ICONS };
