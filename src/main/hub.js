"use strict";

// Which window the client opens first, from the "startGame" setting. The hub
// is always created; a remembered game just opens on top of it right away.
function startTarget(settings) {
  const value = settings && settings.startGame;
  return value === "kirka" || value === "voxarena" ? value : "hub";
}

const GAMES = Object.freeze(["kirka", "voxarena"]);
const isGame = (value) => GAMES.includes(value);

module.exports = { startTarget, isGame, GAMES };
