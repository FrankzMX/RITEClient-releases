"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

// Local relay for RITE Repetición (private script, tools/visor/src/repeticion/).
// Kirka's game only accepts a real browser WebSocket for a match, so the
// replay can't be a fake object in the page. Instead the game connects here
// (ws://127.0.0.1:PORT/game) and the script, connected as /ctl, pushes the
// recorded frames: each binary message from /ctl is [8-byte time, frame];
// the relay sends the frame to /game at that time (Date.now() ms, 0 = now),
// always in the order received, and what the game sends is dropped. The page
// sends a little ahead and the relay keeps the timing, because the page's own
// timers fall behind while the game draws, and frames arriving in bunches
// make players jump. It only listens on this computer and only takes
// connections from kirka.io pages. Nothing reaches Kirka's servers.

const PORT = 47831;
// Bumped when what /ctl sends changes; the script checks it.
const RELAY_VERSION = 2;
const GAME_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*kirka\.io$/;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
  return Buffer.concat([head, payload]);
}

// One WebSocket connection: emits whole messages, sends binary/text.
class Peer {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.parts = [];
    this.closed = false;
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.parse(onMessage);
    });
    const end = () => {
      if (this.closed) return;
      this.closed = true;
      onClose();
    };
    socket.on("close", end);
    socket.on("error", end);
  }
  parse(onMessage) {
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = b[0] & 0x80;
      const opcode = b[0] & 0x0f;
      const masked = b[1] & 0x80;
      let len = b[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2));
        at = 10;
      }
      const maskAt = at;
      if (masked) at += 4;
      if (b.length < at + len) return;
      const payload = Buffer.from(b.subarray(at, at + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= b[maskAt + (i & 3)];
      this.buffer = b.subarray(at + len);
      if (opcode === 0x8) return this.close();
      if (opcode === 0x9) {
        this.write(frame(0xa, payload));
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode !== 0) this.opcode = opcode;
      this.parts.push(payload);
      if (fin) {
        const data = Buffer.concat(this.parts);
        this.parts = [];
        onMessage(data, this.opcode === 0x1);
      }
    }
  }
  write(buf) {
    if (!this.closed) this.socket.write(buf);
  }
  send(data, text = false) {
    this.write(frame(text ? 0x1 : 0x2, Buffer.isBuffer(data) ? data : Buffer.from(data)));
  }
  close() {
    if (this.closed) return;
    this.write(frame(0x8, Buffer.from([0x03, 0xe8])));
    this.socket.end();
  }
}

function startReplayRelay({ port = PORT, log = () => {}, onSend = null } = {}) {
  let ctl = null;
  let game = null;
  // Frames waiting for their time, in order.
  let queue = [];
  let timer = null;
  const pump = () => {
    clearTimeout(timer);
    timer = null;
    const now = Date.now();
    while (queue.length && queue[0].at <= now) {
      const { data } = queue.shift();
      onSend?.(data);
      game?.send(data);
    }
    if (queue.length) timer = setTimeout(pump, Math.max(0, queue[0].at - Date.now()));
  };
  const enqueue = (data) => {
    if (data.length < 8) return;
    queue.push({ at: data.readDoubleBE(0), data: data.subarray(8) });
    if (queue.length === 1) pump();
  };
  const rush = () => {
    for (const item of queue) game?.send(item.data);
    queue = [];
    pump();
  };
  const server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  server.on("upgrade", (req, socket) => {
    const origin = req.headers.origin ?? "";
    const role = new URL(req.url, "http://x").pathname.replace(/^\//, "");
    const key = req.headers["sec-websocket-key"];
    if (!GAME_ORIGIN.test(origin) || !key || (role !== "ctl" && role !== "game")) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    if (role === "ctl") {
      ctl?.close();
      const me = new Peer(socket, (data, text) => {
        // Text from the script is for the relay; binary goes to the game.
        if (text) {
          const command = data.toString();
          if (command === "close") game?.close();
          else if (command === "rush") rush();
          return;
        }
        enqueue(data);
      }, () => {
        if (ctl === me) ctl = null;
        queue = [];
        game?.close();
      });
      ctl = me;
      me.send(`relay-version ${RELAY_VERSION}`, true);
      log("replay: control connected");
    } else {
      game?.close();
      const me = new Peer(socket, () => {}, () => {
        if (game === me) game = null;
        ctl?.send("game-closed", true);
      });
      game = me;
      ctl?.send("game-open", true);
      log("replay: game connected");
    }
  });
  server.on("error", (error) => log(`replay relay: ${error.message}`));
  server.listen(port, "127.0.0.1");
  return { server, close: () => server.close() };
}

module.exports = { startReplayRelay, REPLAY_PORT: PORT, RELAY_VERSION };
