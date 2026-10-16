# Cambios de RITE Client

## 0.1.0-beta.21: hub con Kirka y VOXARENA

**Hub**
- El cliente abre en el hub: una ventana propia con la paleta de RITE (negro, plata, oro y bronce) donde eliges Kirka o VOXARENA. Un juego a la vez; al volver al hub se cierra la ventana del juego y libera su memoria.
- VOXARENA corre en su propia ventana y su propia sesión, aparte de Kirka: sin swapper, userscripts, estilos ni tema del cliente. El juego enciende solo su tema RITE escondido y muestra el botón *Hub RITE*.
- En Kirka, *Volver al hub* está en el menú del cliente → *Cliente*. Ahí mismo, *Al abrir el cliente* deja abrir un juego directo; en el hub, la casilla *Abrir directo el último juego* hace lo mismo.
- Discord Rich Presence dice si estás en el hub, en Kirka o jugando VOXARENA.

**Chat RITE en el hub**
- Un chat de la comunidad en el hub, espejo de #rite-chat del Discord de RITE: lo que escribes sale allá con tu nombre de RITE (lo publica el bot) y lo de Discord sale aquí. Solo con el cliente vinculado; para escribir hay que estar registrado en RITE. Necesita la actualización del bot y de RITE WEB que crea #rite-chat (`/rite-setup`).

**Scrims RITE en el hub**
- La vinculación con Discord se hace una sola vez, desde el hub, y sirve para Kirka y VOXARENA. Ahí mismo te registras en RITE si todavía no estás.
- Panel de colas en el hub: las colas de Kirka y de VOXARENA en vivo, entrar y salir, el ¡Listo! con su cuenta regresiva, tu partida con la votación de mapa y **Entrar a la sala**, que abre el juego de la partida directo en su sala. El panel de dentro de Kirka sigue igual.

## 0.1.0-beta.20: mapas de la carpeta, modo del 1v1 y autor

**Lobby RITE**
- Un mapa de la carpeta `mapas` (su código en «Custom map») ya no se pierde: Kirka sincroniza los ajustes de la party con su servidor mientras entran los jugadores y esa vuelta dejaba el lobby sin el código, así que la partida arrancaba en el mapa activo (por ejemplo Catacombs). Ahora el cliente del dueño vuelve a poner modo, mapa, código, minutos y jugadores justo antes de crear la partida, y avisa si Kirka no tomó el código.
- El 1v1 se crea en TDM (uno rojo y uno azul), como se juega en RITE.

**Proyecto**
- El nombre completo del autor, Frankz Xavier García y García, aparece en el README, la licencia, los créditos y el instalador.

## 0.1.0-beta.19: votación de mapa en el cliente

**Scrims**
- La votación de mapa de la partida sale en la tarjeta y en el panel: un botón por mapa con sus votos, tu voto marcado y lo que queda. Cuenta igual que los botones del hilo.
- Si un mapa junta los votos de la mitad de la partida + 1 (2 en 1v1, 3 en 2v2, 4 en 3v3) queda ese con una cuenta de 3… 2… 1… ¡listo! en lugar de esperar el minuto completo. El cliente consulta justo al terminar la cuenta y no agrega relojes nuevos: la cuenta usa el mismo tic de 1 s que ya tenía el panel.
- «Sala rápida» ya no crea la sala mientras se vota: si la tocas, espera al mapa ganador y la crea en cuanto el bot lo tiene (otro clic la cancela). Antes la creaba sin mapa y Kirka dejaba el que tuviera el lobby.
- El lobby RITE no arranca la partida mientras se vota, y si la partida no tiene mapa votado el aviso lo dice.

## 0.1.0-beta.18: rendimiento

Para que el cliente vaya fluido en PCs modestas sin perder el bot de Discord ni el tema RITE.

**Entrar a la partida**
- El cliente entra a la sala o al lobby dentro de Kirka y lo da por hecho cuando el store de Kirka ya muestra esa sala, sin importar `www.`, query o hash. Mientras Kirka dice que está entrando espera hasta 20 s; solo recarga la página como último recurso y avisa «Recargando para entrar…».
- Un aviso «Entrando…» simple (sin blur ni animación) mientras entra. Dos clics seguidos no entran dos veces.

**Scrims**
- El panel y la tarjeta solo se reconstruyen cuando cambia lo que muestran; el contador «quedan m:ss» y la barra se actualizan en su lugar, así ¡Listo! y No puedo ya no pierden clics.
- El aviso de cola parpadea una vez en lugar de para siempre, y fuera del lobby el panel no usa blur.
- El estado del bot solo llega a la página si cambió. Consulta cada 2 s en el ¡Listo!, 15 s en partida o con la ventana en segundo plano y 20 s sin cola ni partida (al volver a la ventana consulta al momento).
- El lobby RITE solo trabaja con una partida abierta, fuera de partida o en la sala de esa partida; `/teamswap` lo intenta como mucho 3 veces por jugador y el chat de Kirka se busca una sola vez.
- El resultado automático solo mira el marcador en `/games/`, y la captura que va al bot es de 960 px en JPEG 60.

**Tema RITE**
- El recoloreo del tema trabaja en lotes en tiempo libre: lee todos los estilos y luego escribe, recuerda los colores por clase, mira cada elemento una vez, solo vigila elementos nuevos y no trabaja en `/games/` ni mientras entra a una partida.
- Pack RITE: tabla de 256 colores en lugar de calcular cada píxel, texturas recoloreadas guardadas en disco (se revalidan con ETag, con límite de 400 archivos / 200 MB), salida WebP desde la página y la lista de texturas solo con el atajo de DevTools activado.
- Insignias y textura de bloques solo se escriben si cambiaron; las insignias se buscan en tiempo libre.
- Sin `backdrop-filter`: el menú de pausa, los paneles, el menú del cliente y la tarjeta de actualización usan fondos casi opacos.
- Oswald y Outfit vienen con el cliente (WOFF2, `font-display: swap`, licencia OFL en `src/assets/fonts`) y solo se cargan con el tema; ya no se pide nada a Google Fonts.

**Configuración**
- Perfil por defecto: Equilibrado (FPS a los Hz del monitor, la GPU como la elige Chromium). Competitivo sigue disponible y es el único que fuerza flags de GPU y corre a toda velocidad minimizado.
- Prioridad de proceso alta apagada por defecto. Quien venía con Competitivo y prioridad alta (los defaults anteriores) pasa una vez a los nuevos.
- Con la ventana oculta o minimizada Chromium puede bajar el ritmo del juego (salvo en Competitivo).
- Timers de interfaz en pausa mientras apuntas; el color de vida se revisa cada 250 ms.

**Modo rendimiento** (Ajustes → Rendimiento)
- Un interruptor que aplica todo lo ligero junto: nunca Competitivo, FPS fijo, sin prioridad alta, throttling en segundo plano, sin blur ni animaciones, sin recolor del tema, insignias, color de vida, barra de links ni pack RITE, y opcionalmente sin swapper. Los ajustes del jugador quedan guardados para cuando lo apague.
- Se aplica al momento; el perfil de GPU y el límite de FPS fijo, al reiniciar.
