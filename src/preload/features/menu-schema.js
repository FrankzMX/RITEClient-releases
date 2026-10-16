"use strict";

// Declarative layout of the client menu. `restart: true` marks settings that
// only apply after restarting the client, `reload: true` after reloading (F5).

const SECTIONS = [
  {
    id: "performance",
    title: "Rendimiento",
    items: [
      {
        type: "toggle",
        key: "performanceMode",
        label: "Modo rendimiento",
        hint: "Para PCs modestas: sin blur ni animaciones, sin recolor del tema, insignias, color de vida, barra de links ni pack RITE, y el juego baja el ritmo si lo minimizas. Se aplica al momento; el perfil de GPU (nunca Competitivo) y el límite de FPS fijo, al reiniciar. Tus ajustes quedan guardados para cuando lo apagues.",
      },
      { type: "toggle", key: "performanceModeSwapper", label: "El modo rendimiento también apaga el swapper" },
      {
        type: "select",
        key: "performanceProfile",
        label: "Perfil",
        restart: true,
        hint: "Competitivo es para PCs potentes: fuerza la GPU y sigue a toda velocidad aunque minimices. En una PC modesta Equilibrado va más fluido.",
        options: [
          ["balanced", "Equilibrado: FPS a tu límite, GPU como la elige Chromium (recomendado)"],
          ["competitive", "Competitivo: FPS sin límite, sin vsync y GPU forzada"],
          ["quality", "Calidad: ajustes por defecto de Chromium"],
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
      {
        type: "select",
        key: "fpsLimit",
        label: "Límite de FPS",
        restart: true,
        hint: "Automático = los Hz de tu monitor, como en el navegador. Sin límite el CPU va al 100% y en PCs modestas el juego pierde paquetes (disparos que no registran, ping alto). Con una PC potente puedes subirlo.",
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
      { type: "toggle", key: "highPriority", label: "Prioridad de proceso alta", restart: true, hint: "Le quita CPU al resto de la PC. Úsalo solo si algo en segundo plano te da tirones." },
      { type: "toggle", key: "fpsCounter", label: "Contador de FPS", hint: "Cuenta los cuadros que de verdad dibuja el juego. Fuera de partida lo puedes arrastrar a donde quieras." },
      { type: "range", key: "fpsCounterSize", label: "Tamaño del contador de FPS", min: 9, max: 40 },
    ],
  },
  {
    id: "look",
    title: "Tema y texturas",
    items: [
      { type: "toggle", key: "riteTheme", label: "Tema RITE", hint: "La interfaz de Kirka con el estilo y los colores de RITE WEB." },
      {
        type: "select",
        key: "blockTexture",
        label: "Texturas de bloques",
        reload: true,
        options: [
          ["kirka", "Las de Kirka (o las que pongas en sus ajustes)"],
          ["rite-dark", "RITE Dark"],
          ["custom", "Personalizada (URL)"],
        ],
      },
      { type: "text", key: "customTextureUrl", label: "URL de la textura personalizada", reload: true, placeholder: "https://…/textura.png", hint: "Imagen de 512×512 con el mismo formato que las texturas de Kirka." },
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
    ],
  },
  {
    id: "health",
    title: "En partida",
    items: [
      { type: "toggle", key: "matchStats", label: "Estadísticas en partida", hint: "Junto a tus kills y muertes muestra K/D, asistencias, puntos y % de headshots, cada uno con su color." },
      { type: "toggle", key: "healthColors", label: "Color según tu vida", hint: "Pinta tu barra de vida según cuánta te queda." },
      { type: "toggle", key: "healthCrosshair", label: "El crosshair también cambia de color" },
      { type: "color", key: "healthHighColor", label: "Vida alta" },
      { type: "range", key: "healthHighMin", label: "Vida alta desde (%)", min: 2, max: 100 },
      { type: "color", key: "healthMidColor", label: "Vida media" },
      { type: "range", key: "healthMidMin", label: "Vida media desde (%)", min: 1, max: 99 },
      { type: "color", key: "healthLowColor", label: "Vida baja (por debajo de la media)" },
    ],
  },
  {
    id: "crosshair",
    title: "Crosshair",
    items: [
      { type: "toggle", key: "crosshairEnabled", label: "Crosshair propio", hint: "Solo se ve mientras juegas (con el ratón capturado)." },
      {
        type: "select",
        key: "crosshairStyle",
        label: "Estilo",
        options: [
          ["cross", "Cruz"],
          ["cross-dot", "Cruz con punto"],
          ["dot", "Punto"],
          ["circle", "Círculo"],
        ],
      },
      { type: "color", key: "crosshairColor", label: "Color" },
      { type: "range", key: "crosshairSize", label: "Largo", min: 1, max: 64 },
      { type: "range", key: "crosshairThickness", label: "Grosor", min: 1, max: 16 },
      { type: "range", key: "crosshairGap", label: "Separación", min: 0, max: 64 },
      { type: "range", key: "crosshairOpacity", label: "Opacidad", min: 0, max: 100 },
      { type: "toggle", key: "crosshairOutline", label: "Borde negro" },
    ],
  },
  {
    id: "customization",
    title: "Personalización",
    items: [
      { type: "toggle", key: "tournamentMode", label: "Modo torneo", hint: "Desactiva swapper, userscripts, estilos y el tema RITE." },
      { type: "toggle", key: "swapperEnabled", label: "Resource swapper" },
      {
        type: "buttons",
        buttons: [
          ["Abrir carpeta del swapper", "open-swapper"],
          ["Recargar swapper", "reload-swapper"],
        ],
      },
      { type: "toggle", key: "userstylesEnabled", label: "Userstyles (.css)", restart: true },
      { type: "toggle", key: "userscriptsEnabled", label: "Userscripts (.js)", restart: true, hint: "Activa solo scripts en los que confíes." },
      { type: "customizations" },
      {
        type: "buttons",
        buttons: [
          ["Abrir carpeta de scripts", "open-scripts"],
          ["Abrir carpeta de estilos", "open-styles"],
        ],
      },
      { type: "textarea", key: "customCss", label: "CSS personalizado" },
    ],
  },
  {
    id: "scrims",
    title: "Scrims RITE",
    items: [
      { type: "scrims" },
      { type: "toggle", key: "scrimsEnabled", label: "Scrims RITE", hint: "Colas en vivo, aviso de ¡Listo! y la sala de tu partida con un clic." },
      { type: "toggle", key: "scrimsPanel", label: "Panel de colas", hint: "Ventana flotante en el lobby para entrar y salir de las colas. Se arrastra desde su título y se minimiza con −." },
      { type: "toggle", key: "scrimsPanelInGame", label: "Panel también en partida", hint: "Mientras juegas se ve chico y no estorba al apuntar. Con Esc lo puedes usar normal." },
      { type: "toggle", key: "scrimsAutoResult", label: "Mandar el resultado solo", hint: "Al terminar tu partida (1v1 a 15, 2v2 TDM a 50) manda el marcador y la pantalla final al hilo de la partida. Tu rival lo confirma o lo disputa." },
      { type: "toggle", key: "scrimsAutoLobby", label: "Crear y acomodar la sala", hint: "En tu partida sale «Sala rápida»: arma el lobby de Kirka en tu servidor con el modo y el mapa votado, y el bot pone el link en el hilo (manda el primer link que llegue). Con ⚙ eliges servidor, mapa y minutos antes de crearla. Con el cliente entras solo al lobby, te pasa a tu color (A rojo, B azul) y te marca listo; cuando están todos, arranca. Si eres dueño de la sala, pasa con /teamswap a quien esté en el color equivocado (por su #ID registrado en el bot)." },
      {
        type: "select",
        key: "scrimsRoomRegion",
        label: "Servidor de la Sala rápida",
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
        options: [
          ["4", "4 min"],
          ["8", "8 min"],
          ["15", "15 min"],
          ["30", "30 min"],
          ["60", "60 min"],
        ],
      },
      { type: "buttons", buttons: [["Abrir carpeta de mapas", "open-maps"]] },
      { type: "note", text: "Mapas que Kirka no trae: en Documentos/RITEClient/mapas pon un .txt con el código del mapa (el que exporta el editor de Kirka) y nómbralo como el mapa de la votación, por ejemplo «Mapa Nuevo.txt». Si gana la votación, la sala se crea con ese código." },
      { type: "toggle", key: "scrimsQueueAlert", label: "Avisar cuando alguien entra a una cola", hint: "Con el panel minimizado o en partida: luz parpadeante y un sonido corto." },
      { type: "toggle", key: "scrimsSound", label: "Sonido de aviso" },
      { type: "toggle", key: "riteBadges", label: "Insignia RITE Client", hint: "Muestra el logo de RITE junto al nombre de quienes usan el cliente (en el lobby, amigos, perfiles, tabla y kill feed). Para tenerla tú, vincula tu Discord y pon tu Kirka al registrarte." },
    ],
  },
  {
    id: "client",
    title: "Cliente",
    items: [
      { type: "buttons", buttons: [["Volver al hub", "hub"]] },
      {
        type: "select",
        key: "startGame",
        label: "Al abrir el cliente",
        hint: "El hub es la ventana donde eliges Kirka o VOXARENA. Si abres un juego directo, vuelves al hub con este botón.",
        options: [
          ["hub", "Mostrar el hub"],
          ["kirka", "Abrir Kirka directo"],
          ["voxarena", "Abrir VOXARENA directo"],
        ],
      },
      { type: "toggle", key: "autoFullscreen", label: "Pantalla completa al iniciar" },
      { type: "toggle", key: "discordRpc", label: "Discord Rich Presence" },
      { type: "toggle", key: "autoUpdate", label: "Actualizaciones automáticas" },
      { type: "toggle", key: "betaUpdates", label: "Recibir versiones beta", hint: "Para el staff: también instala las versiones de prueba antes de que salgan para todos." },
      { type: "toggle", key: "devToolsShortcut", label: "Atajo de DevTools (F12)" },
      { type: "keybind", key: "menuKey", label: "Tecla del menú" },
      {
        type: "buttons",
        buttons: [
          ["Exportar ajustes", "export"],
          ["Importar ajustes", "import"],
          ["Abrir capturas", "open-screenshots"],
          ["Reiniciar cliente", "restart"],
          ["Restablecer todo", "reset"],
        ],
      },
    ],
  },
  { id: "about", title: "Acerca de", items: [{ type: "about" }] },
];

module.exports = { SECTIONS };
