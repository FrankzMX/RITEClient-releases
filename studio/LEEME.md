# RITE Studio

Escenas, fotos y videos de mapas de Kirka, en el navegador. Toma el `.json` que exporta el editor de Kirka (EXPORT) y lo dibuja con las texturas del juego y su luz. Encima se agregan personajes, utilería y luces, y se arma un video con cámara animada, filtros, textos y música.

## Cómo abrirlo

- **En Windows:** doble clic en `RITE Studio.bat` (necesita Node.js 18 o más nuevo). Abre `http://127.0.0.1:8790` en el navegador.
- **En cualquier PC con Node:** `node kirka-render.cjs estudio` y abrir `http://127.0.0.1:8790`.
- **En internet:** https://studio-production-d01f.up.railway.app/ (Railway, carpeta `/studio`, `npm start`). Es una página estática: también se puede subir tal cual a Netlify, GitHub Pages, etc.
- Usar **Chrome o Edge** actualizados: exportar video usa WebCodecs.
- No se abre con doble clic en `estudio.html` (`file://`): el navegador bloquea los módulos. Siempre con un servidor.

## Cómo se usa (lo mismo que dice la pantalla)

1. **Abre tu mapa:** en el editor de Kirka, EXPORT, y arrastra el `.json` a la ventana. O prueba un ejemplo (menú ✨ Ejemplos).
2. **Busca el encuadre:** clic y arrastra para mirar, WASD para moverte, Espacio sube, C baja, Shift rápido, rueda avanza.
3. **Guarda puntos de cámara** (📍 Guardar este encuadre o tecla K). Con dos puntos o más la cámara se mueve sola entre ellos. También hay movimientos listos (vuelta completa, acercarse, bajar del cielo…).
4. **Dale estilo:** pestañas Escena (ambiente, luz, niebla, sol, sombras, desenfoque), Objetos, Filtros, Textos y Sonido.
5. **Exporta:** 📷 Foto (PNG) o 🎬 Exportar video (MP4). Formatos 16:9, 9:16 (TikTok/Shorts), 1:1, 21:9; calidad hasta 4K; 24, 30 o 60 cuadros.

Cada opción tiene un botón **(?)** que explica para qué sirve. Los sliders no muestran números: van de «Más oscuro» a «Más claro», etc. Doble clic en un slider lo regresa al centro. Español e inglés (botón EN/ES).

Atajos: P reproducir o pausar · K guardar encuadre · F foto · ← → un cuadro · Supr borrar lo elegido · G/R/T mover/girar/tamaño del objeto elegido · Esc soltar el objeto.

## Objetos

- **Skins de Kirka:** en rite.lat/studio, botón «🎮 Skins de Kirka» en la skin del personaje: buscador con todas las skins del juego (copia propia de RITE Web, `/api/kirka/list|render|texture|model`). Pone el personaje oficial (`Character.glb`) con sus animaciones (stand, pose1-3, run, squat…) como poses; las barras de partes giran sus huesos (se buscan por nombre). Fuera de rite.lat (o si falla) se usa el personaje de bloques.
- **Codos y rodillas:** brazos y piernas del personaje de bloques en dos tramos con pieza de unión; barras «Doblar».
- **Mapa en texto:** botón «📋 Mapa en texto» (y «Pegar el texto del mapa» en la portada) para pegar el texto completo de un mapa, aunque venga entre comillas o en un bloque ```; también se puede pegar con Ctrl+V en cualquier parte. «Copiar como texto» copia el mapa abierto para pegarlo en Kirka (IMPORT) o compartirlo.
- **Personajes** de bloques con skin y 10 poses (parado, caminar, correr, saludar, zombi, apuntar, festejar, sentado, bailar, asustado) y «Automática» (camina cuando se mueve en el video). **Partes animables:** cabeza, cuerpo, brazos y piernas se giran con tres barras (adelante/atrás, girar, inclinar/abrir) que se suman a la pose. Cada marca de movimiento guarda la pose y los giros, y el estudio pasa suave de una marca a otra (la pose nueva entra en los últimos 0.4 s del tramo). 7 skins de ejemplo o subir una PNG de 64×64 con el acomodo clásico de los juegos de bloques. **Es una aproximación**: no tenemos el modelo oficial del personaje de Kirka (ver Pendientes).
- **Utilería low-poly:** calabaza, calabaza con cara (con luz), calavera, vela (con luz), farol (con luz), lápida, ataúd, cubeta de dulces, árbol, árbol seco, buzón, cerca, luna. Se les cambia el color.
- **Bloque de Kirka** suelto, con su textura (id 1–215).
- **Luz** de color con fuerza y alcance (el foquito amarillo no sale en fotos ni videos).
- **Modelos 3D importados** (GLB, GLTF de un solo archivo u OBJ), por ejemplo hechos en Blender. Se guardan dentro del proyecto.
- **Crear con piezas:** cubo, cilindro, esfera, cono, pirámide, rampa, placa y anillo. Cada pieza lleva color o (el cubo) la textura de un bloque de Kirka, puede brillar, y con «Tamaño» se estira por eje (una tabla, un poste, una lámpara…). Así se arma lo que no es de Kirka ni vóxel.
- **Agrupar / desagrupar:** Shift + clic en la vista (o las casillas de la lista) para elegir varios objetos y «Agrupar». El grupo se mueve, gira, copia y anima como uno solo; «Desagrupar» los separa sin moverlos de lugar. Los grupos pueden tener personajes, utilería, luces y otros grupos.
- **Mis objetos:** «Guardar en Mis objetos» guarda el objeto o grupo en este navegador para reusarlo en otros proyectos (también viaja dentro del `.rite.json` que lo usa).
- **Contorno y aura:** contorno = línea fina; aura = brillo ancho del color elegido (sale con el resplandor). Cada color va en su propia pasada (hasta 4 colores a la vez).
- **Armas y disparos:** las 11 armas oficiales de Kirka en la mano, con su skin. «💥 Disparar desde aquí» agrega un tramo de disparos (`disparos: [{desde, hasta}]`): fogonazo en la punta del cañón (nodo `Muzzle`) y una luz que parpadea según la cadencia de cada arma.
- Clic en un objeto en la vista para elegirlo; flechas para mover, girar o cambiar el tamaño. «Guardar posición en este momento» en varios momentos hace que el objeto se mueva en el video.

## Línea de tiempo

- Arriba van la cámara, los textos y los sonidos (si se enciman, van en renglones).
- Abajo, cada personaje y cada objeto que se mueve tiene su propio carril, con sus marcas (se arrastran), los tramos en que se mueve y sus disparos (barra naranja: se arrastra o se estira por las orillas). Clic en el nombre de un carril elige el objeto. Con más de 7 carriles, la rueda sube y baja.
- **Zoom:** Ctrl + rueda (o pellizco) donde está el mouse, o los botones 🔍− 🔍+ ⤢. Con zoom, la rueda o Shift + arrastrar la regla mueven la vista de lado, y las marcas se acomodan más fino (hasta centésimas de segundo). Al reproducir, la vista sigue al cabezal.

## Proyectos

«Guardar proyecto» baja un `.rite.json` con todo: el mapa adentro (sin el script), la cámara, los objetos (con skins y modelos), filtros y textos. La música no se guarda dentro: al abrir el proyecto en otra PC hay que volver a elegir los archivos de audio. Formato en `proyecto.js` (`proyectoNuevo`).

## Línea de comandos (sin abrir el navegador)

```
node kirka-render.cjs foto  proyecto.rite.json [--t 3] [--calidad 2160] [--salida foto.png]
node kirka-render.cjs foto  mapa.json --camara "x,y,z,mx,my,mz,fov" --salida vista.png
node kirka-render.cjs video proyecto.rite.json [--audio musica.mp3] [--salida video.mp4]
```

Usa el Chromium de Playwright (`npm i playwright`) y `ffmpeg`. Sirve para miniaturas y vistas desde Claude o scripts. Es lento con la tarjeta de video por software (unos 2–3 cuadros por segundo a 720p).

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `bloques.js` | Qué textura del atlas usa cada bloque y qué forma tiene (sacado del juego). |
| `formas.js` | Caras de cubos, medios bloques, placas y plantas. |
| `mapa.js` | Arma la malla del mapa. Calcula la luz por bloques como en el juego: luz del cielo que baja por columnas abiertas y se esparce, luz de los bloques 212–214 (baja 1 por bloque), sombra en esquinas (oclusión ambiental) y sombreado por cara. |
| `motor.js` | three.js: cielo, niebla y luz del JSON del mapa (`light`, `blockLight`, `brightness`, `skyboxColor`, `fogColor`, `fogNear/Far`, `fogAmbientColor`, `sunX/Y/Z`, `sunStrength`), sol con sombras, resplandor (bloom), desenfoque (bokeh), objetos. |
| `objetos.js` | Personajes, poses, utilería, bloques, luces, modelos importados y su movimiento. |
| `camara.js` | Movimiento de la cámara entre puntos (curva suave, arranque y frenado suaves, cámara en mano). |
| `capas.js` | Filtros, viñeta, grano, barras de cine, textos y fundidos sobre la imagen (igual en vista previa, foto y video). |
| `exportar.js` | Video MP4 en el navegador (H.264 + AAC u Opus) con la música mezclada. Cuadro por cuadro: aunque la PC sea lenta, el video sale fluido. |
| `estudio.*`, `textos.js` | La interfaz y sus textos en español e inglés con las ayudas (?). |
| `render.html/js`, `kirka-render.cjs` | La página sin ventana y el programa de línea de comandos. |
| `atlas.png` | El atlas de texturas de bloques de Kirka (16×16 cuadros). |
| `vendor/` | three.js 0.160.0 (MIT) y mp4-muxer 5.2.1 (MIT). |
| `fuentes/` | Oswald y Creepster (SIL Open Font License). |

## Lo que no es igual al juego

- **La luz es una aproximación [deducido].** No tenemos el código de luz de Kirka; el alcance de los bloques de luz (15) y la curva son nuestros. Comparar con capturas del juego y ajustar `LUCES` y `curva` en `mapa.js`.
- **Personajes:** modelo de bloques genérico, no el de Kirka. Para el oficial hace falta el modelo y el acomodo de las skins de Kirka.
- Agua, lava y vidrio no se animan; las banderas, spawns y grupos de bloques no se dibujan.

## Pendientes

- Modelo oficial del personaje de Kirka y sus skins (la herramienta https://render-tool.lukeskywalk.com/ los usa; desde nuestro servidor está bloqueada).
- Calibrar la luz con capturas del juego (misma vista en Kirka y en el estudio).
