"use strict";

// Public half of RITE's module signing key (Ed25519, PEM). The private half
// lives only on the author's PC (~/.rite-modulos/llave-privada.pem) and signs
// every module entry (`npm run licencias -- llave` creates both and rewrites this
// file). Empty = RITE modules are off in this build.
module.exports = { PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA1NW504260fII92kjGuiVj6DJ523nlh/9qSbTlbxwtwc=\n-----END PUBLIC KEY-----" };
