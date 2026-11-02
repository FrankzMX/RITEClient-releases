// El motor 3D: un mapa de Kirka con sus texturas, su luz, su cielo y su niebla,
// más los objetos del estudio, el sol con sombras y el desenfoque.
// Lo usan el estudio (estudio.js) y la página sin ventana del CLI (render.js).
import { crearParticulas } from "./particulas.js";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { leerChunks, cortar, construirMapa, ajustesLuz } from "./mapa.js";
import { AMBIENTES } from "./proyecto.js";
import { crearObjeto, forma, transformar, ESTUDIO, ponerEntorno } from "./objetos.js";
import { TILES_RECORTE } from "./bloques.js";

// Carga el atlas y le pone transparencia real: opaco en todos lados, menos el
// negro puro de los cuadros de hojas, plantas, vidrio, etc. (ver TILES_RECORTE).
async function atlasConRecorte(url) {
  const img = await new THREE.ImageLoader().loadAsync(url);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const datos = ctx.getImageData(0, 0, c.width, c.height), px = datos.data, lado = c.width / 16;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4, tile = Math.floor(y / lado) * 16 + Math.floor(x / lado);
    const negro = px[i] < 8 && px[i + 1] < 8 && px[i + 2] < 8;
    px[i + 3] = TILES_RECORTE.has(tile) && negro ? 0 : 255;
  }
  ctx.putImageData(datos, 0, 0);
  return c;
}

export async function crearMotor(base = "") {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 3000);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bokeh = new BokehPass(scene, cam, { focus: 20, aperture: 0.002, maxblur: 0.01 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  // Contornos y auras: una pasada por cada color distinto (hasta 4). «contorno» es
  // una línea fina; «aura» es un brillo ancho alrededor (sale con el resplandor).
  const contornos = [0, 1, 2, 3].map(() => {
    const c = new OutlinePass(new THREE.Vector2(256, 256), scene, cam);
    c.enabled = false; composer.addPass(c); return c;
  });
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.02);
  composer.addPass(bloom);
  // Reflejos para los acabados brillantes y metálicos de los personajes.
  const pmrem = new THREE.PMREMGenerator(renderer);
  ponerEntorno(pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture);
  composer.addPass(new OutputPass());

  const ambiente = new THREE.AmbientLight(0xffffff, 1);
  const sol = new THREE.DirectionalLight(0xffffff, 0);
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0006;
  sol.shadow.normalBias = 0.02;
  Object.assign(sol.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
  scene.add(ambiente, sol, sol.target);
  const grupoObjetos = new THREE.Group();
  scene.add(grupoObjetos);

  const atlas = new THREE.CanvasTexture(await atlasConRecorte(base + "atlas.png"));
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestMipmapNearestFilter;
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();

  let mapa = null, json = null, clave = "", escenaAct = {};
  const vivos = new Map(); // id → { o, forma }
  const particulas = crearParticulas(THREE, scene);
  let tAct = 0;
  const dirSol = new THREE.Vector3(-0.5, 0.8, 0.3);
  const m = {
    renderer, scene, cam, atlas, THREE, grupoObjetos,
    get mapa() { return mapa; },
    get json() { return json; },
    // Carga (o recarga si cambiaron los cortes o los bloques ocultos) el mapa.
    cargar(j, escena = {}) {
      const nueva = JSON.stringify([escena.cortes || [], escena.ocultar || []]);
      if (j === json && nueva === clave && mapa) return m.ajustar(escena);
      json = j; clave = nueva;
      if (mapa) { scene.remove(mapa.mesh); mapa.liberar(); }
      const chunks = leerChunks(j, escena.ocultar || []);
      for (const c of escena.cortes || []) cortar(chunks, c);
      mapa = construirMapa(chunks, ajustesLuz(j));
      mapa.ponerAtlas(atlas);
      scene.add(mapa.mesh);
      m.ajustar(escena);
    },
    // Luz, cielo, niebla, sol, sombras y desenfoque. Sin rearmar la malla.
    ajustar(escena = {}) {
      if (!json) return;
      escenaAct = escena;
      const amb = AMBIENTES[escena.ambiente] || AMBIENTES.mapa;
      const base = ajustesLuz(json, amb.luz || {});
      const k = (v) => Math.pow(2, v || 0); // los sliders van de -1 a 1
      const L = { ...base, luz: base.luz * k(escena.claridad), luzBloques: base.luzBloques * k(escena.lamparas), brilloLuces: 1.7 * k(escena.lamparas) };
      // Luz ambiente para los objetos: la del cielo del mapa (sin lámparas).
      const tinte = new THREE.Color(L.tinte);
      const nivel = Math.max(0.04, L.luz * L.brillo * (L.interior + (1 - L.interior) * 0.85));
      ambiente.color.copy(tinte); ambiente.intensity = nivel;
      mapa.colorear(L, [Math.max(0.02, tinte.r * nivel), Math.max(0.02, tinte.g * nivel), Math.max(0.02, tinte.b * nivel)]);
      const cielo = escena.cielo || amb.cielo || json.skyboxColor___DATA || "#87b5e6";
      scene.background = new THREE.Color(cielo);
      const nc = amb.niebla?.color || json.fogColor___DATA || cielo;
      const cerca = amb.niebla?.cerca ?? json.fogNear___DATA ?? 60, lejos = amb.niebla?.lejos ?? json.fogFar___DATA ?? 250;
      const d = k(-(escena.niebla || 0) * 1.5);
      scene.fog = escena.niebla <= -1 ? null : new THREE.Fog(nc, cerca * d, lejos * d);
      bloom.strength = escena.resplandor <= -1 ? 0 : 0.55 * k((escena.resplandor || 0) * 1.6);
      // Sol: dirección del mapa (o del ambiente) y color cálido o frío.
      dirSol.set(...L.sol).normalize();
      if (escena.altura != null) { const a = (escena.altura * Math.PI) / 2.2, h = Math.hypot(dirSol.x, dirSol.z) || 1; dirSol.set((dirSol.x / h) * Math.cos(a), Math.sin(a), (dirSol.z / h) * Math.cos(a)); }
      sol.color.set(escena.colorSol || (L.luz < 0.3 ? "#9fb4ff" : "#ffe3c0"));
      sol.intensity = (escena.sol || 0) * 2.2;
      sol.castShadow = !!escena.sombras && sol.intensity > 0;
      // Luz de estudio para los personajes: contraluz y relleno.
      ESTUDIO.rim.value = Math.max(0, escena.contraluz || 0);
      ESTUDIO.rimColor.value.set(escena.colorContraluz || "#bcd7ff");
      ESTUDIO.relleno.value = Math.max(0, escena.relleno || 0) * 0.6;
      bokeh.enabled = (escena.desenfoque || 0) > 0.01;
      bokeh.uniforms.aperture.value = (escena.desenfoque || 0) * 0.012;
      bokeh.uniforms.maxblur.value = 0.004 + (escena.desenfoque || 0) * 0.014;
    },
    // Pone, cambia o quita objetos según la lista del proyecto.
    async ponerObjetos(lista = []) {
      const ids = new Set(lista.map((d) => d.id));
      for (const [id, v] of vivos) if (!ids.has(id)) { grupoObjetos.remove(v.o); vivos.delete(id); }
      for (const d of lista) {
        const f = forma(d), v = vivos.get(d.id);
        if (v && v.forma === f) { v.o.userData.desc = d; continue; }
        const o = await crearObjeto(d, atlas);
        if (v) grupoObjetos.remove(v.o);
        o.userData.id = d.id;
        vivos.set(d.id, { o, forma: f });
        grupoObjetos.add(o);
      }
      // Contornos y auras, agrupados por color.
      const grupos = new Map();
      for (const d of lista) {
        if (!vivos.get(d.id)) continue;
        if (d.contorno) { const k = "c" + d.contorno; if (!grupos.has(k)) grupos.set(k, { color: d.contorno, aura: false, objs: [] }); grupos.get(k).objs.push(vivos.get(d.id).o); }
        if (d.aura) { const k = "a" + d.aura; if (!grupos.has(k)) grupos.set(k, { color: d.aura, aura: true, objs: [] }); grupos.get(k).objs.push(vivos.get(d.id).o); }
      }
      const lg = [...grupos.values()];
      contornos.forEach((c, i) => {
        const gr = lg[i];
        c.enabled = !!gr;
        if (!gr) { c.selectedObjects = []; return; }
        c.selectedObjects = gr.objs;
        Object.assign(c, gr.aura ? { edgeStrength: 3.5, edgeGlow: 1, edgeThickness: 2.5, pulsePeriod: 0 } : { edgeStrength: 4, edgeGlow: 0, edgeThickness: 1.2, pulsePeriod: 0 });
        c.visibleEdgeColor.set(gr.color); c.hiddenEdgeColor.set(gr.color).multiplyScalar(gr.aura ? 0.5 : 0.25);
      });
    },
    // Calidad máxima para fotos y videos: dibuja al doble y lo achica (bordes
    // limpios) y sombras más finas.
    calidad(alta, w = 1920, h = 1080) {
      // Hasta el doble, sin pasar de lo que pesa un 4K.
      const k = alta ? Math.round(Math.max(1, Math.min(2, Math.sqrt((3840 * 2160) / (w * h)))) * 4) / 4 : 1;
      if (renderer.getPixelRatio() === k) return;
      renderer.setPixelRatio(k); composer.setPixelRatio(k);
      sol.shadow.mapSize.set(alta ? 4096 : 2048, alta ? 4096 : 2048);
      sol.shadow.map?.dispose(); sol.shadow.map = null;
    },
    objeto: (id) => vivos.get(id)?.o,
    animar(t, saltar = null) { tAct = t; for (const [id, v] of vivos) if (id !== saltar) transformar(v.o, v.o.userData.desc, t); },
    // Ayudantes (focos de las luces, flechas) solo en el estudio.
    ayudantes(ver) { grupoObjetos.traverse((o) => { if (o.userData.ayudante) o.visible = ver; }); },
    tamano(w, h) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      for (const c of contornos) c.resolution?.set(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    },
    // seguir: id de un objeto al que la cámara no deja de mirar.
    poner(c, seguir = null) {
      cam.position.set(...c.pos);
      cam.fov = c.fov ?? 55;
      cam.updateProjectionMatrix();
      cam.up.set(0, 1, 0);
      const obj = seguir && vivos.get(seguir)?.o;
      if (obj) { obj.updateMatrixWorld(true); const p = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()); cam.lookAt(p); }
      else cam.lookAt(...c.mira);
      if (c.giro) cam.rotateZ((c.giro * Math.PI) / 180);
      cam.updateMatrixWorld();
      // La sombra del sol cubre lo que tienes enfrente.
      const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(25).add(cam.position);
      sol.target.position.copy(frente);
      sol.position.copy(frente).addScaledVector(dirSol, 150);
      sol.target.updateMatrixWorld();
      if (bokeh.enabled) {
        const o = escenaAct.enfoqueId && vivos.get(escenaAct.enfoqueId)?.o;
        bokeh.uniforms.focus.value = o ? cam.position.distanceTo(o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0))) : m.distanciaCentro();
      }
    },
    // Qué tan lejos está lo que hay en el centro de la imagen (para enfocar).
    distanciaCentro() {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      let mejor = m.rayoMapa(cam.position, dir, 300);
      const ray = new THREE.Raycaster(cam.position, dir, 0.1, mejor);
      const hit = ray.intersectObjects(grupoObjetos.children, true).find((h) => h.object.visible && !h.object.userData.ayudante);
      if (hit) mejor = hit.distance;
      return mejor;
    },
    // Recorre los bloques en línea recta y devuelve la distancia al primero sólido.
    rayoMapa(o, d, max = 300) {
      if (!mapa) return max;
      let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
      const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
      const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
      let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
      let t = 0;
      while (t < max) {
        if (mapa.solido(x, y, z) || (mapa.bloque(x, y, z) && t > 0.5)) return t;
        if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
      }
      return max;
    },
    dibujar() {
      particulas.actualizar(escenaAct.particulas, tAct, cam, renderer.domElement.height, (id) => vivos.get(id)?.o);
      composer.render(); return renderer.domElement;
    },
    // Encuadre inicial: desde una esquina alta, viendo el centro.
    vistaGeneral() {
      const caja = mapa.caja, c = caja.getCenter(new THREE.Vector3()), s = caja.getSize(new THREE.Vector3());
      const r = Math.min(Math.max(s.x, s.z) * 0.75, (scene.fog?.far ?? 400) * 0.7);
      return { pos: [c.x + r * 0.7, Math.max(c.y, caja.min.y + s.y * 0.3) + r * 0.55, c.z - r * 0.7], mira: [c.x, caja.min.y + s.y * 0.25, c.z], fov: 50 };
    },
  };
  return m;
}
