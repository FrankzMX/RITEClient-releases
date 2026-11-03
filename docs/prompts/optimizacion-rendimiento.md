# Claude: optimización de rendimiento de RITE Client

Objetivo: que el cliente corra lo más fluido posible en PCs débiles (más FPS, menos lag y latencia, menos CPU/RAM/GPU) **sin perder** la integración con el bot de Discord ni el tema RITE. Trabaja sobre esta rama. Haz commits pequeños por bloque. Pruebas mínimas: el dueño quiere ahorrar recursos.

## 1. Entrar a la partida sin recargar (prioridad máxima)
- `src/preload/features/lobby.js` (`join()`, ~L419-431): la verificación de 8 s compara `location.href.startsWith(url)` y falla aunque el join dentro de Kirka sí funcionó, así que cae en `api.scrimsJoin` → `getWindow().loadURL()` (`src/main/ipc.js` ~L162-165), que es una recarga completa.
  - Confirmar el éxito con el store de Kirka (id de sala de `K.match`, `snap().id`, o `entering`/`joining` en true). Normalizar `www.`, query y hash.
  - Mientras Kirka reporte joining/entering, esperar hasta unos 20 s.
  - Solo hacer `loadURL` como último recurso, con un aviso previo ("Recargando para entrar…").
  - Evitar un segundo join para el mismo id de partida.
- Overlay ligero "Entrando…": un div fijo, sin blur ni animación, que se quita cuando Kirka reporta la sala o el lobby.

## 2. Botones que pierden clics (scrims)
- `src/preload/features/scrims.js`:
  - Quitar el redibujado completo cada 1 s (`drawCard` ~L705-723, `drawPanel` ~L601-644, ~L770). Redibujar solo cuando cambie el estado, los ajustes, el pointer lock o el paso lobby/partida.
  - El contador "quedan m:ss" y la barra de progreso se actualizan con `textContent` y `style.width` sobre los nodos existentes, sin reconstruir los botones ¡Listo! / No puedo.
  - Comparar con una llave barata del estado, no con `outerHTML`. Extender el guard `pressing` a la tarjeta. Llamar `clampPlace` solo en resize o drag.
  - Quitar la animación infinita `blink` (~L30) o dejarla en un solo parpadeo.
  - Sin `backdrop-filter` fuera del lobby (~L23, ~L181).

## 3. Polling con el bot
- `src/main/scrims.js` (~L80-99): sacar un hash de cada respuesta y mandarla a la página solo si cambió.
  - Espaciar a 15-30 s cuando no hay cola ni partida, o cuando la ventana no tiene el foco. Dejar 2 s durante el ready check y 15 s en partida.
- `lobby.js`: el ciclo de 1.5 s solo debe correr con una partida abierta y estando en el inicio o en un lobby. Limitar los reintentos de `/teamswap` y guardar en caché el componente de chat que encuentra `lobby-page.js` (~L210-224).
- `src/preload/features/result.js` (~L650): el chequeo de 1 s solo en `/games/`. En `src/main/ipc.js` (~L152-156): screenshot a 960 px, JPEG calidad 60.

## 4. Tema RITE
- `src/preload/features/recolor.js`: es lo más caro en los menús porque lee y escribe estilos alternadamente.
  - Ideal: reemplazarlo por CSS generado. Sacar una vez los colores azules reales de Kirka y meter overrides en `rite.css`.
  - Si sigue en JS: leer todo antes de escribir, quitar el patrón `restore` antes de `visit`, guardar en caché por `className`, observar solo `childList` (no `attributes:class`) y procesar en trozos con `requestIdleCallback`.
  - Un solo sweep (quitar el de 1500 ms, ~L215-216), y ninguno mientras se está entrando a la partida o en `/games/`.
- `src/main/rite-pack.js` + `src/preload/game.js` (~L220-241): el recoloreo de armas pixel por pixel en cada sesión.
  - Mejor: incluir las texturas ya recoloreadas (script offline con Node + sharp) y dejar el recoloreo en runtime solo como respaldo.
  - Si no: caché en disco en userData por URL + modo + ETag, trabajo en un worker/utility process con sharp, salida en WebP, tabla de 256 colores en lugar de `lerp3`, límite LRU a la caché, y `appendFileSync` cambiado por logs async solo en modo debug.
- `src/preload/game.js`: `applyBlockTexture` escribe en localStorage solo si el valor cambió.
- Insignias (`src/main/badges.js` ~L35, `src/preload/features/badges.js`): mandar la lista solo si cambió, usar un WeakSet de padres marcados en lugar de `parent.querySelector`, y escanear en idle.
- `rite.css`: quitar el `backdrop-filter` del menú de pausa `.esc-interface` (~L819), que desenfoca encima del canvas WebGL. Los demás blur cambiarlos por fondo sólido o casi opaco.
- Fuentes (`styles.js` ~L6-19): incluir Oswald y Outfit locales en WOFF2 con `font-display: swap`, cargadas solo si el tema está activo. Quitar Google Fonts.

## 5. Configuración y flags
- `defaults.js`: perfil por defecto `balanced` con `fpsLimit:"auto"` (Hz del monitor). El perfil `competitive` (sin límite de FPS ni vsync) queda como opción.
- `src/main/performance.js`: `ignore-gpu-blocklist`, `force_high_performance_gpu`, `enable-zero-copy` y `enable-gpu-rasterization` dejan de ser base y pasan a opcionales (solo en competitive).
- Segundo plano: permitir el throttling cuando la ventana está oculta o minimizada, o bajar a 5-10 FPS. `highPriority` apagado por defecto.
- Timers de interfaz (`links.js` ~L37, `lobby.js` ~L174, `overlay.js` ~L83, `game.js` ~L144, `health.js` ~L52): pausarlos mientras `document.pointerLockElement` esté activo, o cambiarlos por eventos (`pointerlockchange`, cambio de URL). `health` a 250 ms o con MutationObserver.

## 6. Interruptor "Modo rendimiento" (en ajustes)
Al activarlo, aplica todo junto:
- Perfil quality/balanced con FPS fijo y sin flags de GPU forzados.
- Throttling en segundo plano y `highPriority` apagado.
- Clase `.rite-perf`: sin `backdrop-filter`, sin animaciones ni `will-change`, y fondo sólido.
- Apaga recolor, insignias, `healthColors`, la barra de links, el RITE pack y el swapper (opcional).
- Scrims: dibuja solo cuando hay cambios y hace polling cada 15 s en partida.

Debe quedar visible para los jugadores y aplicarse sin reiniciar cuando sea posible.

## Al terminar
- Haz bump de versión a beta.18, commit y push a esta rama, y deja un resumen en `docs/CHANGELOG` o en el PR.
- Lista lo que no pudiste aplicar y por qué.
