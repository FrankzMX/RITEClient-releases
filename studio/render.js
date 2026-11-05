// Página sin ventana para kirka-render.cjs: dibuja un proyecto cuadro por cuadro.
import { crearMotor } from "./motor.js";
import { componer, cargarFuentes } from "./capas.js";
import { posCamara } from "./camara.js";
import { normalizar, tamanoSalida } from "./proyecto.js";

const Q = new URLSearchParams(location.search);
// Solo archivos de este mismo servidor (lo usa el CLI en 127.0.0.1).
const local = (u) => { const url = new URL(u, location.href); if (url.origin !== location.origin) throw new Error("origen"); return url; };
const p = normalizar(await (await fetch(local(Q.get("cfg")))).json());
const mapa = typeof p.mapa === "string" ? await (await fetch(local(p.mapa))).json() : p.mapa;
const [W, H] = p.salida.ancho ? [p.salida.ancho, p.salida.alto] : tamanoSalida(p.salida);
const salida = document.getElementById("salida");
salida.width = W; salida.height = H;
const ctx = salida.getContext("2d");
const motor = await crearMotor();
motor.cargar(mapa, p.escena);
await motor.ponerObjetos(p.objetos || []);
motor.ayudantes(false);
motor.tamano(W, H);
motor.calidad(!!p.salida.maxima, W, H);
await cargarFuentes(p.fuentes);
const claves = p.camara.claves;
const duracion = claves.length > 1 ? p.camara.duracion : 0;
window.cuadro = (t = 0) => {
  motor.animar(t);
  motor.poner(claves.length ? posCamara(p.camara, t) : p.camara.fija || motor.vistaGeneral(), claves.length ? p.camara.seguir : null);
  componer(ctx, motor.dibujar(), p, t, W, H, { duracion, fps: p.salida.fps });
};
window.INFO = { duracion: duracion || 0, fps: p.salida.fps, caja: [motor.mapa.caja.min.toArray(), motor.mapa.caja.max.toArray()] };
window.cuadro(+(Q.get("t") || 0));
window.MOTOR = motor;
window.LISTO = true;
