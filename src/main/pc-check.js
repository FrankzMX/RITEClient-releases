"use strict";

// The first time the client opens on a modest PC (school PCs with 8 GB and
// Intel graphics, old laptops), it offers once to set it up light: "modo
// rendimiento" and, with weak graphics, 60 FPS. The player says yes or no in
// a card; nothing changes on its own. See features/pc-check.js.

// No real graphics acceleration: Chromium draws with the processor.
const SOFTWARE = /swiftshader|basic render|llvmpipe|softpipe|software/i;
// Intel's older integrated graphics (HD / UHD), not Iris Xe or Arc.
const WEAK_GPU = /intel.*\b(u?hd)\s+graphics/i;

// In Kirka's own menu (perf-stats KIRKA_SETTINGS names): no shadows, no bullet
// marks on the walls and no flying shell cases. The render resolution stays
// as the player has it.
const KIRKA_LIGHT = Object.freeze({ shadows: 0, decals: 0, cases: 0 });

// `hw`: perf-stats.hardwareInfo(). Returns { modest, reasons, suggest, kirka }.
function assessPc(hw = {}) {
  const ram = Number(hw.ramGB) || 0;
  const cores = Number(hw.cores) || 0;
  const gpu = String(hw.gpu || "");
  const software = SOFTWARE.test(gpu);
  const weakGpu = !software && WEAK_GPU.test(gpu) && !/iris|arc/i.test(gpu);
  const reasons = [];
  if (software) reasons.push("sin aceleración gráfica");
  else if (weakGpu) reasons.push("gráficos integrados de Intel");
  if (ram && ram <= 8) reasons.push(`${ram} GB de RAM`);
  if (cores && cores <= 4) reasons.push(`procesador de ${cores} hilos`);
  const modest = software || weakGpu || (ram > 0 && ram <= 4) || (ram > 0 && ram <= 8 && cores > 0 && cores <= 4);
  const suggest = { performanceMode: true };
  if (software || weakGpu) suggest.fpsLimit = "60";
  return { modest, reasons, suggest, kirka: KIRKA_LIGHT };
}

module.exports = { assessPc, KIRKA_LIGHT };
