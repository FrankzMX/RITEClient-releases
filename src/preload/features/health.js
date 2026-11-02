"use strict";

// Colors the player's own health bar (and optionally the crosshair) by how much
// health is left. Only reads the HUD the game already shows the player.

const BAR = ".desktop-game-interface .state-cont .hp-cont .cont-hp .hp-progress";

function healthColor(percent, s) {
  if (percent >= s.healthHighMin) return s.healthHighColor;
  if (percent >= Math.min(s.healthMidMin, s.healthHighMin)) return s.healthMidColor;
  return s.healthLowColor;
}

function readPercent(bar) {
  const inline = /^([\d.]+)%$/.exec(bar.style.width || "");
  if (inline) return Number(inline[1]);
  const total = bar.parentElement?.clientWidth;
  return total ? (bar.offsetWidth / total) * 100 : null;
}

function createHealthColors({ overlay }) {
  let settings = null;
  let timer = null;
  let lastBar = null;
  let lastColor = null;

  const reset = () => {
    lastBar?.style.removeProperty("background");
    lastBar = null;
    lastColor = null;
    overlay.setColorOverride(null);
  };

  const tick = () => {
    // The bar only moves while playing.
    if (!document.pointerLockElement && lastBar) return;
    const bar = document.querySelector(BAR);
    if (bar !== lastBar) reset();
    if (!bar) return;
    lastBar = bar;
    const percent = readPercent(bar);
    if (percent === null) return;
    const color = healthColor(percent, settings);
    if (color === lastColor) return;
    lastColor = color;
    bar.style.setProperty("background", color, "important");
    overlay.setColorOverride(settings.healthCrosshair ? color : null);
  };

  return {
    update(next) {
      settings = next;
      reset();
      if (settings.healthColors && !timer) timer = setInterval(tick, 250);
      if (!settings.healthColors && timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

module.exports = { createHealthColors, healthColor, readPercent };
