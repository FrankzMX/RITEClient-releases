"use strict";

// RITE scrims in the hub: link the client with Discord, register, the live
// queues (join, leave), the ¡Listo! check, the open match with its map vote and
// "Entrar a la sala", which opens the game of the match on that room. It is the
// hub's version of the Kirka panel (src/preload/features/scrims.js), fed by the
// same state from the main process.

window.riteScrims = (() => {
  const GAMES = { kirka: "Kirka", voxarena: "VOXARENA", protox: "Protox" };
  const MODES = { "1v1": "1v1", "2v2-point": "2v2 Point", "2v2-tdm": "2v2 TDM", "3v3-point": "3v3 Point" };
  const label = (game, mode) => `${GAMES[game] || game} · ${MODES[mode] || mode}`;
  // Queues always listed, so an empty one can be opened from here (the bot's PLAYABLE).
  const LISTED = { kirka: ["1v1", "2v2-tdm", "2v2-point", "3v3-point"], voxarena: ["1v1", "2v2-tdm"] };
  const perTeam = (mode) => Number(/^(\d)v/.exec(mode)?.[1] || 1);

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (key === "className") node.className = value;
      else if (key === "disabled" || key === "selected" || key === "hidden") node[key] = Boolean(value);
      else if (value !== undefined && value !== false && value !== null) node.setAttribute(key, value === true ? "" : value);
    }
    node.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  }

  function create({ api, root, dot, toast, discordUrl, getSettings, setFolded }) {
    let state = { linked: false, status: "checking" };
    let busy = false;
    let pending = null;
    let pendingTimer = null;
    let lastNotice = 0;
    let tick = null;
    let foldedText = null; // the games folded here, ahead of the saved setting

    async function act(fn) {
      if (busy) return;
      busy = true;
      try {
        await fn();
      } catch (error) {
        toast(error?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "Algo falló", "error");
      } finally {
        busy = false;
        draw();
      }
    }

    function queueAction(key, fn) {
      pending = key;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => ((pending = null), draw()), 8000);
      act(fn).catch(() => {});
    }

    const remaining = (until) => Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000));
    const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    function queueRows() {
      const me = state.me?.queue;
      const busyMatch = Boolean(state.me?.match);
      const live = new Map((state.queues || []).map((q) => [`${q.game}:${q.mode}`, q]));
      const keys = [
        ...Object.entries(LISTED).flatMap(([game, modes]) => modes.map((m) => `${game}:${m}`)),
        ...[...live.keys()].filter((k) => !LISTED[k.split(":")[0]]?.includes(k.split(":")[1])),
      ];
      const byGame = new Map();
      for (const key of keys) {
        const [game, mode] = key.split(":");
        if (!byGame.has(game)) byGame.set(game, []);
        byGame.get(game).push(mode);
      }
      const folded = new Set(String(foldedText ?? getSettings().hubFolded ?? "").split(",").filter(Boolean));
      return [...byGame].map(([game, modes]) => {
        const rows = modes.map((mode) => {
          const key = `${game}:${mode}`;
          const q = live.get(key);
          const need = q?.need || perTeam(mode) * 2;
          const players = q?.players || [];
          const mine = me && me.game === game && me.mode === mode;
          const waiting = pending === `join:${key}` || (mine && pending === "leave");
          const button = mine
            ? el("button", { className: "s out", disabled: waiting, onclick: () => queueAction("leave", () => api.queue("leave")) }, waiting ? "…" : "Salir")
            : el(
                "button",
                {
                  className: "s",
                  disabled: waiting || busyMatch || Boolean(me?.check),
                  title: busyMatch ? "Ya tienes una partida abierta" : me ? "Te cambia de cola" : "",
                  onclick: () => queueAction(`join:${key}`, () => api.queue("join", game, mode)),
                },
                waiting ? "…" : "Entrar"
              );
          return el(
            "div",
            { className: `qrow${mine ? " mine" : ""}${players.length ? " live" : ""}` },
            el(
              "div",
              { className: "n" },
              el("div", {}, MODES[mode] || mode),
              el("small", { title: players.join(", ") }, q?.checking ? "Confirmando ¡Listo!…" : players.length ? players.join(", ") : "Vacía: entra y ábrela")
            ),
            el("span", { className: "c" }, `${Math.min(players.length, need)}/${need}`),
            button
          );
        });
        const queued = modes.reduce((sum, mode) => sum + (live.get(`${game}:${mode}`)?.players?.length || 0), 0);
        // Your own queue never hides: a folded game opens while you are in it.
        const closed = folded.has(game) && me?.game !== game;
        const toggle = () => {
          if (folded.has(game)) folded.delete(game);
          else folded.add(game);
          foldedText = [...folded].join(",");
          setFolded?.(foldedText);
          draw();
        };
        return el(
          "div",
          { className: `grp${closed ? " closed" : ""}` },
          el(
            "button",
            { type: "button", className: "gh", "aria-expanded": String(!closed), onclick: toggle },
            chevron(),
            el("span", { className: "nm" }, GAMES[game] || game),
            el("span", { className: "sm" }, el("b", {}, String(queued)), ` en cola · ${modes.length} ${modes.length === 1 ? "cola" : "colas"}`)
          ),
          el("div", { className: "rows" }, rows)
        );
      });
    }

    function chevron() {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 12 12");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.6");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M2.5 4.5L6 8l3.5-3.5");
      svg.append(path);
      return svg;
    }

    function checkBox(check) {
      const left = check.until ? remaining(check.until) : null;
      const sending = pending === "ready";
      return el(
        "div",
        { className: "check" },
        el("div", { className: "h" }, check.ready ? "¡Listo! enviado" : "¡Tu cola se llenó!"),
        el("div", { className: "msg" }, check.ready ? "Esperando a los demás…" : `Confirma que puedes jugar ahora${left !== null ? ` · quedan ${mmss(left)}` : ""}`),
        left !== null && check.until ? el("div", { className: "bar" }, el("i", { style: `width:${Math.min(100, (left / 60) * 100)}%` })) : null,
        check.ready
          ? null
          : el(
              "div",
              { className: "btns" },
              el("button", { className: "s main", disabled: sending, onclick: () => queueAction("ready", () => api.ready(check.id, true)) }, sending ? "…" : "¡Listo!"),
              el("button", { className: "s out", disabled: sending, onclick: () => queueAction("ready", () => api.ready(check.id, false)) }, "No puedo")
            )
      );
    }

    function voteBox(m) {
      const v = m.vote;
      if (!v || !v.maps?.length) return null;
      const closed = v.winner !== null && v.winner !== undefined;
      const left = remaining(v.until);
      const picked = v.mine;
      const sending = String(pending || "").startsWith("vote:");
      return el(
        "div",
        {},
        el("div", { className: "sec" }, closed ? `Mapa: ${v.maps[v.winner]}` : `Votación de mapa · ${mmss(left)}`),
        el(
          "div",
          { className: "vote" },
          v.maps.map((name, k) =>
            el(
              "button",
              { className: `s quiet${picked === k ? " on" : ""}`, disabled: sending || closed, onclick: () => queueAction(`vote:${k}`, () => api.vote(m.id, k)) },
              `${name} · ${v.counts?.[k] || 0}`
            )
          )
        )
      );
    }

    function matchRow(m) {
      const game = GAMES[m.game] || m.game;
      return el(
        "div",
        { className: "mrow" },
        el("div", { className: "h" }, `Partida #${m.id} · ${label(m.game, m.mode)}`),
        el("div", { className: "sub" }, el("b", {}, m.teams[0].join(", ") || "—"), "  vs  ", el("b", {}, m.teams[1].join(", ") || "—"), m.map ? ` · ${m.map}` : ""),
        el(
          "div",
          { className: "btns" },
          m.roomUrl
            ? el("button", { className: "s main", title: `Abre ${game} en la sala de tu partida`, onclick: () => act(() => api.join(m.roomUrl)) }, "Entrar a la sala")
            : el("div", { className: "msg" }, m.game === "voxarena" ? "El bot abre la sala en VOXARENA y te manda la invitación." : "Esperando la sala (el host la pasa en el hilo o desde Kirka)."),
          m.threadUrl ? el("button", { className: "s", onclick: () => api.open(m.threadUrl) }, "Hilo") : null
        ),
        voteBox(m)
      );
    }

    let form = { name: "", region: "", kirka: "" };
    function registerForm() {
      const input = (key, attrs) => el("input", { className: "in", value: form[key], oninput: (e) => (form[key] = e.target.value), ...attrs });
      const region = el(
        "select",
        { className: "in", onchange: (e) => (form.region = e.target.value) },
        el("option", { value: "" }, "Región"),
        ...["EU", "NA", "SA"].map((r) => el("option", { value: r, selected: form.region === r }, r))
      );
      const sending = pending === "register";
      return [
        el("div", { className: "msg" }, "Para entrar a las colas regístrate en RITE. Es lo mismo que /registro en Discord."),
        input("name", { placeholder: "Tu gamer tag", maxLength: 24 }),
        region,
        input("kirka", { placeholder: "Tu Kirka: Nombre#ID (ej. SANTI#MARAGE)", maxLength: 48 }),
        el(
          "div",
          { className: "btns" },
          el("button", { className: "s main", disabled: sending, onclick: () => queueAction("register", () => api.register(form)) }, sending ? "…" : "Registrarme"),
          el("button", { className: "s quiet", onclick: () => api.open(discordUrl) }, "Discord")
        ),
      ];
    }

    function body() {
      if (!getSettings().scrimsEnabled || state.status === "off")
        return [el("div", { className: "msg" }, "Scrims RITE está apagado. Enciéndelo en el menú del cliente dentro de Kirka (Scrims RITE).")];
      if (state.status === "unlinked" || state.status === "checking" || (!state.linked && !state.code))
        return [
          el("div", { className: "msg" }, "Liga RITE Client con tu Discord una sola vez: sirve para las colas de Kirka y de VOXARENA."),
          el("div", { className: "btns" }, el("button", { className: "s main", onclick: () => act(() => api.pair()) }, "Vincular con Discord")),
        ];
      if (!state.linked) {
        const mins = state.expiresAt ? Math.max(1, Math.round((new Date(state.expiresAt).getTime() - Date.now()) / 60000)) : null;
        return [
          el("div", { className: "msg" }, "En el Discord de RITE escribe:"),
          el("div", { className: "code" }, state.code),
          el("code", { className: "cmd" }, `/cliente vincular codigo:${state.code}`),
          el("div", { className: "msg" }, mins ? `El código vence en ${mins} min.` : ""),
          el(
            "div",
            { className: "btns" },
            el("button", { className: "s", onclick: () => api.open(discordUrl) }, "Abrir Discord"),
            el("button", { className: "s out", onclick: () => act(() => api.unlink()) }, "Cancelar")
          ),
        ];
      }
      const out = [];
      out.push(
        el(
          "div",
          { className: "msg" },
          state.player ? ["Ligado como ", el("b", {}, state.player.name), "."] : "Ligado.",
          state.offline ? " Sin conexión con RITE WEB, reintentando…" : ""
        )
      );
      if (!state.player) {
        out.push(...registerForm());
        return out;
      }
      const check = state.me?.queue?.check;
      if (check) out.push(checkBox(check));
      const m = state.me?.match;
      if (m) out.push(matchRow(m));
      out.push(el("div", { className: "sec" }, "Colas en vivo"));
      out.push(...queueRows());
      out.push(
        el(
          "div",
          { className: "btns" },
          el("button", { className: "s quiet", onclick: () => api.open(discordUrl) }, "Discord de RITE"),
          el("button", { className: "s out", onclick: () => act(() => api.unlink()) }, "Desvincular")
        )
      );
      return out;
    }

    function draw() {
      // Don't rebuild while the player types in the register form.
      if (root.contains(document.activeElement) && document.activeElement.classList.contains("in")) return;
      root.replaceChildren(...body().filter((n) => n !== null && n !== undefined));
      dot.className = `dot${state.linked ? (state.offline ? " warn" : " on") : ""}`;
      dot.title = state.linked ? (state.offline ? "Sin conexión con RITE WEB" : "Conectado a RITE WEB") : "Sin vincular";
      const needsTick = Boolean(state.me?.queue?.check?.until || state.me?.match?.vote);
      if (needsTick && !tick) tick = setInterval(draw, 1000);
      if (!needsTick && tick) {
        clearInterval(tick);
        tick = null;
      }
    }

    function apply(next) {
      state = next || state;
      for (const n of state.notices || []) {
        if (n.id > lastNotice) {
          lastNotice = n.id;
          toast(n.text, n.ok ? undefined : "error");
        }
      }
      // The bot answered: the pending mark is no longer needed.
      if (state.notices?.length) pending = null;
      draw();
    }

    return { apply, draw };
  }

  return { create };
})();
