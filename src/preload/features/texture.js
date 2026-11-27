"use strict";

// Kirka's own "custom block texture" setting lives in localStorage. The client
// writes it before the game reads it, and only removes a value it wrote itself,
// so a texture the player set inside Kirka is never lost.

const KEY = "SETTINGS___SETTING/BLOCKS___SETTING/TEXTURE_URL___SETTING";
const MARK = "rite-client:block-texture";

const PACKS = {
  "rite-dark": "textures/rite-dark.png",
};

// `fileUrl(name)`: data URL of a texture saved in Documentos/RITEClient/texturas.
function textureValue(settings, dataUrl, fileUrl = () => null) {
  if (PACKS[settings.blockTexture]) return dataUrl(PACKS[settings.blockTexture]);
  if (settings.blockTexture === "custom" && settings.customTextureUrl) return settings.customTextureUrl;
  if (settings.blockTexture === "file" && settings.blockTextureFile) return fileUrl(settings.blockTextureFile) || null;
  return null;
}

// Returns the texture now in effect (null = Kirka's own or the player's).
function applyBlockTexture(storage, settings, dataUrl, fileUrl) {
  const value = textureValue(settings, dataUrl, fileUrl);
  const written = storage.getItem(MARK);
  if (value) {
    // Only when it changed: a data URL is big and localStorage writes go to disk.
    const json = JSON.stringify(value);
    if (storage.getItem(KEY) !== json) storage.setItem(KEY, json);
    if (written !== json) storage.setItem(MARK, json);
  } else if (written !== null) {
    if (storage.getItem(KEY) === written) storage.removeItem(KEY);
    storage.removeItem(MARK);
  }
  return value;
}

module.exports = { applyBlockTexture, textureValue, KEY, MARK, PACKS };
