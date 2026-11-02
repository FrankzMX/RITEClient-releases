"use strict";

// Community chat in the hub: the mirror of #rite-chat on the RITE Discord. It
// asks RITE WEB for new messages every few seconds while the hub is visible
// and the client is linked, and sends what the player writes (the bot posts
// it in Discord with their RITE name).

window.riteChat = (() => {
  const POLL_MS = 4000;
  const KEEP = 150;

  function create({ api, log, form, input, hint, toast, isLinked, hasPlayer }) {
    let messages = [];
    let last = 0;
    let timer = null;
    let failed = "";
    let sending = false;

    const time = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    function draw() {
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.replaceChildren();
      if (!isLinked()) {
        log.append(Object.assign(document.createElement("div"), { className: "empty", textContent: "Vincula el cliente con tu Discord para ver el chat de la comunidad." }));
      } else if (failed) {
        log.append(Object.assign(document.createElement("div"), { className: "empty", textContent: failed }));
      } else if (!messages.length) {
        log.append(Object.assign(document.createElement("div"), { className: "empty", textContent: "Nadie ha escrito todavía. Lo que escribas aquí sale en #rite-chat de Discord, y lo de Discord sale aquí." }));
      }
      for (const m of messages) {
        const row = document.createElement("div");
        row.className = `m${m.mine ? " mine" : ""}${m.source === "discord" ? " discord" : ""}`;
        const name = document.createElement("b");
        name.textContent = m.name;
        const when = document.createElement("small");
        when.textContent = time(m.at);
        row.append(name, when, document.createElement("br"), document.createTextNode(m.text));
        log.append(row);
      }
      if (atBottom) log.scrollTop = log.scrollHeight;
      form.hidden = !isLinked();
      input.placeholder = hasPlayer() ? "Escribe a la comunidad…" : "Regístrate en RITE para escribir";
      input.disabled = !hasPlayer() || sending;
    }

    async function poll() {
      clearTimeout(timer);
      timer = null;
      if (document.hidden || !isLinked()) return;
      try {
        const fresh = await api.get(last);
        if (fresh.length) {
          messages = [...messages, ...fresh.filter((m) => m.id > last)].slice(-KEEP);
          last = messages[messages.length - 1].id;
        }
        failed = "";
      } catch (error) {
        failed = error?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "Sin conexión con el chat";
      }
      draw();
      if (!document.hidden && isLinked()) timer = setTimeout(poll, POLL_MS);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || sending) return;
      sending = true;
      draw();
      try {
        await api.say(text);
        input.value = "";
        await poll();
      } catch (error) {
        toast(error?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "No se pudo enviar", "error");
      } finally {
        sending = false;
        draw();
        input.focus();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) poll();
    });
    hint.textContent = "#rite-chat";

    return {
      // The scrims state changed: start or stop following the chat.
      update() {
        if (isLinked() && !timer) poll();
        else draw();
      },
    };
  }

  return { create };
})();
