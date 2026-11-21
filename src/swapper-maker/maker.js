"use strict";

// «Crear swapper» (src/main/swapper-maker.js): pick a swapper, change sounds and
// skins slot by slot, hear Kirka's next to yours, and save.
(function () {
  const api = window.riteMaker;
  const A = window.riteAudio;
  const tr = (text, values) => window.riteI18n.tr(text, values);
  const $ = (id) => document.getElementById(id);

  const GROUPS = [
    ["armas", "Armas"],
    ["combate", "Combate"],
    ["pasos", "Pasos"],
    ["otros", "Menú y otros"],
  ];

  let catalog = null;
  let current = null; // swapper being edited
  let activo = "";
  let present = {}; // slotId → origin of the file already saved
  let pending = {}; // slotId → { bytes, origen, volume } | null (remove)
  let tab = "armas";
  const originals = new Map(); // slotId → { bytes, peak }

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "className") el.className = v;
      else if (v !== undefined && v !== false && v !== null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }

  function status(text, error = false) {
    $("status").textContent = text ? tr(text) : "";
    $("status").className = error ? "error" : "";
  }

  const dirty = () => Object.keys(pending).length > 0;

  function refreshButtons() {
    $("save").disabled = !current || !dirty();
    $("use").disabled = !current || current === activo;
    $("use").textContent = tr(current && current === activo ? "Activo en el juego" : "Usar en el juego");
  }

  async function original(id) {
    if (!originals.has(id)) {
      const bytes = await api.original(id);
      if (!bytes) throw new Error("no original");
      const slot = catalog.slots.find((s) => s.id === id);
      const peak = slot.kind === "audio" ? A.peak(await A.decode(bytes)) : 0;
      originals.set(id, { bytes, peak });
    }
    return originals.get(id);
  }

  async function loadList() {
    const { swappers, activo: a } = await api.list();
    activo = a;
    $("list").replaceChildren(
      ...swappers.map((name) =>
        h("li", { className: name === current ? "on" : "", onclick: () => choose(name) }, h("span", {}, name), name === activo ? h("small", {}, tr("activo")) : null)
      )
    );
    if (!swappers.length) $("list").append(h("li", { className: "empty" }, tr("Aún no tienes swappers")));
    refreshButtons();
  }

  async function choose(name) {
    if (dirty() && !confirm(tr("Tienes cambios sin guardar. ¿Descartarlos?"))) return;
    pending = {};
    status("Abriendo…");
    const info = await api.open(name);
    if (!info) return status("No encontré ese swapper", true);
    current = name;
    present = info.present;
    $("title").textContent = name;
    status(info.moved ? tr("Kirka cambió sus archivos: acomodé {n} a los nombres nuevos.", { n: info.moved }) : "");
    await loadList();
    render();
  }

  async function bring(slot, getter) {
    try {
      const got = await getter();
      if (!got) return;
      if (got.error) return status(got.error, true);
      if (slot.kind === "audio") await A.decode(got.bytes); // check it is a sound before keeping it
      else await createImageBitmap(new Blob([got.bytes]));
      pending[slot.id] = { bytes: got.bytes, origen: got.origen || got.name, volume: 1 };
      status("");
      render();
    } catch {
      status(slot.kind === "audio" ? "Ese archivo no es un sonido que se pueda leer" : "Esa imagen no se pudo leer", true);
    }
  }

  function slotRow(slot) {
    const p = pending[slot.id];
    const has = present[slot.id];
    let state = h("span", { className: "state" }, tr("De Kirka"));
    if (p === null) state = h("span", { className: "state new" }, tr("Se quitará al guardar"));
    else if (p) state = h("span", { className: "state new", title: p.origen }, `${tr("Nuevo")}: ${p.origen}`);
    else if (has) state = h("span", { className: "state has", title: has }, `${tr("Tuyo")}: ${has}`);

    const tools = [];
    if (slot.kind === "audio") {
      tools.push(
        h("button", { className: "small", title: tr("Oír el de Kirka"), onclick: async () => A.play((await original(slot.id)).bytes).catch(() => status("No se pudo traer el sonido de Kirka", true)) }, "▶ Kirka")
      );
      if (p) {
        const vol = h("input", { type: "range", min: 0.2, max: 2, step: 0.05, value: p.volume, title: tr("Volumen"), oninput: (e) => (p.volume = Number(e.target.value)) });
        tools.push(
          h(
            "button",
            {
              className: "small",
              onclick: async () => {
                const o = await original(slot.id).catch(() => ({ peak: 0 }));
                const ready = await A.prepareSound(p.bytes, { originalPeak: o.peak, match: $("match").checked, volume: p.volume });
                A.play(ready.bytes);
              },
            },
            "▶ " + tr("Nuevo")
          ),
          vol
        );
      } else if (has) tools.push(h("button", { className: "small", onclick: async () => A.play(await api.read(current, slot.id)) }, "▶ " + tr("Tuyo")));
    } else {
      const bytes = p ? p.bytes : null;
      if (bytes) tools.push(h("img", { src: URL.createObjectURL(new Blob([bytes])), alt: "" }));
    }
    const url = h("input", { className: "url", placeholder: slot.kind === "audio" ? "URL (myinstants, .mp3…)" : "URL (.png, .webp)" });
    tools.push(
      url,
      h("button", { className: "small", onclick: () => url.value.trim() && bring(slot, () => api.fetchUrl(url.value)) }, tr("Traer")),
      h("button", { className: "small", onclick: () => bring(slot, () => api.pickFile(slot.kind)) }, tr("Archivo…"))
    );
    if (p !== undefined)
      tools.push(
        h("button", { className: "small", title: tr("Deshacer"), onclick: () => (delete pending[slot.id], render()) }, "↺")
      );
    else if (has) tools.push(h("button", { className: "small", title: tr("Volver al de Kirka"), onclick: () => ((pending[slot.id] = null), render()) }, "✕"));

    return h(
      "div",
      { className: `slot${p !== undefined ? " changed" : ""}` },
      h("div", { className: "name" }, h("b", {}, tr(slot.label)), slot.note ? h("small", {}, tr(slot.note)) : null),
      state,
      h("div", { className: "tools" }, tools)
    );
  }

  function render() {
    refreshButtons();
    $("tabs").replaceChildren(
      ...GROUPS.map(([id, label]) => h("button", { className: id === tab ? "on" : "", onclick: () => ((tab = id), render()) }, tr(label)))
    );
    const box = $("slots");
    if (!catalog || !current) {
      box.replaceChildren(h("p", { className: "hint" }, tr(catalog ? "Escoge un swapper a la izquierda o crea uno nuevo." : "Cargando los nombres de Kirka…")));
      return;
    }
    const slots = catalog.slots.filter((s) => s.group === tab);
    const rows = [];
    let lastWeapon = null;
    for (const slot of slots) {
      if (slot.weapon && slot.weapon !== lastWeapon) rows.push(h("h2", {}, (lastWeapon = slot.weapon)));
      rows.push(slotRow(slot));
    }
    box.replaceChildren(...rows);
  }

  async function save() {
    if (!current || !dirty()) return;
    $("save").disabled = true;
    status("Guardando…");
    const changes = {};
    const origins = {};
    try {
      for (const [id, p] of Object.entries(pending)) {
        if (p === null) {
          changes[id] = null;
          continue;
        }
        const slot = catalog.slots.find((s) => s.id === id);
        if (slot.kind === "audio") {
          const o = await original(id).catch(() => ({ peak: 0 }));
          changes[id] = (await A.prepareSound(p.bytes, { originalPeak: o.peak, match: $("match").checked, volume: p.volume })).bytes;
        } else changes[id] = await A.prepareImage(p.bytes);
        origins[id] = p.origen;
      }
      const res = await api.save(current, changes, origins);
      if (res?.error) return status(res.error, true);
      pending = {};
      const info = await api.open(current);
      present = info?.present || {};
      status(current === activo ? "Guardado. Recarga el juego (F5) para oírlo." : "Guardado. Dale «Usar en el juego» para probarlo.");
      render();
    } catch {
      status("No se pudo guardar", true);
      refreshButtons();
    }
  }

  $("new").addEventListener("click", async () => {
    const name = $("new-name").value.trim();
    if (!name) return;
    const res = await api.save(name, {}, {});
    if (res?.error) return status(res.error, true);
    $("new-name").value = "";
    await choose(name);
  });
  $("save").addEventListener("click", save);
  $("use").addEventListener("click", async () => {
    if (await api.use(current)) {
      await loadList();
      status("Listo: es el swapper del juego. Recarga con F5.");
    }
  });

  (async () => {
    render();
    await loadList();
    try {
      catalog = await api.catalog();
    } catch {
      status("No pude leer los nombres de Kirka. Revisa tu conexión y abre de nuevo.", true);
    }
    render();
  })();
})();
