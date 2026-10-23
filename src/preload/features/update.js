"use strict";

// The update card: while a new version downloads it shows the progress, and
// once it's ready it offers to restart. It hides while aiming in a match and
// comes back in the lobby or with Esc.

const { dataUrl } = require("./assets");

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .card { position: fixed; left: 18px; bottom: 18px; z-index: 2147483641; width: 300px; display: flex; gap: 12px; padding: 12px 14px;
    background: rgba(16, 14, 22, .97); border: 1px solid #3a3324; border-top: 2px solid #e0b34a; border-radius: 2px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, .45); color: #f4efe4; font: 13px/1.4 "Outfit", ui-sans-serif, system-ui, sans-serif;
    opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s; }
  .card.show { opacity: 1; transform: none; }
  .card[hidden] { display: none; }
  img { width: 38px; height: 38px; flex: none; }
  .main { flex: 1; min-width: 0; }
  .kicker { font: 500 10.5px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .22em; text-transform: uppercase; color: #e0b34a; }
  .title { margin-top: 3px; font: 500 15px/1.25 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .04em; color: #f4efe4; }
  .sub { margin-top: 2px; color: #a39886; font-size: 12px; }
  .bar { margin-top: 8px; height: 4px; background: rgba(255, 255, 255, .08); border-radius: 2px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg, #8a6420, #e0b34a 60%, #f3d48a); transition: width .3s; }
  .btns { display: flex; gap: 6px; margin-top: 10px; }
  button { all: unset; cursor: pointer; flex: 1; text-align: center; padding: 6px 9px; border: 1px solid #e0b34a; border-radius: 2px; color: #f3d48a;
    font: 500 11px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .14em; text-transform: uppercase; }
  button:hover { background: #e0b34a; color: #07060b; }
  button.main { background: linear-gradient(135deg, #f3d48a, #e0b34a 55%, #8a6420); border-color: transparent; color: #07060b; }
`;

function createUpdateCard({ api }) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style><div class="card" hidden></div>`;
  document.documentElement.append(host);
  const card = root.querySelector(".card");
  for (const type of ["mousedown", "mouseup", "click", "keydown"]) card.addEventListener(type, (e) => e.stopPropagation());

  let state = { status: "idle" };
  let dismissed = null; // the version the player put off until next time

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter(Boolean));
    return node;
  };
  const logo = el("img", { src: dataUrl("logo-small.png"), alt: "" });

  function draw() {
    const aiming = Boolean(document.pointerLockElement);
    const visible = (state.status === "downloading" || state.status === "ready") && dismissed !== state.version && !aiming;
    if (!visible) {
      card.classList.remove("show");
      card.hidden = true;
      return;
    }
    const ready = state.status === "ready";
    card.replaceChildren(
      logo,
      el(
        "div",
        { className: "main" },
        el("div", { className: "kicker" }, "Actualización"),
        el("div", { className: "title" }, ready ? `RITE Client ${state.version} está listo` : `Descargando RITE Client ${state.version || ""}`),
        el("div", { className: "sub" }, ready ? "Se instala al reiniciar, o al cerrar el cliente." : `${state.percent || 0}% · puedes seguir jugando`),
        ready ? null : el("div", { className: "bar" }, el("i", { style: `width: ${state.percent || 0}%` })),
        ready
          ? el(
              "div",
              { className: "btns" },
              el("button", { className: "main", onclick: () => api.installUpdate() }, "Reiniciar ahora"),
              el("button", { onclick: () => ((dismissed = state.version), draw()) }, "Más tarde")
            )
          : null
      )
    );
    if (card.hidden) {
      card.hidden = false;
      requestAnimationFrame(() => card.classList.add("show"));
    }
  }

  document.addEventListener("pointerlockchange", draw);

  return {
    apply(next) {
      state = next || { status: "idle" };
      draw();
    },
  };
}

module.exports = { createUpdateCard };
