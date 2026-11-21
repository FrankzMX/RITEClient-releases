"use strict";

// Sala RITE de respaldo: cuando RITE ARBITRO no puede armar un scrim, el cliente
// crea la misma sala que él (mapa competitivo + script RITE Competitivo) desde una
// ventana escondida, como invitado:
//   EDITOR → IMPORT (pega mapa + script) → TEST MODE → link de INVITE → espectador.
// La ventana del jugador entra a la sala como cualquiera.
//
// Los mapas y el script son privados de RITE: llegan cifrados por el servidor de
// licencias (módulo de datos «rite-salas»), se descifran solo en memoria y solo se
// cargan en esta ventana, que no se ve, no tiene herramientas de desarrollador y
// usa una sesión aparte que se tira al cerrar. Nada de eso queda en disco.
//
// Al terminar el juego, el script le manda al dueño (esta ventana, de espectador)
// una línea por jugador (RITE1|…) y una de resumen; con eso sale el marcador.
//
// @author FRANKZ

const KIRKA = "https://kirka.io/";
const MAX_MS = 100 * 60 * 1000; // la sala se suelta sola a los 100 min
const FPS = 4; // solo mira: con pocos cuadros gasta poco (importante en PCs de bajo nivel)

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// msgpack mínimo (solo leer), el mismo del árbitro.
function unpack(u8, start) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const dec = new TextDecoder();
  let i = start;
  const bytes = (n) => {
    const v = u8.subarray(i, i + n);
    i += n;
    return v;
  };
  const str = (n) => dec.decode(bytes(n));
  const arr = (n) => Array.from({ length: n }, () => read());
  const map = (n) => {
    const o = {};
    for (let k = 0; k < n; k++) {
      const key = read();
      o[key] = read();
    }
    return o;
  };
  function read() {
    const b = u8[i++];
    if (b < 0x80) return b;
    if (b < 0x90) return map(b & 15);
    if (b < 0xa0) return arr(b & 15);
    if (b < 0xc0) return str(b & 31);
    if (b >= 0xe0) return b - 256;
    let n;
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: n = u8[i]; i += 1; return bytes(n);
      case 0xc5: n = dv.getUint16(i); i += 2; return bytes(n);
      case 0xca: n = dv.getFloat32(i); i += 4; return n;
      case 0xcb: n = dv.getFloat64(i); i += 8; return n;
      case 0xcc: return u8[i++];
      case 0xcd: n = dv.getUint16(i); i += 2; return n;
      case 0xce: n = dv.getUint32(i); i += 4; return n;
      case 0xd0: n = dv.getInt8(i); i += 1; return n;
      case 0xd1: n = dv.getInt16(i); i += 2; return n;
      case 0xd2: n = dv.getInt32(i); i += 4; return n;
      case 0xd9: n = u8[i]; i += 1; return str(n);
      case 0xda: n = dv.getUint16(i); i += 2; return str(n);
      case 0xdb: n = dv.getUint32(i); i += 4; return str(n);
      case 0xdc: n = dv.getUint16(i); i += 2; return arr(n);
      case 0xde: n = dv.getUint16(i); i += 2; return map(n);
    }
    throw new Error("msgpack " + b);
  }
  return read();
}

/** Aviso del juego {de, texto} de un mensaje binario del WebSocket (13/2), o null. */
function aviso(buf) {
  if (!buf || buf.length < 3 || buf[0] !== 13 || buf[1] !== 2) return null;
  try {
    const [de, texto] = Object.values(unpack(new Uint8Array(buf), 2));
    return typeof texto === "string" ? { de: String(de), texto } : null;
  } catch {
    return null;
  }
}

/**
 * Resultado de las líneas del script (igual que el árbitro):
 *   RITE1|<partida>|<i>/<n>|nombre|equipo|K|M|A|HS|daño|pts|…|gano
 *   RITE1|<partida>|fin|modo|tam|meta|ganador|azul|rojo|segundos|mapa|version
 */
function resultadoRite(lineas, partida) {
  const de = lineas.map((l) => l.split("|")).filter((c) => c[0] === "RITE1" && c[1] === partida);
  const fin = de.find((c) => c[2] === "fin");
  if (!fin) return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const jugadores = de.filter((c) => /^\d+\/\d+$/.test(c[2])).map((c) => ({ nombre: c[3], equipo: c[4], k: n(c[5]), d: n(c[6]) }));
  return {
    ganador: fin[6] === "blue" || fin[6] === "red" ? fin[6] : "empate",
    azul: n(fin[7]),
    rojo: n(fin[8]),
    segundos: Math.round(n(fin[9])),
    rojos: jugadores.filter((j) => j.equipo === "red").map((j) => j.nombre),
    azules: jugadores.filter((j) => j.equipo === "blue").map((j) => j.nombre),
    jugadores,
  };
}

/** Modo del bot («2v2-point», «1v1», …) → formato del script. */
function juegoDe(mode, meta) {
  if (mode === "1v1") return { modo: "duelo", tam: 1, meta: meta || 15 };
  const k = String(mode || "").match(/^(\d)v\d-(point|tdm)$/);
  if (!k) return null;
  const metas = { point: { 2: 60, 3: 100 }, tdm: { 2: 50, 3: 75 } };
  return { modo: k[2], tam: Number(k[1]), meta: meta || metas[k[2]][k[1]] || 60 };
}

/** El EXPORT a importar: el mapa del paquete con el script adentro. null si no está. */
function exportDe(paquete, mapa) {
  const id = String(mapa || "").trim().toLowerCase();
  const m = paquete?.mapas?.[id];
  if (!m || typeof paquete.script !== "string") return null;
  return JSON.stringify({ ...m, script___DATA: paquete.script });
}

// Lo que corre dentro de la página escondida, antes de Kirka: guarda los WebSocket
// (para mandar chat 13/6 como el árbitro), baja los cuadros y fija la región.
function gancho(region, fps) {
  const os = WebSocket.prototype.send;
  window.__riteWs = [];
  WebSocket.prototype.send = function (d) {
    if (!window.__riteWs.includes(this)) window.__riteWs.push(this);
    return os.call(this, d);
  };
  window.__riteSala = () => {
    const ws = window.__riteWs.filter((w) => w.readyState === 1 && !/LobbyRoom/i.test(w.url || ""));
    return ws[ws.length - 1] || null;
  };
  window.__riteChat = (t) => {
    const ws = window.__riteSala();
    if (!ws) return false;
    const e = new TextEncoder().encode(t);
    let b;
    if (e.length < 32) {
      b = new Uint8Array(3 + e.length);
      b[0] = 13; b[1] = 6; b[2] = 0xa0 | e.length; b.set(e, 3);
    } else {
      b = new Uint8Array(4 + e.length);
      b[0] = 13; b[1] = 6; b[2] = 0xd9; b[3] = e.length; b.set(e, 4);
    }
    ws.send(b.buffer);
    return true;
  };
  try {
    localStorage.setItem("region", region);
  } catch {}
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  let ultimo = 0, n = 0;
  const vivos = new Map();
  window.__riteFps = 0;
  window.requestAnimationFrame = (cb) => {
    const f = window.__riteFps || 0;
    const id = ++n, h = {};
    vivos.set(id, h);
    const correr = () => { h.r = raf((t) => { vivos.delete(id); ultimo = performance.now(); cb(t); }); };
    const falta = f ? 1000 / f - (performance.now() - ultimo) : 0;
    if (falta > 1) h.t = setTimeout(correr, falta);
    else correr();
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const h = vivos.get(id);
    if (!h) return;
    clearTimeout(h.t);
    if (h.r) caf(h.r);
    vivos.delete(id);
  };
  window.__riteFpsLuego = fps;
}

class SalaRite {
  /**
   * @param {object} o
   * @param {typeof import("electron").BrowserWindow} o.BrowserWindow
   * @param {string} o.userAgent el de la ventana del jugador (Kirka lo espera de escritorio)
   * @param {(...a: unknown[]) => void} [o.log]
   */
  constructor({ BrowserWindow, userAgent = "", log = () => {} }) {
    this.BrowserWindow = BrowserWindow;
    this.userAgent = userAgent;
    this.log = log;
    this.win = null;
    this.lineas = [];
    this.vistas = new Set();
    this.link = null;
    this.alFinal = null;
    this.timer = null;
  }

  get abierta() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  js(code) {
    return this.win.webContents.executeJavaScript(code, true);
  }

  clic(texto) {
    return this.js(`(() => { const l = [...document.querySelectorAll("div,button,span")].filter((e) => e.offsetParent && e.textContent.trim() === ${JSON.stringify(texto)}); const b = l.pop(); if (b) { b.click(); return true; } return false; })()`);
  }

  visible(texto) {
    return this.js(`[...document.querySelectorAll("div,button,span")].some((e) => e.offsetParent && e.textContent.trim() === ${JSON.stringify(texto)})`);
  }

  async esperarTexto(texto, ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (await this.visible(texto).catch(() => false)) return true;
      await espera(400);
    }
    return false;
  }

  // Tecla para Kirka, como la manda Playwright (CDP Input.dispatchKeyEvent): llega
  // aunque la ventana escondida no tenga foco.
  async tecla(key) {
    const dbg = this.win.webContents.debugger;
    const una = key.length === 1;
    const base = {
      key,
      code: una ? `Key${key.toUpperCase()}` : key,
      windowsVirtualKeyCode: una ? key.toUpperCase().charCodeAt(0) : key === "Escape" ? 27 : 0,
    };
    await dbg.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(una ? { text: key } : {}) }).catch(() => {});
    await dbg.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", ...base }).catch(() => {});
  }

  decir(texto) {
    return this.js(`window.__riteChat(${JSON.stringify(String(texto).slice(0, 200))})`).catch(() => false);
  }

  _mensaje(params) {
    if (params?.response?.opcode !== 2) return;
    const a = aviso(Buffer.from(params.response.payloadData || "", "base64"));
    if (!a || a.de !== "SERVER" || !a.texto.startsWith("RITE1|")) return;
    this.lineas.push(a.texto);
    if (this.lineas.length > 400) this.lineas.splice(0, 200);
    const fin = a.texto.match(/^RITE1\|([^|]+)\|fin\|/);
    if (!fin || this.vistas.has(fin[1])) return;
    this.vistas.add(fin[1]);
    const r = resultadoRite(this.lineas, fin[1]);
    if (r) {
      this.log("final", r.ganador, `${r.rojo}-${r.azul}`);
      Promise.resolve(this.alFinal?.(r)).catch(() => {});
    }
  }

  /**
   * Crea la sala. Devuelve el link (kirka.io/games/<REGION>~<sala>).
   * @param {{ exportJson: string, region?: string, juego: {modo: string, tam: number, meta: number}, alFinal?: (r: object) => void }} o
   */
  async crear({ exportJson, region = "NA", juego, alFinal }) {
    if (this.abierta) throw new Error("Ya hay una sala RITE abierta");
    this.alFinal = alFinal;
    this.win = new this.BrowserWindow({
      show: false,
      paintWhenInitiallyHidden: true,
      width: 1100,
      height: 720,
      webPreferences: {
        // Sesión aparte en memoria: entra como invitado y no toca la cuenta del jugador.
        partition: `rite-sala-${Date.now()}`,
        backgroundThrottling: false,
        devTools: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const wc = this.win.webContents;
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    if (this.userAgent) wc.setUserAgent(this.userAgent);
    wc.setFrameRate?.(15);
    this.timer = setTimeout(() => this.cerrar(), MAX_MS);
    try {
      // El depurador solo responde con una página cargada: primero una en blanco.
      await this.win.loadURL("about:blank");
      const dbg = wc.debugger;
      dbg.attach("1.3");
      dbg.on("message", (_e, metodo, params) => {
        if (metodo === "Network.webSocketFrameReceived") this._mensaje(params);
      });
      await dbg.sendCommand("Network.enable");
      await dbg.sendCommand("Page.enable");
      await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `(${gancho.toString()})(${JSON.stringify(region)}, ${FPS});` });

      this.log("cargando kirka.io");
      await this.win.loadURL(KIRKA);
      if (!(await this.esperarTexto("EDITOR", 40000))) throw new Error("Kirka no cargó");
      await espera(6000);

      this.log("abriendo el editor");
      let editor = false;
      for (let i = 0; i < 3 && !editor; i++) {
        await this.clic("EDITOR");
        editor = await this.esperarTexto("CONTINUE", 20000);
      }
      if (!editor) throw new Error("el editor no abrió");
      await espera(1500);
      // CONTINUE y luego «f» abre el menú del editor (IMPORT). Sin foco la tecla no llega.
      let menu = false;
      for (let i = 0; i < 4 && !menu; i++) {
        await this.clic("CONTINUE");
        await espera(1200);
        await this.tecla("f");
        menu = await this.esperarTexto("IMPORT", 4000);
      }

      this.log("importando");
      if (!menu || !(await this.clic("IMPORT"))) throw new Error("no encontré IMPORT");
      await espera(1000);
      const ok = await this.js(`(() => {
        const i = [...document.querySelectorAll("input")].filter((e) => e.offsetParent && e.placeholder === "Enter code...").pop();
        if (!i) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(exportJson)});
        i.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error("no encontré la caja de IMPORT");
      await espera(600);
      await this.clic("IMPORT AS NEW");
      // «Importing chunk #n» y luego «Mode saved».
      await this.esperarTexto("Mode saved", 60000);
      await espera(1500);

      this.log("TEST MODE");
      const antes = this.win.webContents.getURL();
      let entro = false;
      for (let intento = 0; intento < 3 && !entro; intento++) {
        if (!(await this.clic("TEST MODE").catch(() => false))) {
          await this.tecla("f");
          await espera(1200);
          await this.clic("TEST MODE").catch(() => false);
        }
        for (let i = 0; i < 90 && !entro; i++) {
          await espera(500);
          const url = this.win.webContents.getURL();
          entro = /\/games\//.test(url) && url !== antes;
        }
      }
      if (!entro) throw new Error("TEST MODE no abrió la sala");
      await espera(4000);
      const u = this.win.webContents.getURL().match(/\/games\/([A-Z]+~[\w-]+)/i);
      if (!u) throw new Error("no pude sacar el link de la sala");
      this.link = `https://kirka.io/games/${u[1]}`;

      // Espectador: no ocupa lugar de jugador y el script le habla solo a él.
      await this.tecla("Escape");
      await espera(1200);
      if (!(await this.clic("SPECTATE"))) {
        await this.tecla("Escape");
        await espera(1000);
        await this.clic("SPECTATE");
      }
      await espera(1200);
      await this.clic("CONFIRM");
      await espera(1500);
      await this.decir(`!rite formato ${juego.modo} ${juego.tam} ${juego.meta}`);
      await this.js("window.__riteFps = window.__riteFpsLuego; true").catch(() => {});
      wc.setFrameRate?.(FPS);
      this.log("sala lista", this.link);
      return this.link;
    } catch (error) {
      this.cerrar();
      throw error;
    }
  }

  cerrar() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.abierta) {
      try {
        this.win.webContents.debugger.detach();
      } catch {}
      this.win.destroy();
    }
    this.win = null;
    this.alFinal = null;
  }
}

module.exports = { SalaRite, aviso, unpack, resultadoRite, juegoDe, exportDe };
