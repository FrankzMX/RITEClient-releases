"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compactar } = require("../scripts/compactar");

const SOURCE = `// ==UserScript==
// @name         Ejemplo RITE
// @version      1.2.3
//   @author     RITE
// ==/UserScript==

// Cómo funciona: engancha bindTexture y lee la sala.
/* Secreto a voces */
const unaVariableConNombreLargo = 41; // comentario al final
function calcularAlgo(valorDeEntrada) {
  // paso 1
  const resultadoIntermedio = valorDeEntrada + 1;
  return resultadoIntermedio;
}
window.riteEjemplo = calcularAlgo(unaVariableConNombreLargo);
`;

test("keeps the UserScript header, drops every other comment", () => {
  const out = compactar(SOURCE);
  assert.ok(out.startsWith("// ==UserScript==\n// @name         Ejemplo RITE\n// @version      1.2.3\n// @author     RITE\n// ==/UserScript==\n"));
  const body = out.split("// ==/UserScript==\n")[1];
  assert.ok(!body.includes("//"), body);
  assert.ok(!body.includes("/*"));
  assert.ok(!body.includes("Cómo funciona"));
  assert.ok(!body.includes("Secreto"));
});

test("minifies the body and keeps top-level names", () => {
  const out = compactar(SOURCE);
  assert.ok(out.includes("calcularAlgo"), "top-level names stay (they may be globals)");
  assert.ok(!out.includes("resultadoIntermedio"), "local names get shortened");
  assert.ok(!out.includes("valorDeEntrada"));
  assert.ok(out.length < SOURCE.length);
  // Still runs the same.
  const w = {};
  new Function("window", out)(w);
  assert.equal(w.riteEjemplo, 42);
});

test("a file without header is just minified", () => {
  const out = compactar("// nada\nconst x = 1 + 1; // dos\nglobalThis.__c = x;\n");
  assert.ok(!out.includes("//"));
  assert.ok(!out.includes("UserScript"));
});
