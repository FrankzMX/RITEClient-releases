"use strict";

// "Editar HUB": each player places the hub's panels where they like. A panel
// moves by its gold bar and grows or shrinks from its corner, snapping to the
// 12×8 grid of src/hub/layout.js; dropping it where it does not fit, with the
// pointer over another panel, swaps the two.
// The layout is saved in the "hubLayout" setting.

window.riteHubEditor = (() => {
  const L = window.riteLayout;

  function create({ grid, cells, ghost, save }) {
    const panels = [...grid.querySelectorAll("[data-panel]")];
    let layout = L.preset(L.DEFAULT);
    let saved = "";
    let op = null;

    for (let i = 0; i < L.COLS * L.ROWS; i++) cells.append(document.createElement("i"));

    const place = (node, [x, y, w, h]) => {
      node.style.gridColumn = `${x + 1} / span ${w}`;
      node.style.gridRow = `${y + 1} / span ${h}`;
    };

    function draw() {
      for (const panel of panels) {
        const r = layout[panel.dataset.panel];
        place(panel, r);
        const size = panel.querySelector(".size");
        if (size) size.textContent = `${r[2]}×${r[3]}`;
      }
    }

    function commit(next) {
      layout = next;
      draw();
      const text = JSON.stringify(layout);
      const isDefault = text === JSON.stringify(L.preset(L.DEFAULT));
      const value = isDefault ? "" : text;
      if (value !== saved) {
        saved = value;
        save(value);
      }
    }

    function cellAt(event) {
      const box = grid.getBoundingClientRect();
      return [Math.floor(((event.clientX - box.left) / box.width) * L.COLS), Math.floor(((event.clientY - box.top) / box.height) * L.ROWS)];
    }

    // Where the drop would land: the new place, or the swap with the panel under the pointer.
    function result() {
      if (L.fits(layout, op.id, op.next)) return { ...layout, [op.id]: op.next };
      return op.kind === "move" ? L.swap(layout, op.id, op.over) : null;
    }

    function showGhost() {
      const next = result();
      place(ghost, next ? next[op.id] : op.next);
      ghost.classList.add("on");
      ghost.classList.toggle("bad", !next);
    }

    grid.addEventListener("pointerdown", (event) => {
      if (!document.body.classList.contains("editing") || event.button !== 0) return;
      const handle = event.target.closest("[data-drag],[data-resize]");
      if (!handle) return;
      event.preventDefault();
      const panel = handle.closest("[data-panel]");
      const id = panel.dataset.panel;
      op = { id, panel, kind: handle.hasAttribute("data-resize") ? "resize" : "move", start: cellAt(event), from: [...layout[id]], next: [...layout[id]], over: null };
      handle.setPointerCapture(event.pointerId);
      panel.classList.add("dragging");
      showGhost();
    });

    grid.addEventListener("pointermove", (event) => {
      if (!op) return;
      const [cx, cy] = cellAt(event);
      const dx = cx - op.start[0];
      const dy = cy - op.start[1];
      const [x, y, w, h] = op.from;
      const [mw, mh] = L.MIN[op.id];
      op.over = L.at(layout, cx, cy);
      op.next =
        op.kind === "move"
          ? [Math.max(0, Math.min(L.COLS - w, x + dx)), Math.max(0, Math.min(L.ROWS - h, y + dy)), w, h]
          : [x, y, Math.max(mw, Math.min(L.COLS - x, w + dx)), Math.max(mh, Math.min(L.ROWS - y, h + dy))];
      showGhost();
    });

    function end() {
      if (!op) return;
      const next = result();
      op.panel.classList.remove("dragging");
      op = null;
      ghost.classList.remove("on");
      if (next) commit(next);
    }
    grid.addEventListener("pointerup", end);
    grid.addEventListener("pointercancel", end);
    grid.addEventListener("lostpointercapture", end);

    draw();
    return {
      // The saved setting (from the main process).
      load(text) {
        saved = text || "";
        layout = L.parse(saved);
        draw();
      },
      preset: (name) => commit(L.preset(name)),
      dragging: () => Boolean(op),
    };
  }

  return { create };
})();
