"use strict";

const { SECTIONS } = require("./menu-schema");
const { dataUrl } = require("./assets");
const { label: scrimLabel } = require("./scrims");
const credits = require("../../main/credits");

const LOGO = dataUrl("logo-small.png");

const CSS = `
  :host { all: initial; }
  .backdrop, select, textarea, input { color-scheme: dark; }
  .backdrop {
    --void: #07060b; --ink: #100e16; --panel: #16131c; --gold: #e0b34a; --gold-2: #f3d48a;
    --cream: #f4efe4; --mist: #a39886; --line: #3a3324;
    --sans: "Outfit", ui-sans-serif, system-ui, sans-serif; --display: "Oswald", "Arial Narrow", sans-serif;
    position: fixed; inset: 0; z-index: 2147483647; background: rgba(7, 6, 11, .9);
    display: flex; align-items: center; justify-content: center; font: 15px/1.5 var(--sans); color: var(--cream);
  }
  .backdrop[hidden] { display: none; }
  .panel { position: relative; width: min(900px, 94vw); height: min(620px, 90vh); display: grid; grid-template-columns: 200px 1fr; background: linear-gradient(160deg, var(--panel), var(--ink) 60%); border: 1px solid var(--line); border-radius: 2px; overflow: hidden; box-shadow: 0 30px 80px #000c, 0 0 0 1px rgba(224, 179, 74, .08); }
  .panel::before { content: ""; position: absolute; inset: 0 0 auto; height: 1px; background: linear-gradient(90deg, transparent, var(--gold), transparent); opacity: .7; }
  nav { background: rgba(7, 6, 11, .65); border-right: 1px solid var(--line); padding: 16px 0; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 0 16px 18px; margin-bottom: 8px; border-bottom: 1px solid var(--line); }
  .brand img { width: 40px; height: 40px; }
  .brand b { display: block; font: 500 18px/1 var(--display); letter-spacing: .42em; color: var(--cream); }
  .brand small { display: block; margin-top: 5px; color: var(--mist); font-size: 10px; letter-spacing: .28em; text-transform: uppercase; }
  nav button { all: unset; cursor: pointer; padding: 10px 16px; font: 400 13px/1.2 var(--display); letter-spacing: .14em; text-transform: uppercase; color: var(--mist); box-shadow: inset 2px 0 0 transparent; transition: color .15s, box-shadow .15s, background .15s; }
  nav button:hover { color: var(--cream); }
  nav button[aria-current="true"] { color: var(--gold-2); box-shadow: inset 2px 0 0 var(--gold); background: linear-gradient(90deg, rgba(224, 179, 74, .1), transparent); }
  main { overflow-y: auto; padding: 22px 26px; }
  main::-webkit-scrollbar { width: 6px; }
  main::-webkit-scrollbar-thumb { background: var(--line); }
  h2 { margin: 0 0 6px; font: 500 22px/1 var(--display); letter-spacing: .08em; text-transform: uppercase; }
  h2::after { content: ""; display: block; width: 36px; height: 2px; margin-top: 10px; background: var(--gold); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid rgba(58, 51, 36, .6); }
  .row label { flex: 1; }
  .hint { display: block; color: var(--mist); font-size: 12.5px; }
  .restart { color: var(--gold); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; margin-left: 8px; }
  select, input[type="text"], textarea { background: rgba(7, 6, 11, .6); color: inherit; border: 1px solid var(--line); border-radius: 2px; padding: 7px 10px; font: inherit; font-size: 14px; outline: none; }
  select:focus, input[type="text"]:focus, textarea:focus { border-color: var(--gold); }
  select { max-width: 330px; }
  input[type="text"] { width: 100%; box-sizing: border-box; }
  textarea { width: 100%; min-height: 140px; box-sizing: border-box; font: 12px/1.4 ui-monospace, monospace; resize: vertical; }
  input[type="range"] { width: 180px; accent-color: var(--gold); }
  input[type="color"] { width: 44px; height: 28px; border: 1px solid var(--line); border-radius: 2px; background: none; padding: 0; }
  .switch { position: relative; width: 40px; height: 20px; flex: none; }
  .switch input { opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; position: absolute; z-index: 1; }
  .switch span { position: absolute; inset: 0; background: rgba(7, 6, 11, .8); border: 1px solid var(--line); transition: background .15s, border-color .15s; }
  .switch span::after { content: ""; position: absolute; left: 3px; top: 3px; width: 12px; height: 12px; background: var(--mist); transition: transform .2s cubic-bezier(.19, 1, .22, 1), background .15s; }
  .switch input:checked + span { background: rgba(224, 179, 74, .14); border-color: var(--gold); }
  .switch input:checked + span::after { transform: translateX(20px); background: var(--gold-2); }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 0; }
  button.btn { all: unset; cursor: pointer; padding: 8px 14px; border: 1px solid var(--gold); border-radius: 2px; color: var(--gold-2); font: 400 12px/1.2 var(--display); letter-spacing: .14em; text-transform: uppercase; transition: background .15s, color .15s; }
  button.btn:hover { background: var(--gold); color: var(--void); }
  button.btn.danger { border-color: #b4543c; color: #f0a48f; }
  button.btn.danger:hover { background: #b4543c; color: var(--cream); }
  .value { min-width: 30px; text-align: right; color: var(--gold-2); font: 15px var(--display); }
  .list h3, .credits h3 { font: 400 12px/1 var(--display); color: var(--gold-2); letter-spacing: .28em; text-transform: uppercase; margin: 18px 0 4px; }
  .empty { color: var(--mist); font-size: 13px; padding: 6px 0; }
  .credit { padding: 12px 0; border-bottom: 1px solid rgba(58, 51, 36, .6); }
  .credit a { color: var(--gold-2); cursor: pointer; text-decoration: none; }
  .credit a:hover { text-decoration: underline; }
  .keys { color: var(--mist); font-size: 13px; margin-top: 18px; line-height: 2; }
  kbd { background: rgba(7, 6, 11, .7); border: 1px solid var(--line); border-radius: 2px; padding: 1px 6px; font: 12px ui-monospace, monospace; color: var(--cream); }
  p { color: var(--cream); }
  .code { font: 500 34px/1.2 "Oswald", "Arial Narrow", sans-serif; letter-spacing: .3em; color: var(--gold-2); padding: 10px 16px; border: 1px dashed var(--gold); display: inline-block; margin: 6px 0 10px; user-select: all; }
  .scrim-list { margin: 8px 0; padding: 0; list-style: none; }
  .scrim-list li { padding: 6px 10px; border-left: 2px solid var(--gold); background: rgba(7, 6, 11, .45); margin: 4px 0; font-size: 13px; }
  .scrim-list small { color: var(--mist); }
`;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "className") el.className = value;
    else if (value !== undefined && value !== false) el.setAttribute(key, value === true ? "" : value);
  }
  setChildren(el, children, false);
  return el;
}

// Replaces the children of `el`. Accepts nested arrays, strings and nodes.
function setChildren(el, children, clear = true) {
  if (clear) el.replaceChildren();
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function createMenu({ api, settings: initial, toast, scrims, scriptsOptions = null }) {
  let settings = initial;
  let current = SECTIONS[0].id;
  let capturingKey = false;

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.append(h("style", {}, CSS));
  const nav = h("nav");
  const main = h("main");
  const backdrop = h("div", { className: "backdrop", hidden: true }, h("div", { className: "panel" }, nav, main));
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) toggle(false);
  });
  root.append(backdrop);
  document.documentElement.append(host);
  // Lives in the page (scripts look it up by id) and shows inside the menu.
  if (scriptsOptions) {
    scriptsOptions.slot = "scripts";
    scriptsOptions.style.cssText = "display:block;color:#f4efe4;font:13px/1.5 Outfit, ui-sans-serif, system-ui, sans-serif;";
    host.append(scriptsOptions);
  }

  // Keep keystrokes typed in the menu away from the game.
  for (const type of ["keydown", "keyup", "keypress"]) {
    backdrop.addEventListener(type, (e) => e.stopPropagation());
  }

  async function save(key, value, restart, reload) {
    const result = await api.setSetting(key, value);
    if (!result.ok) {
      toast.show("Valor no válido", "error");
      render();
      return;
    }
    if (result.restart || restart) toast.show("Se aplicará al reiniciar el cliente");
    else if (reload) toast.show("Se aplicará al recargar (F5)");
  }

  const actions = {
    "open-swapper": () => api.openFolder("swapper"),
    "open-scripts": () => api.openFolder("scripts"),
    "open-styles": () => api.openFolder("styles"),
    "open-screenshots": () => api.openFolder("screenshots"),
    "open-maps": () => api.openFolder("maps"),
    "reload-swapper": async () => toast.show(`Swapper: ${await api.reloadSwapper()} archivo(s) activos`),
    export: async () => (await api.exportSettings()) && toast.show("Ajustes exportados"),
    import: async () => {
      try {
        if (await api.importSettings()) toast.show("Ajustes importados");
      } catch {
        toast.show("El archivo no es válido", "error");
      }
    },
    restart: () => api.restart(),
    hub: () => api.hub(),
    reset: () => {
      if (confirm("¿Restablecer todos los ajustes de RITE Client? El cliente se reiniciará.")) api.resetSettings();
    },
  };

  function label(item) {
    return h(
      "label",
      {},
      item.label,
      item.restart ? h("span", { className: "restart" }, "requiere reinicio") : null,
      item.reload ? h("span", { className: "restart" }, "recarga con F5") : null,
      item.hint ? h("span", { className: "hint" }, item.hint) : null
    );
  }

  const renderers = {
    toggle: (item) =>
      h(
        "div",
        { className: "row" },
        label(item),
        h(
          "div",
          { className: "switch" },
          h("input", {
            type: "checkbox",
            checked: settings[item.key],
            onchange: (e) => save(item.key, e.target.checked, item.restart),
          }),
          h("span")
        )
      ),
    select: (item) => {
      const select = h(
        "select",
        { onchange: (e) => save(item.key, e.target.value, item.restart, item.reload) },
        item.options.map(([value, text]) => h("option", { value, selected: settings[item.key] === value }, text))
      );
      return h("div", { className: "row" }, label(item), select);
    },
    range: (item) => {
      const value = h("span", { className: "value" }, settings[item.key]);
      const input = h("input", {
        type: "range",
        min: item.min,
        max: item.max,
        value: settings[item.key],
        oninput: (e) => (value.textContent = e.target.value),
        onchange: (e) => save(item.key, Number(e.target.value)),
      });
      return h("div", { className: "row" }, label(item), input, value);
    },
    color: (item) =>
      h(
        "div",
        { className: "row" },
        label(item),
        h("input", { type: "color", value: settings[item.key], onchange: (e) => save(item.key, e.target.value) })
      ),
    text: (item) => {
      const input = h("input", { type: "text", spellcheck: "false", placeholder: item.placeholder });
      input.value = settings[item.key];
      const apply = h("button", { className: "btn", onclick: () => save(item.key, input.value.trim(), item.restart, item.reload) }, "Aplicar");
      return h("div", { className: "row" }, h("div", { style: "flex: 1; display: grid; gap: 8px" }, label(item), input), apply);
    },
    textarea: (item) => {
      const area = h("textarea", { spellcheck: "false" });
      area.value = settings[item.key];
      const apply = h("button", { className: "btn", onclick: () => save(item.key, area.value) }, "Aplicar");
      return h("div", {}, h("div", { className: "row" }, label(item), apply), area);
    },
    keybind: (item) => {
      const button = h("button", { className: "btn" }, settings[item.key]);
      button.addEventListener("click", () => {
        capturingKey = true;
        button.textContent = "Pulsa una tecla…";
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener("keydown", onKey, true);
          capturingKey = false;
          if (e.code !== "Escape") save(item.key, e.code);
          button.textContent = e.code === "Escape" ? settings[item.key] : e.code;
        };
        window.addEventListener("keydown", onKey, true);
      });
      return h("div", { className: "row" }, label(item), button);
    },
    buttons: (item) =>
      h(
        "div",
        { className: "buttons" },
        item.buttons.map(([text, action]) =>
          h("button", { className: `btn ${action === "reset" ? "danger" : ""}`, onclick: actions[action] }, text)
        )
      ),
    note: (item) => h("p", { className: "hint" }, item.text),
    customizations: () => {
      const box = h("div", { className: "list" }, h("div", { className: "empty" }, "Cargando…"));
      api.listCustomizations().then(({ scripts, styles }) => {
        const toggleIn = (key, name, on) => {
          const list = new Set(settings[key]);
          if (on) list.add(name);
          else list.delete(name);
          save(key, [...list], true);
        };
        const rows = (items, key) =>
          items.length
            ? items.map((item) =>
                h(
                  "div",
                  { className: "row" },
                  h(
                    "label",
                    {},
                    item.name,
                    item.description || item.author
                      ? h("span", { className: "hint" }, [item.description, item.author && `por ${item.author}`].filter(Boolean).join(" · "))
                      : null
                  ),
                  h(
                    "div",
                    { className: "switch" },
                    h("input", { type: "checkbox", checked: item.enabled, onchange: (e) => toggleIn(key, item.file, e.target.checked) }),
                    h("span")
                  )
                )
              )
            : h("div", { className: "empty" }, "No hay archivos en la carpeta.");
        setChildren(box, [
          h("h3", {}, "Scripts"),
          rows(scripts, "enabledScripts"),
          h("h3", {}, "Estilos"),
          rows(styles, "enabledStyles"),
          scriptsOptions?.childElementCount ? [h("h3", {}, "Opciones de los scripts"), h("slot", { name: "scripts" })] : null,
        ]);
      });
      return box;
    },
    scrims: () => {
      const s = scrims?.state || { status: "off" };
      const pair = async () => {
        try {
          await api.scrimsPair();
        } catch {
          toast.show("No se pudo conectar con RITE WEB", "error");
        }
        render();
      };
      const discord = () => api.openLink(credits.community.find((c) => /discord/i.test(c.url)).url);
      const box = (...children) => h("div", { className: "credits" }, ...children);
      if (!settings.scrimsEnabled || s.status === "off") return box(h("p", {}, "Activa Scrims RITE para ver las colas y tu partida."));
      if (s.status === "unlinked")
        return box(
          h("p", {}, "Liga el cliente con tu Discord para ver las colas de RITE en vivo, confirmar ¡Listo! desde aquí y entrar a la sala de tu partida con un clic."),
          h("div", { className: "buttons" }, h("button", { className: "btn", onclick: pair }, "Vincular con Discord"))
        );
      if (!s.linked) {
        const mins = s.expiresAt ? Math.max(1, Math.round((new Date(s.expiresAt).getTime() - Date.now()) / 60000)) : null;
        return box(
          h("p", {}, "En el Discord de RITE escribe este comando:"),
          h("div", { className: "code" }, s.code || "······"),
          h("p", {}, h("kbd", {}, `/cliente vincular codigo:${s.code || ""}`), mins ? ` · vence en ${mins} min` : ""),
          h(
            "div",
            { className: "buttons" },
            h("button", { className: "btn", onclick: discord }, "Abrir Discord de RITE"),
            h("button", { className: "btn danger", onclick: async () => (await api.scrimsUnlink(), render()) }, "Cancelar")
          )
        );
      }
      const m = s.me?.match;
      return box(
        h("p", {}, s.player ? `Ligado como ${s.player.name}.` : "Ligado. Regístrate desde el panel de colas (o con /registro en Discord) para entrar a las colas."),
        s.offline ? h("p", { className: "hint" }, "Sin conexión con RITE WEB, reintentando…") : null,
        m ? h("h3", {}, `Tu partida #${m.id}`) : null,
        m ? h("ul", { className: "scrim-list" }, h("li", {}, `${scrimLabel(m.game, m.mode)}${m.map ? ` · ${m.map}` : ""} · `, h("small", {}, m.roomUrl ? "sala lista" : "esperando la sala"))) : null,
        h("h3", {}, "Colas en vivo"),
        s.queues?.length
          ? h("ul", { className: "scrim-list" }, s.queues.map((q) => h("li", {}, `${scrimLabel(q.game, q.mode)} · ${Math.min(q.players.length, q.need)}/${q.need} `, h("small", {}, q.players.join(", ")))))
          : h("p", { className: "hint" }, "No hay nadie en cola ahora. Entra desde #rite-cola en Discord."),
        h(
          "div",
          { className: "buttons" },
          h("button", { className: "btn", onclick: discord }, "Abrir Discord de RITE"),
          h("button", { className: "btn danger", onclick: async () => (await api.scrimsUnlink(), render()) }, "Desvincular")
        )
      );
    },
    about: () => {
      const box = h("div", { className: "credits" }, h("div", { className: "empty" }, "Cargando…"));
      api.getInfo().then(({ version, credits }) => {
        setChildren(box, [
          h("p", {}, `RITE Client v${version}. Cliente de Kirka.io para la comunidad competitiva de RITE. Software libre bajo licencia GPL-3.0.`),
          h("h3", {}, "Comunidad RITE"),
          h("div", { className: "buttons" }, credits.community.map((c) => h("button", { className: "btn", onclick: () => api.openLink(c.url) }, c.name))),
          h("h3", {}, "Créditos"),
          credits.projects.map((p) =>
            h(
              "div",
              { className: "credit" },
              h("a", { onclick: () => api.openLink(p.url) }, p.name),
              ` · ${p.author}`,
              h("span", { className: "hint" }, p.note)
            )
          ),
          h(
            "div",
            { className: "keys" },
            h("kbd", {}, "F2"), " captura · ",
            h("kbd", {}, "F4"), " inicio · ",
            h("kbd", {}, "F5"), " recargar · ",
            h("kbd", {}, "F6"), " abrir enlace del portapapeles · ",
            h("kbd", {}, "F7"), " copiar enlace · ",
            h("kbd", {}, "F11"), " pantalla completa"
          ),
        ]);
      });
      return box;
    },
  };

  function render() {
    setChildren(nav, [
      h("div", { className: "brand" }, h("img", { src: LOGO, alt: "" }), h("div", {}, h("b", {}, "RITE"), h("small", {}, "Client"))),
      SECTIONS.map((section) =>
        h(
          "button",
          {
            "aria-current": section.id === current ? "true" : "false",
            onclick: () => {
              current = section.id;
              render();
            },
          },
          section.title
        )
      ),
    ]);
    const section = SECTIONS.find((s) => s.id === current);
    setChildren(main, [h("h2", {}, section.title), section.items.map((item) => renderers[item.type](item))]);
  }

  function toggle(open = backdrop.hidden) {
    if (open) {
      render();
      document.exitPointerLock?.();
    }
    backdrop.hidden = !open;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (capturingKey) return;
      if (e.code === settings.menuKey) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      } else if (e.code === "Escape" && !backdrop.hidden) {
        toggle(false);
      }
    },
    true
  );

  scrims?.onChange(() => {
    if (!backdrop.hidden && current === "scrims") render();
  });

  return {
    update(next) {
      settings = next;
      if (!backdrop.hidden && !root.activeElement) render();
    },
  };
}

module.exports = { createMenu };
