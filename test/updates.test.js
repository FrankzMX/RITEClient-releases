"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const { Updates } = require("../src/main/updates");

function fakeUpdater() {
  const u = new EventEmitter();
  u.checks = 0;
  u.installs = 0;
  u.checkForUpdates = async () => void u.checks++;
  u.quitAndInstall = () => void u.installs++;
  return u;
}

test("download progress reaches the page and the restart only works once it's ready", () => {
  const updater = fakeUpdater();
  const sent = [];
  const updates = new Updates({ updater, send: (s) => sent.push(s) });
  updates.check({ beta: true });
  assert.strictEqual(updater.allowPrerelease, true);
  assert.strictEqual(updater.checks, 1);

  updater.emit("update-available", { version: "0.1.0-beta.2" });
  updater.emit("download-progress", { percent: 41.6 });
  assert.deepStrictEqual(sent.at(-1), { status: "downloading", version: "0.1.0-beta.2", percent: 42 });
  updates.install();
  assert.strictEqual(updater.installs, 0);

  updater.emit("update-downloaded", { version: "0.1.0-beta.2" });
  assert.strictEqual(updates.state.status, "ready");
  updates.install();
  assert.strictEqual(updater.installs, 1);
});

test("a failed download goes back to idle without bothering the player", () => {
  const updater = fakeUpdater();
  const updates = new Updates({ updater, send: () => {} });
  updater.emit("update-available", { version: "1.0.0" });
  updater.emit("error", new Error("offline"));
  assert.strictEqual(updates.state.status, "idle");
});
