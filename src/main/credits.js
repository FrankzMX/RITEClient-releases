"use strict";

// Shown in the client's "Acerca de" tab. RITE Client takes ideas and code from
// these GPL-3.0 projects, whose authors ask for visible credit.
module.exports = {
  // RITE's own places, linked from the lobby, the menu and Discord presence.
  community: [
    { name: "RITE WEB", url: "https://rite.lat/" },
    { name: "Discord de RITE", url: "https://discord.gg/tkqQCCytbq" },
  ],
  projects: [
    {
      name: "Smudgy Client",
      author: "OBS-Akuma y colaboradores",
      url: "https://github.com/OBS-Akuma/smudgy-client",
      note: "Referencia de features: resource swapper, switches de rendimiento, userscripts, Discord RPC.",
    },
    {
      name: "Juice Client",
      author: "irrvlo",
      url: "https://github.com/irrvlo/juice-client",
      note: "Base original de Smudgy Client.",
    },
    {
      name: "Dawn Client",
      author: "zVipexx y colaboradores",
      url: "https://github.com/zVipexx/dawn-client",
      note: "Idea de las estadísticas en partida (K/D, asistencias, puntos, HS%).",
    },
    {
      name: "Kirka.io",
      author: "Xip",
      url: "https://kirka.io/",
      note: "El juego.",
    },
  ],
  get links() {
    return [...this.community, ...this.projects].map(({ name, url }) => ({ name, url }));
  },
};
