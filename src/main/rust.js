"use strict";

// «RITE Rust» in the hub: opens the light Rust client (its own program, from
// FrankzMX/RITE-Rust-releases) and RITE Client closes, like RITE Light.
// RITE Rust is a single portable exe; the first time it is downloaded to
// %LOCALAPPDATA%\RITE Rust\RITE Rust.exe (next to its settings) after checking
// its sha256 against latest.json. From then on it updates itself.
//
// @author FRANKZ

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const LATEST = "https://github.com/FrankzMX/RITE-Rust-releases/releases/latest/download/latest.json";
const RELEASES = "https://github.com/FrankzMX/RITE-Rust-releases/releases/download/";
const EXE = "RITE Rust.exe";

// Where RITE Rust lives on this PC, or null outside Windows.
function rustPaths(env = process.env, platform = process.platform) {
  if (platform !== "win32" || !env.LOCALAPPDATA) return null;
  const dir = path.join(env.LOCALAPPDATA, "RITE Rust");
  return { dir, exe: path.join(dir, EXE) };
}

// The download from latest.json, only from RITE Rust's own releases.
function pickDownload(info) {
  const url = info && typeof info.exe === "string" ? info.exe : "";
  const sha = info && typeof info.exe_sha256 === "string" ? info.exe_sha256.toLowerCase() : "";
  if (!url.startsWith(RELEASES) || !/^[0-9a-f]{64}$/.test(sha)) return null;
  return { url, sha, version: typeof info.version === "string" ? info.version : "" };
}

async function download(fetch, paths) {
  const res = await fetch(LATEST, { cache: "no-store" });
  if (!res.ok) throw new Error("No pude revisar la última versión de RITE Rust.");
  const pick = pickDownload(await res.json());
  if (!pick) throw new Error("La versión publicada de RITE Rust no es válida.");
  const bin = await fetch(pick.url);
  if (!bin.ok) throw new Error("No pude bajar RITE Rust.");
  const bytes = Buffer.from(await bin.arrayBuffer());
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== pick.sha) throw new Error("La descarga de RITE Rust llegó dañada. Intenta otra vez.");
  fs.mkdirSync(paths.dir, { recursive: true });
  const part = `${paths.exe}.part`;
  fs.writeFileSync(part, bytes);
  fs.renameSync(part, paths.exe);
}

// Downloads RITE Rust when it is not there yet and starts it, on its own.
// Returns true once it is running; `quit` then closes RITE Client.
async function openRust({ fetch, quit, env, platform } = {}) {
  const paths = rustPaths(env, platform);
  if (!paths) throw new Error("RITE Rust solo funciona en Windows.");
  if (!fs.existsSync(paths.exe)) await download(fetch, paths);
  await new Promise((resolve, reject) => {
    const child = spawn(paths.exe, [], { cwd: paths.dir, detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", () => reject(new Error("No pude abrir RITE Rust.")));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  if (quit) setTimeout(quit, 300);
  return true;
}

module.exports = { openRust, rustPaths, pickDownload, LATEST };
