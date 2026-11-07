"use strict";

// The first time the client opens on a modest PC (src/main/pc-check.js): a
// card in Kirka's menu offers the light setup once, the client's (modo
// rendimiento, FPS limit) and Kirka's own (shadows, bullet marks, shell
// cases). Nothing changes without a yes.

const { KIRKA_SETTINGS, kirkaStorageKey } = require("../../main/perf-stats");
const { kirkaSettings } = require("./perf");

const DELAY_MS = 4000;
const KIRKA_NAMES = { shadows: "las sombras", decals: "las marcas de bala", cases: "los casquillos" };
const joinY = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}` : items[0] || "");

function createPcCheck({ ipc, toast }) {
  const inMatch = () => /^\/games\//.test(location.pathname);

  function show({ reasons, suggest, kirka = {} }) {
    if (document.getElementById("rite-pc-check")) return;
    // Only Kirka's settings that are not already like that.
    const current = kirkaSettings();
    const kirkaChanges = Object.entries(kirka).filter(([name, value]) => KIRKA_SETTINGS[name] && Number(current[name] ?? 1) !== value);
    const host = document.createElement("div");
    host.id = "rite-pc-check";
    const root = host.attachShadow({ mode: "closed" });
    const what = [
      "el modo rendimiento",
      suggest.fpsLimit ? `el límite de ${suggest.fpsLimit} FPS` : "",
      kirkaChanges.length ? `quitar en Kirka ${joinY(kirkaChanges.map(([name]) => KIRKA_NAMES[name] || name))}` : "",
    ].filter(Boolean);
    const list = joinY(what);
    root.innerHTML = `<style>
      .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(400px, 92vw); box-sizing: border-box; padding: 14px 16px; background: #14121a; color: #ece6d6; border: 1px solid #c8a24a; border-radius: 3px; box-shadow: 0 12px 40px #000a; font: 13.5px/1.45 system-ui, sans-serif; }
      b { display: block; color: #e0b34a; letter-spacing: .08em; text-transform: uppercase; font-size: 12.5px; margin-bottom: 6px; }
      p { margin: 0 0 8px; }
      small { display: block; opacity: .7; font-size: 12px; margin-bottom: 10px; }
      .row { display: flex; gap: 8px; justify-content: flex-end; }
      button { cursor: pointer; padding: 7px 12px; border: 1px solid #c8a24a; background: transparent; color: #f3d48a; border-radius: 2px; font: inherit; font-size: 12.5px; }
      button.yes { background: #c8a24a; color: #16121c; font-weight: 700; }
    </style><div class="card"><b>Ajustar a tu PC</b><p></p><small>Se cambia cuando quieras en Rendimiento (y en los ajustes de Kirka). Tus demás ajustes quedan como están.</small><div class="row"><button class="no">No, gracias</button><button class="yes">Sí, ajustar</button></div></div>`;
    root.querySelector("p").textContent = `Tu PC (${reasons.join(", ")}) puede ir más fluida con ${list}. ¿Lo activamos?`;
    const answer = (yes) => {
      host.remove();
      if (yes) {
        for (const [name, value] of kirkaChanges) {
          try {
            localStorage.setItem(kirkaStorageKey(KIRKA_SETTINGS[name]), JSON.stringify(value));
          } catch {}
        }
      }
      ipc
        .invoke("pc:answer", yes)
        .then((r) => {
          if (!r) return;
          const later = [r.restart ? "el límite de FPS al reiniciar el cliente" : "", kirkaChanges.length ? "lo de Kirka al recargar (F5)" : ""].filter(Boolean);
          toast?.show(later.length ? `Listo. Se aplica ${later.join(", y ")}.` : "Listo, modo rendimiento activado.");
        })
        .catch(() => {});
    };
    root.querySelector(".yes").addEventListener("click", () => answer(true));
    root.querySelector(".no").addEventListener("click", () => answer(false));
    document.documentElement.append(host);
  }

  // Once per load, in the menu (never over a match).
  setTimeout(function check() {
    if (inMatch() || document.pointerLockElement) return setTimeout(check, 10000);
    ipc
      .invoke("pc:check")
      .then((r) => r && show(r))
      .catch(() => {});
  }, DELAY_MS);
}

module.exports = { createPcCheck };
