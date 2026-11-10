"use strict";

// RITE Light's installer (src/main/edition.js): the same code and settings as
// electron-builder.yml, with its own name, app id and settings folder, and
// "rite.edition": "light" in its package.json. Its updates come from the same
// releases, as light.yml next to latest.yml.
//
//   npm run build:light                    (unsigned, to try it)
//   npm run publicar -- v0.2.0 --light     (signed, together with RITE Client)
//
// publicar.js passes the signing options in RITE_SIGN_SUBJECT and
// RITE_SIGN_TIMESTAMP, since a config file can't be mixed with -c.* options.
//
// @author FRANKZ

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const base = yaml.load(fs.readFileSync(path.join(__dirname, "electron-builder.yml"), "utf8"));
const subject = process.env.RITE_SIGN_SUBJECT;
const ICON = "src/assets/icon-light.png";
const timestamp = process.env.RITE_SIGN_TIMESTAMP;

module.exports = {
  ...base,
  appId: require("./src/main/edition").LIGHT_APP_ID,
  productName: "RITE Light",
  copyright: base.copyright.replace("RITE Client, por FRANKZ", "RITE Light (RITE Client), por FRANKZ"),
  extraMetadata: { productName: "RITE Light", rite: { edition: "light" } },
  // Light's own icon: the RITE logo, flat silver on black.
  win: {
    ...base.win,
    icon: ICON,
    artifactName: "RITE-Light-Setup-${version}.${ext}",
    ...(subject ? { signtoolOptions: { certificateSubjectName: subject, rfc3161TimeStampServer: timestamp, timeStampServer: timestamp } } : {}),
  },
  mac: { ...base.mac, icon: ICON, artifactName: "RITE-Light-${version}-${arch}.${ext}" },
  linux: { ...base.linux, icon: ICON, artifactName: "RITE-Light-${version}.${ext}" },
  publish: { ...base.publish, channel: "light" },
};
