"use strict";

// Block textures the player keeps in Documentos/RITEClient/texturas: any PNG,
// JPG or WebP there shows up in the texture panel (ESC in a match) and the
// menu. Kirka draws its block atlas at 256×256, so bigger images are scaled
// down here once: smaller data URL, smaller localStorage write.

const fs = require("node:fs");
const path = require("node:path");
const { resolveInside } = require("./paths");

const NAME = /^(?!\.)[^\\/:*?"<>|\x00-\x1f]{1,120}\.(png|jpe?g|webp)$/i;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const MAX_FILES = 60;
const MAX_BYTES = 8 * 1024 * 1024;
const ATLAS = 256;
const THUMB = 48;

function listTextures(dir, nativeImage = null) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((e) => e.isFile() && NAME.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .slice(0, MAX_FILES);
  return names.map((name) => ({ name, label: name.replace(/\.[^.]+$/, ""), thumb: thumbnail(dir, name, nativeImage) }));
}

function fileOf(dir, name) {
  if (typeof name !== "string" || !NAME.test(name)) return null;
  const file = resolveInside(dir, name);
  if (!file) return null;
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && stat.size <= MAX_BYTES ? file : null;
  } catch {
    return null;
  }
}

// The texture as a data URL the game can load, or null.
function textureDataUrl(dir, name, nativeImage = null) {
  const file = fileOf(dir, name);
  if (!file) return null;
  if (nativeImage) {
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) {
      const { width, height } = image.getSize();
      return (width > ATLAS || height > ATLAS ? image.resize({ width: ATLAS, height: ATLAS, quality: "best" }) : image).toDataURL();
    }
  }
  // WebP (nativeImage can't read it) goes as it is.
  return `data:${MIME[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(file).toString("base64")}`;
}

function thumbnail(dir, name, nativeImage) {
  if (!nativeImage) return null;
  const file = fileOf(dir, name);
  if (!file) return null;
  const image = nativeImage.createFromPath(file);
  return image.isEmpty() ? null : image.resize({ width: THUMB, height: THUMB, quality: "good" }).toDataURL();
}

module.exports = { listTextures, textureDataUrl, NAME };
