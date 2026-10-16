"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { resolveInside } = require("./paths");
const { GAME_HOSTS } = require("./defaults");

const SCHEME = "rite-swap";
const MAX_FILES = 5000;

// The swapper folder mirrors the game's URL paths: the file
// `swapper/assets/img/logo.png` replaces `https://kirka.io/assets/img/logo.png`.
function scanSwapFolder(dir) {
  const files = new Map();
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.size >= MAX_FILES) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const urlPath = "/" + path.relative(dir, full).split(path.sep).join("/");
        files.set(urlPath, urlPath);
      }
    }
  };
  walk(dir);
  return files;
}

// Returns the rite-swap:// URL that replaces `requestUrl`, or null.
function findSwap(files, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (!GAME_HOSTS.includes(url.hostname)) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const match = files.get(pathname);
  return match ? `${SCHEME}://local${encodeURI(match)}` : null;
}

function registerSwapScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

class ResourceSwapper {
  constructor({ session, protocol, net, dir, pack = null }) {
    this.session = session;
    this.dir = dir;
    this.files = new Map();
    this.enabled = false;
    this.pack = pack; // RITE pack (src/main/rite-pack.js): recolored weapons and characters

    protocol.handle(SCHEME, (request) => {
      const url = new URL(request.url);
      if (url.hostname === "pack" && this.pack) {
        const original = url.searchParams.get("u");
        let target;
        try {
          target = new URL(original);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!GAME_HOSTS.includes(target.hostname)) return new Response("Forbidden", { status: 403 });
        return this.pack.serve(target.href);
      }
      let relative;
      try {
        relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      const file = resolveInside(this.dir, relative);
      if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.reload();
  }

  // Rescans the folder and (re)installs the request hook.
  reload() {
    this.files = this.enabled ? scanSwapFolder(this.dir) : new Map();
    const webRequest = this.session.webRequest;
    const packOn = Boolean(this.pack && this.pack.mode !== "off");
    if (!this.files.size && !packOn) {
      webRequest.onBeforeRequest(null);
      return 0;
    }
    const filter = { urls: GAME_HOSTS.flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]) };
    webRequest.onBeforeRequest(filter, (details, callback) => {
      // The player's own files win over the RITE pack.
      let redirectURL = findSwap(this.files, details.url);
      if (!redirectURL && packOn && details.resourceType !== "mainFrame") {
        let url = null;
        try {
          url = new URL(details.url);
        } catch {}
        if (url && GAME_HOSTS.includes(url.hostname) && this.pack.wants(url)) redirectURL = `${SCHEME}://pack/?u=${encodeURIComponent(url.href)}`;
      }
      callback(redirectURL ? { redirectURL } : {});
    });
    return this.files.size;
  }
}

module.exports = { ResourceSwapper, registerSwapScheme, scanSwapFolder, findSwap, SCHEME };
