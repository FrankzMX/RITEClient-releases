"use strict";

// Declarative layout of the client menu. `restart: true` marks settings that
// only apply after restarting the client, `reload: true` after reloading (F5).

// Kept short on purpose: the basics of each section show first, the rest goes
// in `group`s that start closed (and only render when opened). `when(settings)`
// hides an item until it matters (e.g. the clip options while clips are off),
// and long hints hide behind a "?" next to their label.

const SECTIONS = [
  {
    id: "performance",
    title: "Rendimiento",
    items: [
      {
        type: "toggle",
        key: "performanceMode",
        label: "Modo rendimiento",
        hint: "Para PCs modestas: sin blur ni animaciones, sin recolor del tema, insignias, color de vida, barra de links ni pack RITE, y el juego baja el ritmo si lo minimizas. En Kirka quita sombras, marcas de bala y casquillos y baja la resolución a 100 % (con F5). Se aplica al momento; el perfil de GPU (nunca Competitivo) y el límite de FPS fijo, al reiniciar. Tus ajustes quedan guardados para cuando lo apagues.",
      },
      { type: "toggle", key: "performanceModeSwapper", label: "También apagar el swapper", when: (s) => s.performanceMode },
      { type: "profiles" },
      {
        type: "select",
        key: "fpsLimit",
        label: "Límite de FPS",
        restart: true,
        hint: "Automático = los Hz de tu monitor, como en el navegador. Sin límite el CPU va al 100% y en PCs modestas el juego pierde paquetes (disparos que no registran, ping alto). Con una PC potente puedes subirlo. En Competitivo, solo «Sin límite» quita el vsync: con cualquier otro límite el juego va al ritmo del monitor, sin tirones.",
        options: [
          ["auto", "Automático (Hz del monitor)"],
          ["0", "Sin límite"],
          ["60", "60"],
          ["120", "120"],
          ["144", "144"],
          ["165", "165"],
          ["240", "240"],
          ["360", "360"],
        ],
      },
      { type: "toggle", key: "fpsCounter", label: "Contador de FPS", hint: "Fuera de partida lo puedes arrastrar a donde quieras." },
      { type: "range", key: "fpsCounterSize", label: "Tamaño del contador", min: 9, max: 40, when: (s) => s.fpsCounter },
      { type: "toggle", key: "fpsCounterDetail", label: "Contador detallado", hint: "Junto a los FPS: el 1 % más lento, los tirones de los últimos segundos y la RAM del cliente. Necesita RITE Bench.", when: (s) => s.fpsCounter },
      {
        type: "group",
        title: "Avanzado",
        summary: "Perfil, backend gráfico, prioridad",
        items: [
          {
            type: "select",
            key: "performanceProfile",
            label: "Perfil",
            restart: true,
            hint: "Competitivo es para PCs potentes: fuerza la GPU y sigue a toda velocidad aunque minimices. En una PC modesta Equilibrado va más fluido. Al elegirlo, el límite de FPS se ajusta solo (Competitivo: sin límite; los demás: automático); luego puedes cambiarlo. Competitivo con límite de FPS conserva la GPU forzada pero usa vsync.",
            options: [
              ["balanced", "Equilibrado (recomendado)"],
              ["competitive", "Competitivo: sin límite, sin vsync, GPU forzada"],
              ["pure", "Puro: sin límite y sin vsync, nada más"],
              ["quality", "Calidad: lo de Chromium"],
            ],
          },
          {
            type: "select",
            key: "angleBackend",
            label: "Backend gráfico",
            restart: true,
            hint: "Si el juego va a tirones, prueba otro. D3D11 suele ser el más estable en Windows.",
            options: [
              ["default", "Automático"],
              ["d3d11", "Direct3D 11 (Windows)"],
              ["d3d9", "Direct3D 9 (Windows)"],
              ["gl", "OpenGL"],
              ["vulkan", "Vulkan"],
              ["metal", "Metal (macOS)"],
            ],
          },
          { type: "toggle", key: "highPriority", label: "Prioridad de proceso alta", restart: true, hint: "Le quita CPU al resto de la PC. Úsalo solo si algo en segundo plano te da tirones." },
          {
            type: "select",
            key: "frameHook",
            label: "Cuadros y red",
            restart: true,
            hint: "Automático: dibuja sin pausas y solo deja pasar primero los mensajes del servidor cuando se están atrasando (en PCs modestas, para que los jugadores no se congelen). Siempre: los deja pasar antes de cada cuadro (como antes). Sin salto: nunca. Sin gancho: Kirka dibuja solo; no hay contador de FPS ni RITE Bench.",
            options: [
              ["auto", "Automático (recomendado)"],
              ["normal", "Siempre deja pasar la red"],
              ["nohop", "Sin salto"],
              ["off", "Sin gancho"],
            ],
          },
        ],
      },
      {
        type: "group",
        title: "RITE Bench",
        summary: "Mediciones de FPS de tus partidas",
        items: [
          {
            type: "toggle",
            key: "perfStats",
            label: "Medir mis partidas",
            hint: "Anota los FPS, el 1 % más lento y los tirones de cada partida, con los ajustes que usaste, para ver cuál combinación va mejor en tu PC. Se guarda en tu PC (Documentos/RITEClient/rendimiento) y solo se envía a RITE si aceptas compartirlo.",
          },
          {
            type: "select",
            key: "perfShare",
            label: "Compartir con RITE",
            when: (s) => s.perfStats,
            hint: "Anónimo: FPS, tirones, tus ajustes de rendimiento y el tipo de PC (procesador, tarjeta de video, RAM), sin tu nombre, cuenta ni IP. Sirve para que RITE sepa qué ajustes van mejor en cada tipo de PC.",
            options: [
              ["ask", "Preguntarme"],
              ["yes", "Sí, compartir"],
              ["no", "No compartir"],
            ],
          },
          { type: "perf" },
        ],
      },
    ],
  },
  {
    id: "look",
    title: "Apariencia",
    items: [
      { type: "toggle", key: "riteTheme", label: "Tema RITE", hint: "La interfaz de Kirka con el estilo y los colores de RITE WEB." },
      {
        type: "select",
        key: "blockTexture",
        label: "Texturas de bloques",
        hint: "Se cambian al momento, también en medio de una partida.",
        options: [
          ["kirka", "Las de Kirka"],
          ["rite-dark", "RITE Dark"],
          ["custom", "Personalizada (URL)"],
          ["file", "De tu carpeta texturas"],
        ],
      },
      { type: "text", key: "customTextureUrl", label: "URL de la textura", placeholder: "https://…/textura.png", hint: "Imagen de 512×512 con el mismo formato que las texturas de Kirka.", when: (s) => s.blockTexture === "custom" },
      { type: "toggle", key: "texturePanel", label: "Panel de texturas al pausar (ESC)", hint: "En partida, al hacer ESC sale un panel flotante con tus texturas guardadas para cambiarlas sin salir. Guarda tus PNG en Documentos/RITEClient/texturas." },
      { type: "buttons", buttons: [["Abrir carpeta de texturas", "open-textures"]] },
      {
        type: "select",
        key: "ritePack",
        label: "Pack RITE (armas y personajes)",
        reload: true,
        hint: "Pinta las armas de negro y dorado. Con personajes, todos los jugadores se ven en un tono oscuro parejo (nada resalta). Solo en tu pantalla; se apaga en modo torneo.",
        options: [
          ["off", "Apagado"],
          ["weapons", "Solo armas"],
          ["all", "Armas y personajes"],
        ],
      },
      { type: "toggle", key: "riteBadges", label: "Insignia RITE Client", hint: "Muestra el logo de RITE junto al nombre de quienes usan el cliente (en el lobby, amigos, perfiles, tabla y kill feed). Para tenerla tú, vincula tu Discord y pon tu Kirka al registrarte." },
    ],
  },
  {
    id: "clips",
    title: "Clips",
    items: [
      {
        type: "toggle",
        key: "clipsEnabled",
        label: "Clips con F8",
        hint: "Mientras juegas, el cliente guarda los últimos segundos del juego, ya comprimidos con la tarjeta de video. Con F8 se vuelven un .mp4 en Documentos/RITEClient/clips, listo para subir a Discord. No baja los FPS si tienes tarjeta de video o gráficos Intel/Radeon con codificador, pero usa unos 400 MB de RAM a 1080p: en una PC de 8 GB déjalo apagado o usa 720p y 15 segundos.",
      },
      {
        type: "select",
        key: "clipsSeconds",
        label: "Duración del clip",
        when: (s) => s.clipsEnabled,
        options: [
          ["15", "15 segundos"],
          ["30", "30 segundos"],
          ["60", "60 segundos"],
        ],
      },
      {
        type: "select",
        key: "clipsQuality",
        label: "Calidad",
        when: (s) => s.clipsEnabled,
        hint: "Nunca más grande que la ventana del juego. 720p gasta menos y pesa la mitad.",
        options: [
          ["720", "720p"],
          ["1080", "1080p (recomendado)"],
          ["1440", "1440p"],
        ],
      },
      {
        type: "select",
        key: "clipsFps",
        label: "FPS del clip",
        when: (s) => s.clipsEnabled,
        options: [
          ["60", "60 FPS"],
          ["30", "30 FPS (más ligero)"],
        ],
      },
      {
        type: "toggle",
        key: "clipsOnlyMatch",
        label: "Solo durante la partida",
        hint: "No graba en el lobby: empieza al entrar a una partida (tarda como un segundo) y se pausa al salir. Lo grabado se queda, así que F8 en los resultados todavía guarda el final de la partida.",
        when: (s) => s.clipsEnabled,
      },
      { type: "toggle", key: "clipsAudio", label: "Grabar el sonido", hint: "Windows da el sonido de toda la PC: si hablas en Discord, también queda en el clip.", when: (s) => s.clipsEnabled },
      {
        type: "toggle",
        key: "clipsAuto",
        label: "Clips automáticos",
        when: (s) => s.clipsEnabled,
        hint: "Guarda un clip solo cuando haces las kills que elijas en el tiempo que elijas, un par de segundos después de la última. Si sigues matando antes de que se guarde, el clip sale más grande.",
      },
      {
        type: "select",
        key: "clipsAutoKills",
        label: "Kills para el clip automático",
        when: (s) => s.clipsEnabled && s.clipsAuto,
        options: [
          ["2", "2 kills"],
          ["3", "3 kills"],
          ["4", "4 kills"],
          ["5", "5 kills"],
        ],
      },
      {
        type: "select",
        key: "clipsAutoWindow",
        label: "En cuánto tiempo",
        when: (s) => s.clipsEnabled && s.clipsAuto,
        hint: "Nunca más largo que el clip, para que todas las kills salgan en él.",
        options: [
          ["5", "5 segundos"],
          ["10", "10 segundos"],
          ["15", "15 segundos"],
          ["30", "30 segundos"],
        ],
      },
      { type: "buttons", buttons: [["Ver mis clips (F9)", "clips-viewer"], ["Abrir carpeta", "open-clips"]] },
    ],
  },
  {
    id: "health",
    title: "En partida",
    items: [
      { type: "toggle", key: "matchStats", label: "Estadísticas en partida", hint: "K/D, asistencias, puntos y % de headshots debajo de tus kills y muertes." },
      { type: "toggle", key: "healthColors", label: "Color según tu vida", hint: "Pinta tu barra de vida según cuánta te queda." },
      { type: "toggle", key: "healthCrosshair", label: "El crosshair también cambia de color", when: (s) => s.healthColors },
      { type: "color", key: "healthHighColor", label: "Vida alta", when: (s) => s.healthColors },
      { type: "range", key: "healthHighMin", label: "Vida alta desde (%)", min: 2, max: 100, when: (s) => s.healthColors },
      { type: "color", key: "healthMidColor", label: "Vida media", when: (s) => s.healthColors },
      { type: "range", key: "healthMidMin", label: "Vida media desde (%)", min: 1, max: 99, when: (s) => s.healthColors },
      { type: "color", key: "healthLowColor", label: "Vida baja", when: (s) => s.healthColors },
    ],
  },
  {
    id: "crosshair",
    title: "Crosshair",
    items: [
      { type: "toggle", key: "crosshairEnabled", label: "Crosshair propio", hint: "Solo se ve mientras juegas (con el ratón capturado)." },
      { type: "crosshairPreview", when: (s) => s.crosshairEnabled },
      {
        type: "select",
        key: "crosshairStyle",
        label: "Estilo",
        when: (s) => s.crosshairEnabled,
        options: [
          ["cross", "Cruz"],
          ["cross-dot", "Cruz con punto"],
          ["dot", "Punto"],
          ["circle", "Círculo"],
        ],
      },
      { type: "color", key: "crosshairColor", label: "Color", when: (s) => s.crosshairEnabled },
      { type: "range", key: "crosshairDotSize", label: "Tamaño del punto", hint: "En píxeles de pantalla: 1 es el más chico posible.", min: 1, max: 16, when: (s) => s.crosshairEnabled && (s.crosshairStyle === "dot" || s.crosshairStyle === "cross-dot") },
      { type: "range", key: "crosshairSize", label: "Largo", min: 1, max: 64, when: (s) => s.crosshairEnabled && s.crosshairStyle !== "dot" },
      { type: "range", key: "crosshairThickness", label: "Grosor", hint: "De las líneas.", min: 1, max: 16, when: (s) => s.crosshairEnabled && s.crosshairStyle !== "dot" },
      { type: "range", key: "crosshairGap", label: "Separación", min: 0, max: 64, when: (s) => s.crosshairEnabled && s.crosshairStyle !== "dot" },
      { type: "range", key: "crosshairOpacity", label: "Opacidad", min: 0, max: 100, when: (s) => s.crosshairEnabled },
      { type: "toggle", key: "crosshairOutline", label: "Borde negro", when: (s) => s.crosshairEnabled },
    ],
  },
  {
    id: "customization",
    title: "Personalización",
    items: [
      { type: "toggle", key: "tournamentMode", label: "Modo torneo", hint: "Desactiva swapper, userscripts, módulos RITE, estilos y el tema RITE." },
      { type: "toggle", key: "swapperEnabled", label: "Resource swapper" },
      {
        type: "buttons",
        when: (s) => s.swapperEnabled,
        buttons: [
          ["Abrir carpeta del swapper", "open-swapper"],
          ["Recargar swapper", "reload-swapper"],
        ],
      },
      {
        type: "group",
        title: "Scripts y estilos",
        summary: "Tus .js y .css",
        items: [
          { type: "toggle", key: "userscriptsEnabled", label: "Userscripts (.js)", restart: true, hint: "Activa solo scripts en los que confíes." },
          { type: "toggle", key: "userstylesEnabled", label: "Userstyles (.css)", restart: true },
          { type: "customizations" },
          {
            type: "buttons",
            buttons: [
              ["Abrir carpeta de scripts", "open-scripts"],
              ["Abrir carpeta de estilos", "open-styles"],
            ],
          },
        ],
      },
      { type: "group", title: "CSS personalizado", items: [{ type: "textarea", key: "customCss", label: "CSS que se agrega a Kirka" }] },
    ],
  },
  {
    id: "modules",
    title: "Módulos RITE",
    items: [
      {
        type: "toggle",
        key: "remoteModules",
        label: "Módulos RITE",
        reload: true,
        hint: "Scripts que publica RITE (como Custom Skin Link). Se descargan solos, van firmados por RITE y se aplican al recargar (F5). Puedes apagar los que no quieras. El modo torneo los apaga todos. Con una licencia de RITE también recibes sus módulos privados.",
      },
      { type: "modules" },
    ],
  },
  {
    id: "scrims",
    title: "Scrims RITE",
    items: [
      { type: "scrims" },
      { type: "toggle", key: "scrimsEnabled", label: "Scrims RITE", hint: "Colas en vivo, aviso de ¡Listo! y la sala de tu partida con un clic." },
      {
        type: "group",
        title: "Panel de colas y avisos",
        when: (s) => s.scrimsEnabled,
        items: [
          { type: "toggle", key: "scrimsPanel", label: "Panel de colas", hint: "Ventana flotante en el lobby de Kirka para entrar y salir de las colas. Se arrastra desde su título y se minimiza con −." },
          { type: "toggle", key: "scrimsPanelInGame", label: "Panel también en partida", hint: "Mientras juegas se ve chico y no estorba al apuntar. Con Esc lo puedes usar normal.", when: (s) => s.scrimsPanel },
          { type: "toggle", key: "scrimsQueueAlert", label: "Avisar cuando alguien entra a una cola", hint: "Con el panel minimizado o en partida: luz parpadeante y un sonido corto." },
          { type: "toggle", key: "scrimsSound", label: "Sonido de aviso" },
        ],
      },
      {
        type: "group",
        title: "Tu partida",
        summary: "Resultado y Sala rápida",
        when: (s) => s.scrimsEnabled,
        items: [
          { type: "toggle", key: "scrimsAutoResult", label: "Mandar el resultado solo", hint: "Al terminar tu partida (1v1 a 15, 2v2 TDM a 50) manda el marcador y la pantalla final al hilo de la partida. Tu rival lo confirma o lo disputa." },
          { type: "toggle", key: "scrimsAutoLobby", label: "Crear y acomodar la sala", hint: "En tu partida sale «Sala rápida»: arma el lobby de Kirka en tu servidor con el modo y el mapa votado, y el bot pone el link en el hilo (manda el primer link que llegue). Con ⚙ eliges servidor, mapa y minutos antes de crearla. Con el cliente entras solo al lobby, te pasa a tu color (A rojo, B azul) y te marca listo; cuando están todos, arranca. Si eres dueño de la sala, pasa con /teamswap a quien esté en el color equivocado (por su #ID registrado en el bot)." },
          {
            type: "select",
            key: "scrimsRoomRegion",
            label: "Servidor de la Sala rápida",
            when: (s) => s.scrimsAutoLobby,
            options: [
              ["NA", "NA (Norteamérica)"],
              ["SA", "SA (Sudamérica)"],
              ["EU", "EU (Europa)"],
            ],
          },
          {
            type: "select",
            key: "scrimsRoomMinutes",
            label: "Minutos de la Sala rápida",
            when: (s) => s.scrimsAutoLobby,
            options: [
              ["4", "4 min"],
              ["8", "8 min"],
              ["15", "15 min"],
              ["30", "30 min"],
              ["60", "60 min"],
            ],
          },
        ],
      },
      {
        type: "group",
        title: "Mapas y respaldos del editor",
        items: [
          { type: "note", text: "Mapas que Kirka no trae: en Documentos/RITEClient/mapas pon un .txt con el código del mapa (el que exporta el editor de Kirka) y nómbralo como el mapa de la votación, por ejemplo «Mapa Nuevo.txt». Si gana la votación, la sala se crea con ese código." },
          { type: "note", text: "Respaldos del editor: cada vez que entras a TEST MODE en el editor de Kirka, el cliente guarda una copia del mapa en Documentos/RITEClient/respaldos-editor (las últimas 30). Si el editor guarda un mapa a medias, impórtala con IMPORT." },
          { type: "buttons", buttons: [["Abrir carpeta de mapas", "open-maps"], ["Respaldos del editor", "open-editor-backups"]] },
        ],
      },
    ],
  },
  {
    id: "trade",
    title: "Trade Helper",
    items: [
      {
        type: "toggle",
        key: "tradeHelper",
        label: "Trade Helper",
        hint: "Un panel en el menú de Kirka con las líneas de trade del chat: ofertas que te manda el servidor, quién vende, quién compra y quién cambia. Solo lee el chat; los comandos los mandas tú. Kirka banea por usar bots para comprar o vender, por vender skins por algo que no sean coins y por spam: por eso el Trade Helper nunca manda nada solo.",
      },
      {
        type: "text",
        key: "tradeWatch",
        label: "Skins que buscas",
        placeholder: "Ej.: Mythic AR-9, Sovereign, Bayonet",
        hint: "Separadas por comas. Cuando alguien las nombre en el chat, el panel lo marca en oro y te avisa.",
        when: (s) => s.tradeHelper,
      },
    ],
  },
  {
    id: "client",
    title: "Cliente",
    items: [
      {
        type: "select",
        key: "language",
        label: "Idioma",
        hint: "El menú cambia al momento; el hub, los paneles y «Mis clips», al reiniciar el cliente.",
        options: [
          ["auto", "Automático (el de Windows)"],
          ["es", "Español"],
          ["en", "English"],
        ],
      },
      {
        type: "select",
        key: "startGame",
        label: "Al abrir el cliente",
        hint: "El hub es la ventana donde eliges RITE Client, RITE Light o RITE Rust.",
        options: [
          ["hub", "Mostrar el hub"],
          ["kirka", "Abrir Kirka directo"],
        ],
      },
      { type: "toggle", key: "autoFullscreen", label: "Pantalla completa al iniciar" },
      { type: "toggle", key: "discordRpc", label: "Discord Rich Presence" },
      { type: "toggle", key: "autoUpdate", label: "Actualizaciones automáticas" },
      { type: "keybind", key: "menuKey", label: "Tecla del menú" },
      {
        type: "buttons",
        buttons: [
          ["Volver al hub", "hub"],
          ["Abrir capturas", "open-screenshots"],
          ["Reiniciar cliente", "restart"],
        ],
      },
      {
        type: "group",
        title: "Avanzado",
        summary: "Betas, DevTools, respaldo de ajustes",
        items: [
          { type: "toggle", key: "betaUpdates", label: "Recibir versiones beta", hint: "Para el staff: también instala las versiones de prueba antes de que salgan para todos." },
          { type: "toggle", key: "devToolsShortcut", label: "Atajo de DevTools (F12)" },
          {
            type: "buttons",
            buttons: [
              ["Exportar ajustes", "export"],
              ["Importar ajustes", "import"],
              ["Restablecer todo", "reset"],
            ],
          },
        ],
      },
    ],
  },
  { id: "about", title: "Acerca de", items: [{ type: "about" }] },
];

module.exports = { SECTIONS };
