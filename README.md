# RITE Client

Cliente de escritorio de la comunidad competitiva de RITE, con sus dos juegos en un solo instalador: [Kirka.io](https://kirka.io/) (rendimiento extra, crosshair propio, modo torneo y personalización) y [VOXARENA](https://voxarena.io/) (el FPS de RITE), sobre una base de Electron actual y segura.

## Hub

Al abrir el cliente sale el **hub**, su ventana propia con la paleta de RITE (negro, plata, oro y bronce), donde eliges Kirka o VOXARENA. Cada juego abre en su propia ventana y solo corre uno a la vez: al volver al hub (menú del cliente → *Cliente* → *Volver al hub* en Kirka, botón *Hub RITE* en VOXARENA, o cerrando la ventana del juego) esa ventana se cierra y libera su memoria.

- VOXARENA va en su propia sesión (`persist:voxarena`): cookies, caché y almacenamiento aparte de los de Kirka. Ahí no cargan el swapper, los userscripts, los estilos ni el tema RITE del cliente; el juego trae su propio tema RITE, escondido, que solo enciende dentro del cliente.
- *Abrir directo el último juego la próxima vez* (o *Al abrir el cliente* en el menú) salta el hub; vuelves a él con *Volver al hub*.
- **Chat RITE** en el hub: espejo de #rite-chat del Discord de RITE. Lo que escribes lo publica el bot allá con tu nombre de RITE, y lo de Discord aparece aquí. Hace falta el cliente vinculado (y estar registrado para escribir).
- El hub trae el panel de **Scrims RITE**: vincular con Discord (una sola vez, para los dos juegos), registrarte, las colas de Kirka y VOXARENA en vivo, el ¡Listo!, tu partida con la votación de mapa y *Entrar a la sala*, que abre el juego de la partida en su sala.

## Features

**Rendimiento**
- Perfiles: *Competitivo* (FPS sin límite y sin vsync), *Equilibrado* y *Calidad*.
- Selector de backend gráfico (Direct3D 11/9, OpenGL, Vulkan, Metal).
- Prioridad de proceso alta y sin throttling cuando la ventana pierde el foco.
- Contador de FPS ligero.

**Competitivo**
- Crosshair propio (cruz, punto, cruz con punto o círculo) con color, tamaño, grosor, separación, opacidad y borde. Solo se ve mientras juegas.
- Links a RITE WEB y al Discord de RITE: abajo en el lobby, en "Acerca de" y como botones en tu estado de Discord.
- Modo torneo: apaga swapper, userscripts, estilos y el tema RITE con un clic.

**Scrims RITE**
- Liga el cliente con tu Discord (menú → *Scrims RITE* → *Vincular*, y en el Discord de RITE `/cliente vincular codigo:XXXXXX`).
- Regístrate en RITE desde el panel de colas (gamer tag, región y tu Kirka). Las colas solo se abren para jugadores registrados.
- Insignia RITE Client: el logo de RITE aparece junto al nombre de quienes usan el cliente (lobby, amigos, perfiles, tabla y kill feed). Sale para quien tenga el cliente vinculado y su Kirka puesto en RITE.
- Panel flotante de colas en el lobby: entra o sal de cualquier cola (si está vacía, la abres tú), con la respuesta del bot como aviso. Se arrastra desde su título, se minimiza con **−** y recuerda dónde lo dejaste. Se apaga en el menú (*Panel de colas*).
- El panel también te acompaña en partida (bajo el marcador, chico y sin estorbar al apuntar; con Esc lo usas normal). Cuando alguien entra a una cola y lo tienes minimizado o estás jugando, parpadea y suena un aviso corto. Las dos cosas se apagan en el menú.
- En tu partida, *Compartir mi sala* manda el link de la sala de Kirka en la que estás al hilo de la partida.
- Cuando se llena tu cola, aviso con sonido y los botones *¡Listo!* / *No puedo* sin salir del juego.
- Cuando alguien de tu partida pega el link de la sala de Kirka en el hilo (o usa `/partida sala`), te sale *Entrar a la sala* y entras con un clic.
- El token del cliente se guarda solo en tu PC y no va en los ajustes exportados.

**Tema y texturas**
- Tema RITE: la interfaz de Kirka con el estilo y la paleta de RITE WEB (dorado sobre negro, Oswald y Outfit). Cubre el lobby (racha diaria, misiones, Private/Join/Create sin el azul de Kirka, iconos propios en el menú izquierdo), el HUD, el menú de pausa, el marcador (Tab) y el final de partida. Lo que Kirka pinta de azul sin una clase fija (Hub, Clans, Market, Kirka TV, noticias, final de partida) se pasa a la paleta RITE automáticamente.
- Pack RITE: armas en negro y dorado, y opcionalmente los personajes en un tono oscuro parejo (nada resalta, ni la cabeza, para no dar ventaja). Se recolorean al vuelo, así que sigue funcionando cuando Kirka cambia sus archivos. Lo que carga queda listado en `Documentos/RITEClient/texturas-kirka.txt`. Solo en tu pantalla; se apaga en modo torneo.
- Texturas de bloques RITE Dark, o cualquier textura por URL, usando el ajuste de texturas nativo de Kirka.

**Vida**
- Color según tu vida: tu barra de vida, y opcionalmente el crosshair, cambian de color según la vida que te queda. Los colores y los umbrales se configuran.

**Personalización**
- Resource swapper: reemplaza texturas, sonidos y modelos del juego con archivos locales.
- Userscripts (`.js`) y userstyles (`.css`), activables uno por uno desde el menú.
- CSS personalizado.
- Exportar e importar ajustes.

**Cliente**
- Discord Rich Presence.
- Actualizaciones automáticas desde GitHub Releases.
- Capturas de pantalla con F2, guardadas y copiadas al portapapeles.

## Atajos

| Tecla | Acción |
|-------|--------|
| `Shift derecho` | Abrir el menú del cliente (configurable) |
| `F2` | Captura de pantalla |
| `F4` | Volver al inicio de Kirka |
| `F5` | Recargar |
| `F6` | Abrir el enlace de Kirka que tengas en el portapapeles |
| `F7` | Copiar el enlace actual |
| `F11` | Pantalla completa |
| `F12` | DevTools (hay que activarlo en el menú) |

## Carpetas

Todo lo personalizable vive en `Documentos/RITEClient/`:

- `swapper/`: replica la ruta de la URL del juego. Por ejemplo, `swapper/assets/img/logo.png` reemplaza `https://kirka.io/assets/img/logo.png`. Después de añadir archivos, pulsa *Recargar swapper* en el menú.
- `scripts/`: userscripts `.js`. Se ejecutan en la página como en una extensión de navegador, **sin acceso a Node.js**, así que los scripts hechos para clientes que exponen `require` no funcionan sin adaptarlos.
- `styles/`: userstyles `.css`.
- `screenshots/`: capturas de F2.

## Seguridad

A diferencia de otros clientes de Kirka, la página del juego no tiene acceso a Node.js (`contextIsolation` activado, `nodeIntegration` desactivado, `webSecurity` activado). Un XSS en el chat de Kirka o un userscript malicioso no puede tocar tu PC. Además:

- La ventana de Kirka solo navega a Kirka, sus mirrors oficiales y los proveedores de login; la de VOXARENA, solo a VOXARENA y los proveedores de login. El resto de enlaces se abren en tu navegador, y un link del otro juego nunca carga en la ventana equivocada.
- Solo la página de Kirka puede hablar con el proceso principal, y cada valor que guarda se valida. El hub (página propia del cliente) y VOXARENA tienen cada uno sus pocos canales: el hub elige juego y guarda ese ajuste; VOXARENA solo puede pedir volver al hub. Las dos ventanas corren con `sandbox` activado.
- El swapper solo sirve archivos de su carpeta.
- Scrims RITE y el chat hablan con RITE WEB desde el proceso principal: ni la página de Kirka ni el hub ven el token, y solo se abren salas de `kirka.io/games/`, links de VOXARENA y canales de `discord.com`.

## Abrir el cliente siempre actualizado (Windows)

Copia [`scripts/RITE-Client.bat`](scripts/RITE-Client.bat) donde quieras (por ejemplo al Escritorio) y ábrelo con doble clic. La primera vez descarga el cliente en `%LOCALAPPDATA%\RITEClient\app` e instala lo necesario. Cada vez que lo abras baja la última versión de GitHub y abre RITE Client. Necesita Git y Node.js instalados.

## Desarrollo

Requiere Node.js 20 o superior.

```bash
npm install
npm start        # abre el cliente
npm test         # tests
npm run lint     # comprobación de sintaxis
npm run build    # instalador para tu sistema en dist/
```

### Publicar una versión

Los instaladores se publican en el repo público [`FrankzMX/RITEClient-releases`](https://github.com/FrankzMX/RITEClient-releases), así este repo puede ser privado. Cada cliente instalado busca ahí al abrirse, descarga lo nuevo y lo instala al cerrar (o al pulsar *Reiniciar ahora*).

```bash
git tag v0.2.0 && git push origin v0.2.0                  # versión para todos
git tag v0.2.0-beta.1 && git push origin v0.2.0-beta.1    # beta solo para el staff
```

El workflow **Release** toma la versión del tag, compila el instalador de Windows y lo publica. Un tag con sufijo (`-beta.1`) sale como *prerelease*: solo lo reciben quienes instalaron una beta o activaron *Recibir versiones beta* en el menú. Necesita el secret `RELEASES_TOKEN` con permiso de escritura en `RITEClient-releases`.

Discord Rich Presence usa la aplicación de Discord de RITE (ID en `package.json` → `rite.discordClientId`). La imagen del estado es el asset `rite` de esa aplicación.

## Autor

Frankz Xavier García y García ([@FrankzMX](https://github.com/FrankzMX))

## Licencia y créditos

Copyright (C) 2026 Frankz Xavier García y García. GPL-3.0. Ver [LICENSE](LICENSE) y [AUTHORS.md](AUTHORS.md). Basado en ideas de [Smudgy Client](https://github.com/OBS-Akuma/smudgy-client) y [Juice Client](https://github.com/irrvlo/juice-client).
