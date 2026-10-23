"use strict";

// Sends the final score of a RITE scrim to the bot by itself. While the player
// has an open Kirka match, it watches the red/blue score at the top of the HUD;
// when a team reaches the mode's target it waits for the end screen and sends
// the score, the names (with their Kirka #ID) on each side and a picture of the
// end screen. Which colour is the player's own comes from the match itself: a
// point the other team scores shows up with the "killed you" card. The bot
// uses that (or else the names, or else the picture) to know which team is red.

const TARGET = { "1v1": 15, "2v2-tdm": 50 };
const TAG = /#\s?[A-Za-z0-9]{4,10}/;
const SENT_KEY = "rite-result-sent";

const num = (selector) => {
  const text = document.querySelector(selector)?.textContent?.trim();
  return text && /^\d{1,3}$/.test(text) ? Number(text) : null;
};

function readScore() {
  return { red: num(".team-score > .label.red"), blue: num(".team-score > .label.blue") };
}

// Which side a name belongs to: the nearest red/blue class above it, or else
// where it sits on screen (the end screen puts red on the left).
function sideOf(node) {
  for (let n = node; n && n !== document.body; n = n.parentElement) {
    const cls = typeof n.className === "string" ? n.className : "";
    if (/(^|[\s_-])red($|[\s_-])/i.test(cls)) return "red";
    if (/(^|[\s_-])blue($|[\s_-])/i.test(cls)) return "blue";
  }
  const box = node.getBoundingClientRect();
  if (!box.width) return null;
  return box.left + box.width / 2 < innerWidth / 2 ? "red" : "blue";
}

function readNames() {
  const out = { red: new Set(), blue: new Set() };
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!TAG.test(t.nodeValue)) continue;
    const el = t.parentElement;
    const side = el && sideOf(el);
    if (side) out[side].add((el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60));
  }
  const join = (set) => [...set].join("\n").slice(0, 600);
  return { redText: join(out.red), blueText: join(out.blue) };
}

const { lobbyColor } = require("./lobby");

const DEATH = /killed\s+you/i;
const died = () => DEATH.test(document.querySelector(".game-interface")?.textContent || "");

function createAutoResult({ api, toast, getState, getSettings }) {
  let sent = new Set();
  try {
    sent = new Set(JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]"));
  } catch {}
  let busy = false;
  // Votes for the player's own colour: +1 red, -1 blue.
  let vote = 0;
  let last = { red: null, blue: null };

  function track(m, score) {
    if (score.red === null || score.blue === null) return;
    const gained = ["red", "blue"].filter((c) => last[c] !== null && score[c] > last[c]);
    // A new game (the score went back down): start counting again.
    if ((last.red !== null && score.red < last.red) || (last.blue !== null && score.blue < last.blue)) vote = 0;
    last = score;
    if (gained.length !== 1) return;
    const sign = gained[0] === "red" ? 1 : -1;
    if (died()) vote -= sign;
    // In a 1v1 every other point is the player's own kill.
    else if (m.mode === "1v1") vote += sign;
  }

  async function check() {
    // The score only exists in a match room.
    if (busy || !/^\/games\//.test(location.pathname)) return;
    const settings = getSettings();
    if (!settings.scrimsEnabled || settings.scrimsAutoResult === false) return;
    const m = getState().me?.match;
    const target = m && m.game === "kirka" && TARGET[m.mode];
    if (!target || sent.has(m.id)) return;
    let { red, blue } = readScore();
    track(m, { red, blue });
    if (red === null || blue === null || Math.max(red, blue) < target) return;
    busy = true;
    sent.add(m.id);
    try {
      sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-20)));
    } catch {}
    // The end screen (names and the final board) shows up a moment later.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const last = readScore();
    if (last.red !== null && last.blue !== null) ({ red, blue } = last);
    try {
      if (red === blue) throw new Error("el marcador quedó empatado");
      // In a 1v1 the player's own kill counter equals their team's score.
      const kills = m.mode === "1v1" ? num(".kill-death .kill") : null;
      const byKills = kills === red ? "red" : kills === blue ? "blue" : "";
      // With the RITE lobby, the colour the player had there when it started.
      const mine = byKills || lobbyColor(m.id) || (vote > 0 ? "red" : vote < 0 ? "blue" : "");
      await api.scrimsResult({ red, blue, mine, ...readNames() });
      toast.show(`Resultado enviado al bot: ${red}–${blue}`);
    } catch (error) {
      const why = error?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "algo falló";
      toast.show(`No se pudo enviar el resultado (${why}). Pega la captura en el hilo de la partida.`, "error");
    } finally {
      busy = false;
    }
  }

  setInterval(check, 1000);
}

module.exports = { createAutoResult, readNames, TARGET };
