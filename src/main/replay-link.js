"use strict";

// rite://repeticion?r=<id>&t=<seconds> links, from the RITE Viewer's "Ver en
// Kirka" button. They open the Kirka window on kirka.io/#rite-rep=<id>&t=<s>,
// where the private RITE Repetición script finds the recording (by its local
// id or its rite.lat id) and starts it at that moment.

const SCHEME = "rite";
const ID = /^(r[a-z0-9]{10}|\d{1,16})$/;

// The link in a command line (Windows and Linux pass it as an argument).
const findLink = (argv = []) => argv.find((arg) => typeof arg === "string" && arg.toLowerCase().startsWith(`${SCHEME}://`)) ?? null;

// { id, t } from a rite:// link, or null if it isn't a valid replay link.
function parseReplayLink(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:` || url.hostname !== "repeticion") return null;
  const id = url.searchParams.get("r") ?? "";
  if (!ID.test(id)) return null;
  const t = Number(url.searchParams.get("t") ?? 0);
  return { id, t: Number.isFinite(t) && t > 0 ? Math.min(Math.round(t * 100) / 100, 36000) : 0 };
}

// The Kirka page that starts the replay. `base` is the client's Kirka address.
function replayPage(base, { id, t }) {
  const page = new URL(base);
  page.pathname = "/";
  page.search = "";
  page.hash = `rite-rep=${id}&t=${t}`;
  return page.toString();
}

// Makes rite:// links open this app (when run from source, with its folder).
function registerReplayLinks(app, path) {
  if (process.defaultApp && process.argv.length >= 2) return app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  return app.setAsDefaultProtocolClient(SCHEME);
}

module.exports = { findLink, parseReplayLink, replayPage, registerReplayLinks, SCHEME };
