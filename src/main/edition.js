"use strict";

// RITE Light: the same client with only what a competitive player needs while
// playing. Uncapped FPS, the swapper, block textures, the crosshair, the FPS
// counter, the shortcuts, userscripts and profiles stay. The hub,
// Discord, clips, scrims, the trade helper, match stats, badges, the RITE
// theme, RITE modules and the replay player are not even started, so no
// observer, timer or extra window runs during a match.
//
// It is a build of this same code: the Light installer sets "rite.edition":
// "light" in its package.json (electron-builder.light.yml), and the
// --rite-light switch starts any copy as Light (for the test .bat files).
//
// @author FRANKZ

const LIGHT_ARG = "--rite-light";
const NAME = "RITE Light";

// RITE Light's app id: the installer's (electron-builder.light.js) and the
// taskbar's, also when it's opened from RITE Client's hub.
const LIGHT_APP_ID = "com.rite.light";

function isLight(argv = process.argv, pkg = readPackage()) {
  return pkg?.rite?.edition === "light" || (Array.isArray(argv) && argv.includes(LIGHT_ARG));
}

// Installed as RITE Light (its own installer), not opened from RITE Client's
// hub with --rite-light: only then does Light update itself (light.yml).
function isInstalledLight(pkg = readPackage()) {
  return pkg?.rite?.edition === "light";
}

// The arguments to start RITE Light from RITE Client's own program: the same
// .exe with --rite-light (in development, Electron also needs the app's folder).
function lightLaunchArgs({ isPackaged, appPath }) {
  return isPackaged ? [LIGHT_ARG] : [appPath, LIGHT_ARG];
}

function readPackage() {
  try {
    return require("../../package.json");
  } catch {
    return null;
  }
}

// What a fresh Light install starts with: balanced at the monitor's Hz (with
// vsync), and the counter on. Uncapped is one click away, but at 2000 FPS the
// game felt worse than at 240 with vsync (Frankz, 8-nov-2026): the page
// spends every turn drawing frames the monitor never shows.
const LIGHT_DEFAULTS = Object.freeze({
  performanceProfile: "balanced",
  fpsLimit: "auto",
  fpsCounter: true,
  perfStats: false,
});

// Always off in Light, whatever the saved or imported settings say: the parts
// that are not there. The menu does not show them either.
const LIGHT_FORCED = Object.freeze({
  riteTheme: false,
  texturePanel: false,
  ritePack: "off",
  riteBadges: false,
  matchStats: false,
  healthColors: false,
  healthCrosshair: false,
  remoteModules: false,
  scrimsEnabled: false,
  tradeHelper: false,
  tradeEar: false,
  discordRpc: false,
  clipsEnabled: false,
  clipsAuto: false,
  startGame: "kirka",
});

// Menu sections and items Light leaves out (src/preload/features/menu-schema.js).
const LIGHT_SECTIONS = Object.freeze(["performance", "look", "crosshair", "customization", "client", "about"]);
const LIGHT_HIDDEN_ACTIONS = Object.freeze(["hub", "open-clips", "clips-viewer", "open-maps", "open-editor-backups"]);

// First in «Cliente»: brings the crosshair, textures, swapper, scripts... from
// RITE Client (src/main/light-import.js).
const IMPORT_ITEMS = Object.freeze([
  { type: "buttons", buttons: [["Traer ajustes de RITE Client", "import-full"]] },
  { type: "note", text: "Crosshair, texturas, swapper, scripts y estilos, contador de FPS, tecla del menú y perfiles (no el perfil de GPU ni el límite de FPS). La primera vez que abres Light ya se traen solos, junto con tus ajustes y tu sesión de Kirka." },
]);

function lightSections(sections) {
  const keep = (item) => {
    if (item.key && item.key in LIGHT_FORCED) return null;
    if (item.type === "buttons") {
      const buttons = item.buttons.filter(([, action]) => !LIGHT_HIDDEN_ACTIONS.includes(action));
      return buttons.length ? { ...item, buttons } : null;
    }
    if (item.items) {
      const items = item.items.map(keep).filter(Boolean);
      return items.length ? { ...item, items } : null;
    }
    return item;
  };
  return sections
    .filter((s) => LIGHT_SECTIONS.includes(s.id))
    .map((s) => ({ ...s, items: [...(s.id === "client" ? IMPORT_ITEMS : []), ...s.items.map(keep).filter(Boolean)] }));
}

module.exports = { isLight, isInstalledLight, lightLaunchArgs, LIGHT_APP_ID, LIGHT_ARG, NAME, LIGHT_DEFAULTS, LIGHT_FORCED, lightSections };
