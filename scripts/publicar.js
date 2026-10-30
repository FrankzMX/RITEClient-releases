"use strict";

// Publishes a signed version from the author's Windows PC:
//
//   npm run publicar -- v0.1.0-beta.22
//
// The Certum certificate lives in the cloud (SimplySign) and only exists on a
// PC where SimplySign Desktop is connected, so GitHub cannot sign; this does
// what .github/workflows/release.yml used to do for the installer, with the
// signature on top:
//   1. checks the tree is clean and the certificate is in the Windows store;
//   2. copies HEAD to a temp folder, installs, minifies and sets the version;
//   3. creates the release on FrankzMX/RITEClient-releases (prerelease when
//      the version has a suffix) and lets electron-builder build, sign (every
//      .exe, with Certum's time stamp) and upload the installer;
//   4. pushes the tag, which makes the workflow run the tests and publish the
//      source (GPL-3.0) to the "codigo" branch.
//
// Needs: Windows, Node 22, git, the GitHub CLI logged in (`gh auth login`) with
// write access to RITEClient-releases, and SimplySign Desktop connected.

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RELEASES = "FrankzMX/RITEClient-releases";
// As SimplySign Desktop lists it (Subject). electron-builder matches by "includes".
const CERT_SUBJECT = "Open Source Developer Frankz Xavier Garcia y Garcia";
const TIMESTAMP = "http://time.certum.pl";

const root = path.join(__dirname, "..");
// npm/npx are .cmd files and need a shell on Windows, which joins the arguments
// without quoting: quote the ones with spaces (the certificate subject, notes).
const quote = (arg) => (/[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const run = (cmd, args, opts = {}) => {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const shell = process.platform === "win32";
  const result = spawnSync(cmd, shell ? args.map(quote) : args, { stdio: "inherit", shell, ...opts });
  if (result.status !== 0) fail(`"${cmd}" terminó con error (${result.status}).`);
};
// git, gh and powershell are real executables: no shell, so "|" in a command stays an argument.
const out = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(tag || "")) fail("Dime la versión, por ejemplo: npm run publicar -- v0.1.0-beta.22");
const version = tag.slice(1);
const prerelease = version.includes("-");

if (process.platform !== "win32") fail("La firma con SimplySign solo funciona en Windows.");
if (out("git", ["status", "--porcelain"], { cwd: root })) fail("Hay cambios sin confirmar. Haz commit (o stash) antes de publicar.");
if (out("git", ["tag", "-l", tag], { cwd: root })) fail(`El tag ${tag} ya existe. Si quieres repetir la versión, bórralo primero: git tag -d ${tag}`);

// The certificate shows up in the user's store only while SimplySign Desktop is connected.
const certs = out("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Get-ChildItem -Recurse Cert:\\CurrentUser\\My -CodeSigningCert | Select-Object -ExpandProperty Subject"]);
if (!certs.includes(CERT_SUBJECT)) {
  fail(`No veo el certificado "${CERT_SUBJECT}" en Windows.\n  Abre SimplySign Desktop, conéctate con el código de la app del celular y vuelve a intentar.`);
}

const token = process.env.GH_TOKEN || out("gh", ["auth", "token"]);
if (!token) fail("Inicia sesión en GitHub CLI: gh auth login");
const env = { ...process.env, GH_TOKEN: token };

// A throwaway copy: minify.js rewrites src/ in place and package.json gets the version.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "rite-client-publicar-"));
console.log(`Copia de trabajo: ${work}`);
run("git", ["archive", "--format=tar", "HEAD", "-o", path.join(work, "src.tar")], { cwd: root });
run("tar", ["-xf", "src.tar", "--exclude=scripts/RITE-Client.bat", "--exclude=.github"], { cwd: work });
fs.rmSync(path.join(work, "src.tar"));

run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: work });
run("npm", ["test"], { cwd: work });
run("node", ["scripts/minify.js"], { cwd: work });
run("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], { cwd: work });

// electron-builder uploads the .exe and its blockmap at once and both would try
// to create the release; create it first (same as the workflow).
const exists = spawnSync("gh", ["release", "view", tag, "--repo", RELEASES], { stdio: "ignore", shell: true, env }).status === 0;
if (!exists) {
  run("gh", ["release", "create", tag, "--repo", RELEASES, "--title", version, "--notes", `RITE Client ${version}`, ...(prerelease ? ["--prerelease"] : [])], { env });
}

run(
  "npx",
  [
    "electron-builder",
    "--win",
    "--publish",
    "always",
    `-c.win.signtoolOptions.certificateSubjectName=${CERT_SUBJECT}`,
    `-c.win.signtoolOptions.rfc3161TimeStampServer=${TIMESTAMP}`,
    `-c.win.signtoolOptions.timeStampServer=${TIMESTAMP}`,
  ],
  { cwd: work, env: { ...env, EP_PRE_RELEASE: prerelease ? "true" : "false" } }
);

// The tag goes last, once the signed installer is up: the workflow then tests
// this commit and publishes its source.
run("git", ["tag", tag], { cwd: root });
run("git", ["push", "origin", tag], { cwd: root });

fs.rmSync(work, { recursive: true, force: true });
console.log(`\n✔ RITE Client ${version} publicado y firmado: https://github.com/${RELEASES}/releases/tag/${tag}`);
