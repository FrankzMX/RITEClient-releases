"use strict";

// "Modo rendimiento": one switch for weak PCs. The player's own choices stay
// saved as they are; this only changes what the client actually runs while
// the mode is on, so turning it off brings everything back.
//   - never the competitive profile (forced GPU flags), and always an FPS cap
//   - Chromium may slow the game down when hidden, no high process priority
//   - no theme recolor, badges, health colours, link bar or RITE pack
//   - the swapper too, if the player asked for that
function effectiveSettings(s) {
  if (!s || !s.performanceMode) return s;
  return {
    ...s,
    performanceProfile: s.performanceProfile === "competitive" ? "balanced" : s.performanceProfile,
    fpsLimit: s.fpsLimit === "0" ? "auto" : s.fpsLimit,
    highPriority: false,
    healthColors: false,
    healthCrosshair: false,
    riteBadges: false,
    ritePack: "off",
    swapperEnabled: s.performanceModeSwapper ? false : s.swapperEnabled,
  };
}

// Without blur, animations or will-change, on solid backgrounds. Shadow roots
// (the scrims panel) get their own copy.
const PERF_CSS = `
  html.rite-perf *, html.rite-perf *::before, html.rite-perf *::after {
    backdrop-filter: none !important; animation: none !important; transition: none !important; will-change: auto !important;
  }
  html.rite-perf { --rite-panel-glass: #16131c; --rite-void-glass: #07060b; }
`;

module.exports = { effectiveSettings, PERF_CSS };
