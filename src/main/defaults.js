"use strict";

// Every setting the client knows about. The settings store drops unknown keys
// and replaces values whose type does not match the default.
const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 3,

  // Game
  baseUrl: "https://kirka.io/",

  // "Modo rendimiento" (see perf-mode.js): everything light at once.
  performanceMode: false,
  performanceModeSwapper: false, // the mode also turns off the swapper

  // Performance (applied at startup, require a restart)
  // balanced: the monitor's Hz and Chromium's own GPU choices, light on weak
  // PCs. competitive: no FPS cap, no vsync and forced GPU flags.
  performanceProfile: "balanced", // competitive | balanced | quality
  angleBackend: "default", // default | d3d11 | d3d9 | gl | vulkan | metal
  // "auto" = the monitor's refresh rate, like a browser; "0" = no limit. Uncapped
  // FPS keeps the CPU at 100% and slow PCs then lag behind on the game's packets.
  fpsLimit: "auto",
  highPriority: false,

  // Window
  autoFullscreen: true,
  devToolsShortcut: false,

  // Overlay
  fpsCounter: false,
  fpsCounterSize: 13,
  crosshairEnabled: false,
  crosshairStyle: "cross", // cross | dot | circle | cross-dot
  crosshairColor: "#00ff88",
  crosshairSize: 8,
  crosshairThickness: 2,
  crosshairGap: 4,
  crosshairOutline: true,
  crosshairOpacity: 100,

  // Look
  riteTheme: true,
  blockTexture: "kirka", // kirka | rite-dark | custom
  ritePack: "off", // off | weapons | all (RITE colors on weapons, and characters)
  customTextureUrl: "",

  // Health colors (own health bar, optionally the crosshair)
  healthColors: false,
  healthCrosshair: false,
  healthHighColor: "#3ddc84",
  healthMidColor: "#f3d48a",
  healthLowColor: "#ff4d5e",
  healthHighMin: 70,
  healthMidMin: 40,

  // Match stats (K/D, assists, points and HS% next to the kill counter)
  matchStats: true,

  // Customization
  swapperEnabled: true,
  userscriptsEnabled: false,
  enabledScripts: [],
  userstylesEnabled: true,
  enabledStyles: [],
  customCss: "",

  // RITE scrims (live queues, ready check and match room from the RITE bot)
  scrimsEnabled: true,
  scrimsSound: true,
  scrimsPanel: true,
  scrimsPanelInGame: true,
  scrimsQueueAlert: true,
  scrimsAutoResult: true,
  scrimsAutoLobby: true,
  scrimsRoomRegion: "NA",
  scrimsRoomMinutes: "15",
  riteBadges: true,

  // Integrations
  discordRpc: true,
  autoUpdate: true,
  betaUpdates: false,

  // Client menu
  menuKey: "ShiftRight",
  tournamentMode: false,

  // Hub: what opens when the client starts. "hub" shows the game picker;
  // "kirka" or "voxarena" skip it (the hub is still there behind "Volver al hub").
  startGame: "hub", // hub | kirka | voxarena
});

const ENUMS = Object.freeze({
  performanceProfile: ["competitive", "balanced", "quality"],
  angleBackend: ["default", "d3d11", "d3d9", "gl", "vulkan", "metal"],
  crosshairStyle: ["cross", "dot", "circle", "cross-dot"],
  blockTexture: ["kirka", "rite-dark", "custom"],
  ritePack: ["off", "weapons", "all"],
  fpsLimit: ["auto", "0", "60", "120", "144", "165", "240", "360"],
  scrimsRoomRegion: ["NA", "SA", "EU"],
  scrimsRoomMinutes: ["4", "8", "15", "30", "60"],
  startGame: ["hub", "kirka", "voxarena"],
});

const RANGES = Object.freeze({
  crosshairSize: [1, 64],
  crosshairThickness: [1, 16],
  crosshairGap: [0, 64],
  crosshairOpacity: [0, 100],
  healthHighMin: [2, 100],
  healthMidMin: [1, 99],
  fpsCounterSize: [9, 40],
});

// Settings that only take effect after restarting the client.
const RESTART_REQUIRED = Object.freeze([
  "performanceProfile",
  "angleBackend",
  "highPriority",
  "fpsLimit",
  "baseUrl",
]);

// Kirka and its official mirrors. The game window refuses to load anything else
// as its base URL.
const GAME_HOSTS = Object.freeze([
  "kirka.io",
  "snipers.io",
  "ask101math.com",
  "fpsiogame.com",
  "cloudconverts.com",
]);

// Login providers that must open inside the game window for OAuth to work.
const LOGIN_HOSTS = Object.freeze([
  "accounts.google.com",
  "www.facebook.com",
  "m.facebook.com",
  "appleid.apple.com",
  "www.twitch.tv",
  "id.twitch.tv",
  "discord.com",
  "id.vk.com",
  "id.vk.ru",
  "oauth.vk.com",
]);

// VOXARENA (RITE's own game). It loads in its own window and session, with
// none of the Kirka features (swapper, userscripts, theme, scrims overlay).
const VOX_URL = "https://voxarena.io/";
const VOX_HOSTS = Object.freeze(["voxarena.io", "voxarena.up.railway.app"]);

module.exports = {
  DEFAULT_SETTINGS,
  VOX_URL,
  VOX_HOSTS,
  ENUMS,
  RANGES,
  RESTART_REQUIRED,
  GAME_HOSTS,
  LOGIN_HOSTS,
};
