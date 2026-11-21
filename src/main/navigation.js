"use strict";

const { GAME_HOSTS, LOGIN_HOSTS } = require("./defaults");

function hostMatches(hostname, hosts) {
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

// Decides what to do with a URL a game window wants to open:
// "internal" loads it in the window, "external" hands it to the system browser,
// "block" drops it.
function classifyNavigation(value, hosts = GAME_HOSTS) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "block";
  }
  if (url.protocol === "https:" && hostMatches(url.hostname, [...hosts, ...LOGIN_HOSTS])) {
    return "internal";
  }
  if (url.protocol === "https:" || url.protocol === "http:") return "external";
  return "block";
}

// A login provider page (Xsolla, Google, Discord, Facebook...), not the game.
function isLoginUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hostMatches(url.hostname, LOGIN_HOSTS);
  } catch {
    return false;
  }
}

// Google and Facebook refuse to log in from a browser that says it is
// Electron, so login pages get the plain Chrome user agent.
function cleanUserAgent(ua) {
  return String(ua).replace(/\s(Electron|rite-client|RITE Client)\/\S+/gi, "");
}

// URL patterns (for session.webRequest) that cover every login host.
function loginUrlPatterns() {
  return LOGIN_HOSTS.flatMap((host) => [`https://${host}/*`, `https://*.${host}/*`]);
}

function isGameOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hostMatches(url.hostname, GAME_HOSTS);
  } catch {
    return false;
  }
}

module.exports = { classifyNavigation, isGameOrigin, isLoginUrl, cleanUserAgent, loginUrlPatterns };
