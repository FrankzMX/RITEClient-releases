"use strict";

// Loaded before the others: keeps the first errors of the page (a script that
// failed to load or to run), so "Mis clips" can say what went wrong.
window.riteLoadErrors = [];
window.addEventListener(
  "error",
  (e) => {
    const file = (e.filename || e.target?.src || "").split("/").pop();
    window.riteLoadErrors.push(e.message ? `${e.message} (${file}:${e.lineno}:${e.colno})` : `no cargó ${file}`);
  },
  true,
);
