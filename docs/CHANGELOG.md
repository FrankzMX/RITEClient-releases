# Cambios de RITE Client

## Próxima versión: módulos RITE

**RITE Bench: mide cómo corre el juego en tu PC** (nuevo, en «Rendimiento»)
- Cada partida de al menos 30 s se anota con sus FPS promedio, el 1 % y el 0,1 % más lentos, los tirones, el peor cuadro y la RAM y CPU del cliente. Solo cuenta el tiempo jugando (con el mouse en el juego y la ventana visible).
- El menú compara las partidas por ajustes (perfil, backend gráfico, límite de FPS, modo rendimiento, prioridad): arriba queda la combinación con el 1 % más lento más alto, la que menos tirones da en esa PC.
- «Ahora» muestra cuánta RAM y CPU usa el cliente en este momento, por tipo de proceso.
- «Contador detallado»: junto a los FPS, el 1 % más lento y los tirones de los últimos segundos y la RAM.
- Se guarda en `Documentos/RITEClient/rendimiento` y se apaga con «RITE Bench: medir mis partidas».
- Al terminar la primera partida medida, el cliente pregunta una sola vez si quieres compartir tus mediciones con RITE. Es anónimo: FPS, tirones, ajustes de rendimiento y el tipo de PC (procesador, tarjeta de video, RAM), sin nombre, cuenta, IP ni identificador de la PC. Se cambia en «Compartir mediciones con RITE».

**Todos los módulos salen del servidor de RITE, ninguno de GitHub**
- Cada módulo es «para todo cliente RITE» (le llega a cualquiera, como antes Custom Skin Link) o «con licencia» (solo a las PCs cuya licencia lo abre). RITE lo decide al publicarlo y lo cambia cuando quiera con Abrir/Cerrar.
- El cliente sin licencia pide los módulos abiertos sin identificarse: no manda nada de la PC. Con licencia manda su pase y un hash del identificador de la PC (nunca el nombre del equipo, el usuario ni datos personales).
- La rama pública `modulos` de GitHub ya no se usa (el panel tiene un botón para borrarla). Los clientes anteriores a esta versión siguen leyendo de ahí.

**Licencias** (nuevo, en «Módulos RITE» → Licencia)
- RITE reparte un código (`RITE-XXXX-XXXX-XXXX`), el jugador lo pega en el menú y queda ligado a esa PC (una licencia = una PC; en otra PC no sirve).
- Los módulos con licencia llevan la misma firma de RITE que los demás: el servidor decide quién los recibe y si están prendidos, pero no puede inventar ni cambiar uno.
- Si RITE revoca la licencia, sus módulos desaparecen en el siguiente F5; los abiertos se quedan. Sin conexión con el servidor, la última copia de un módulo con licencia sigue un día y luego se pausa.
- Para RITE: una sola lista de módulos en el panel (prender, apagar, para todos / solo con licencia, quitar), sección «Licencias» (crear, revocar, liberar, borrar) y el comando `npm run licencias` (que reemplaza a `npm run modulos`).
- Los módulos se publican sin comentarios y minificados: solo sale la cabecera `==UserScript==`; el archivo con comentarios se queda en la PC de RITE. `--con-comentarios` lo sube tal cual.

**Módulos RITE** (nuevo, sección «Módulos RITE» del menú)
- El cliente baja solo los scripts que publica RITE (el primero será Custom Skin Link) y los aplica al recargar (F5), sin sacar una versión nueva del cliente.
- Van firmados con la llave de RITE: el cliente rechaza cualquier entrada o archivo que no traiga esa firma.
- RITE tiene un interruptor por módulo: si lo apaga, desaparece en el siguiente F5 de cada jugador (el cliente pregunta la lista antes de cargar la página, esperando como máximo 2.5 s).
- Cada jugador puede apagar cualquier módulo, o todos con un interruptor. El modo torneo los apaga todos.
- Sin internet se usa la última copia verificada.
- Si un módulo reemplaza a un userscript que ya tienes en la carpeta (por ejemplo CustomSkinLink.js), el cliente deja de cargar el tuyo para que no corran los dos.

**Login con Discord y Facebook dentro del cliente**
- Kirka manda esos logins por Xsolla (`login.xsolla.com`), que el cliente no conocía: el primer paso se abría en el navegador de Windows y la cuenta nunca llegaba al cliente. Ahora se abre una ventanita de login dentro del cliente, con la misma sesión que Kirka, y al terminar quedas logeado.
- Las páginas de login reciben el user agent normal de Chrome (sin «Electron»), porque Google y Facebook rechazan el login desde Electron.

**Texturas de bloques sin salir de la partida**
- Las texturas de bloques se cambian al momento, también en medio de una partida: ya no hace falta recargar (F5). El cliente sube la imagen nueva encima de la textura que el juego ya tiene en la tarjeta de video, y los mapas que cargan después también la usan.
- **Panel de texturas**: en partida, al hacer ESC sale un panel flotante con Kirka, RITE Dark, tu URL y las imágenes de `Documentos/RITEClient/texturas`. Se arrastra, se minimiza y recuerda su lugar. Se apaga en *Tema y texturas*.
- Carpeta `texturas` nueva: cualquier PNG, JPG o WebP que guardes ahí sale en el panel. Las imágenes grandes se reducen a 256×256, el tamaño en el que Kirka dibuja sus bloques.

## 0.1.0-beta.26: Trade Helper y respaldos del editor de Kirka

**Trade Helper** (nuevo, en el menú del cliente)
- Un panel en el menú de Kirka con las líneas de trade del chat: las ofertas que te manda el servidor («#ID is offering… type /trade accept N»), quién vende (WTS, vendo), quién compra (WTB, compro, busco) y quién cambia (WTT, cambio, «my X for your Y»), con el precio cuando lo dicen (50k, 1.5k coins).
- Filtros (Todo, Ofertas, Venden, Compran, Mis skins); se arrastra, se minimiza con contador de nuevos y recuerda su lugar.
- «Skins que buscas»: las líneas que las nombran salen en oro y avisan.
- Las ofertas traen botones Aceptar / Confirmar / Cancelar que **solo escriben** el comando en tu chat; tú lo envías. Kirka banea a los bots que compran o venden, así que el panel nunca manda nada solo.
- **Precios de referencia de KirkaTrades** (kirka.lukeskywalk.com/priceList.json, pública y sin clave; el cliente la baja cada 30 min): las skins que se nombran salen con su rareza, tipo y precio promedio. Una venta al 85% o menos sale como «Buena oferta» (y avisa), al 130% o más como «Cara». En las ofertas que te llegan dice si ganas o pierdes y cuánto.
- Pestaña **Últimos trades**: los trades completados hoy según KirkaTrades (quién ofreció, qué dio y qué recibió, rareza, cantidad y valor), con buscador por jugador, skin o #trade.
- **Escuchando / En pausa**: con «Escuchando» lee el chat siempre, también durante la partida (más despacio y sin panel); en pausa no lee nada.
- Solo queda lo vigente: un anuncio nuevo del mismo jugador reemplaza al anterior, los anuncios se van a los 15 min y las ofertas se quitan cuando el trade se completa o se cancela.
- Menos falsos positivos: «will u sell ur polar?» o «anyone selling…?» cuentan como compra, y «im not selling it» o «no lo vendo» no cuentan como venta.
- Botones en cada anuncio («Me interesa», «Tengo uno», «Ofrecer trade») que dejan escrito un mensaje o un `/trade offer` en el chat, con un aviso la primera vez. Nunca se manda nada solo.
- Miniatura de cada skin, y al pasar el mouse, la imagen grande con BOLT, FATE, BROS y promedio.
- **Monitor**: a pantalla completa, el chat completo de Kirka a la izquierda (con las líneas de trade marcadas y una caja para escribir) y el helper a la derecha. Esc lo cierra.
- **Oído** (apagado de inicio): Kirka solo manda el chat de Servers mientras ese panel está abierto, así que el oído abre una segunda ventana de Kirka escondida, sin sonido y a ~2 cuadros por segundo, que se queda en Servers con tu misma sesión y sigue leyendo los trades mientras juegas. Las líneas llegan al helper y las importantes salen como aviso. Si no logra abrir Servers solo, «Ver oído» muestra la ventana para abrirlo a mano, y «Ocultar oído» la vuelve a esconder. El oído solo lee: nunca escribe ni manda nada.
- **Mi inventario**: lee tu inventario de Kirka (solo lectura, del mismo juego) y muestra las skins que tienen precio, con su imagen y cuántas tienes. Tocas las que quieres tradear, eliges Vender o Cambiar y te dice cuánto pedir por lo menos (el precio más bajo de BOLT, FATE y BROS) y el promedio. Puedes cambiar el precio, y arma el anuncio («WTS Crazy AR-9 + 2x Polar for 450m coins»), que solo se escribe en tu chat si presionas «Escribir en el chat».
- En Mi inventario: filtros por rareza, por arma (también Personajes, Cofres y Cartas) y «Repetidas» (las que tienes más de una; al tocarla se escogen las que sobran, así no te quedas sin ella). Se ordena por valor, nombre, cantidad o rareza, subiendo o bajando.
- **Oro**: tus Golden Chests salen arriba con su valor (KirkaTrades cuenta cada uno como 1000 coins), y el anuncio puede pedir el pago en coins o en oro («WTS Polar for 3.3k golden»).
- **Mejor precio** (en Mi inventario): usa la lista que más paga (BOLT, FATE o BROS) como tu precio, en cada skin y en el anuncio, y avisa si pides menos; el promedio y la lista más baja quedan de referencia. Los precios del panel ya no llevan «~» (con esa letra parecía un signo de menos), las skins dicen su rareza con palabras y los precios se redondean a 3 cifras (165M queda 165M).
- Las skins nuevas que KirkaTrades todavía no tiene con precio (como Bloodveil) también salen en Mi inventario, como «Sin precio aún»; el anuncio pide ofertas o el precio que tú pongas. En el chat se siguen ignorando.
- Los 6 filtros de rareza salen siempre, con cuántas tienes de cada una.
- **Ofertas reales**: lee el formato que usa Kirka («Ana#5XLY4W is offering their [Yuki||BODY_SKIN|MYTHICAL] for your [Faded|Bayonet|WEAPON_SKIN|MYTHICAL], [Golden||CHEST|LEGENDARY]x600, type **/trade accept 74502**»). Antes no salía ninguna. Cada oferta muestra lo que da y lo que pide con miniatura, cantidad y valor, si te conviene aceptarla, y «Tienes lo que pide» cuando tienes esos items. Son ofertas abiertas a todos: duran 10 minutos en el panel y solo avisan cuando tienes lo que piden o nombran una skin que buscas.
- Los items que los jugadores escriben como [nombre|arma|tipo|rareza] se ven con su nombre limpio, miniatura y precio, en el panel y en el chat del monitor; al pasar el mouse sale la imagen grande. Las respuestas del bot de precios y los comandos (/price, /hm) ya no cuentan como anuncios.
- En el monitor, clic en un mensaje del chat lleva a su tarjeta en el panel.
- Cuando alguien compra una skin que tienes, su tarjeta dice «Tienes N» y te avisa.
- El filtro de las skins que buscas ahora se llama «Busco».
- El panel se hace más ancho o más alto arrastrando la esquina de abajo a la derecha (doble clic vuelve al tamaño normal) y recuerda su tamaño. La cabecera va en dos filas fijas: título, Monitor y minimizar arriba; Escuchando y Oído abajo.
- Se apaga con el modo torneo.

**Pack RITE**
- Las skins de personaje de Halloween (128×128, y Lemonster de 288×256) se oscurecen como personajes con el modo «all»; antes se pintaban como armas, en negro con dorado.

**Editor de mapas**
- Cada vez que entras a TEST MODE, el cliente guarda una copia del mapa en `Documentos/RITEClient/respaldos-editor` (las últimas 30, con nombre del mapa y fecha). Kirka puede autoguardar un mapa a medio cargar si sales del editor mientras vuelve de TEST MODE con «Back to Editor»; con la copia se recupera usando IMPORT. Botón «Respaldos del editor» junto a la carpeta de mapas.

## 0.1.0-beta.24 (sin publicar): updates de Kirka del 26/10 al 30/10

Kirka cambió su HUD (ahora lo dibuja el script de cada modo) y renombró por dentro su store, y en los builds siguientes lo volvió a renombrar (27/10 y 30/10). Esto deja el cliente al día con el build del 30/10 (`app.0312c6a3.js`).

**Estadísticas de partida**
- K/D, asistencias, puntos y HS% vuelven a salir: van en una fila propia debajo de tus kills y muertes del HUD nuevo, con el mismo estilo de sus celdas. Antes buscaban el HUD viejo (`.kill-death`), que ya no existe.

**Lobby RITE**
- Vuelve a acomodar equipos, poner ¡Listo!, modo, mapa, código, minutos y jugadores, crear la partida, cambiar de región y entrar a salas por link: usa los nombres nuevos del store de Kirka. El módulo del lobby se busca por lo que contiene (región, modos y mapas), no solo por su nombre.
- Al crear solo cuenta los modos que Kirka deja crear hoy.
- Si en otro update Kirka vuelve a cambiar sus nombres, el lobby lo dice («hace falta actualizar RITE Client») en lugar de quedarse esperando.

**Resultado automático de scrims**
- Lee el marcador rojo/azul y, en 1v1, tus kills del HUD nuevo. Sin esto no mandaba el resultado al bot.

**Tema RITE**
- El HUD nuevo (celdas de kills, muertes, marcador y tiempo) y el Tab nuevo llevan los colores de RITE; tu fila del Tab se marca en oro. El recoloreo no toca los colores de equipo del HUD.

## 0.1.0-beta.23 (sin publicar): ajustes

**Lobby RITE**
- Al llenarse el lobby, el dueño siempre vuelve a poner el modo, el mapa votado (o su código de la carpeta `mapas`), los minutos y los jugadores de la partida antes de crearla, aunque la sala la haya creado en otra ventana o haya vuelto al hub entre medio (antes solo lo hacía si la misma ventana había creado la sala, y si no, la partida arrancaba en el mapa que tuviera el lobby).
- Antes de crear lee lo que Kirka va a mandar (modo, mapas marcados y código) y, si no quedó el mapa de la partida, no la crea: avisa al dueño para que lo ponga a mano, en lugar de mandar a todos a otro mapa.

**Estadísticas de partida**
- Asistencias y puntos de bandera se cuentan también con las animaciones apagadas (modo rendimiento): Kirka pone y quita la animación del aviso «+ASSIST» / «+POINT» al instante y el contador no lo alcanzaba a ver. Cada aviso cuenta una vez, al aparecer, y el cliente vuelve a buscar la caja de avisos si Kirka la pone después del HUD.
- La bandera de puntos solo sale en partidas con puntos (POINT): aparece con el primer punto y en TDM no se ve.

**Texturas RITE**
- Los bloques de la textura RITE oscuro tienen las orillas más oscuras: en túneles y cuartos con paredes, piso y techo del mismo bloque ya se distingue dónde termina cada uno. Las escaleras, vidrios y bloques con transparencia quedan igual. Se genera con `scripts/texture-edges.py` desde la textura base.

**Links**
- El link de RITE WEB (barra de links, menú del cliente y hub) va a [rite.lat](https://rite.lat/), el dominio de RITE, en lugar de la dirección de Railway. El cliente sigue hablando con la API en la dirección de siempre.

**Scrims RITE entre Kirka y VOXARENA**
- VOXARENA recibe las colas del cliente (`window.riteClient.scrims`: estado en vivo, entrar y salir, ¡Listo!, votación, vincular y registrarse, e ir a la sala) para dibujar su propio panel dentro del juego; así el panel se actualiza con VOXARENA, sin sacar otra versión del cliente. Solo ve los ajustes de scrims.
- En el panel de Kirka, cuando tu partida armada es de VOXARENA, la tarjeta dice «Tu partida es de VOXARENA», cuenta 10 s y abre VOXARENA en la sala. *Me quedo* o ✕ lo detienen y queda el botón *Ir a VOXARENA*. Si estás en partida (en una sala o apuntando), no cuenta: espera a que des clic.

## 0.1.0-beta.22 (sin publicar): HUB nuevo y editable

**Hub**
- Kirka y VOXARENA se eligen por su logo; el cubo de VOXARENA gira en 3D. Abajo, una nota dice que los juegos y sus logos son de sus creadores.
- *Editar HUB*: cada quien acomoda los paneles (Kirka, VOXARENA, Scrims RITE y el chat). Se mueven desde su barra dorada, cambian de tamaño desde la esquina y, soltados sobre otro panel, se intercambian. Trae los acomodos *Clásico*, *Juegos apilados* y *Chat grande*, y *Restablecer*. Se guarda en los ajustes.

**Instalador**
- El instalador va firmado con el certificado de Certum del autor (Open Source Developer Frankz Xavier Garcia y Garcia): Windows ya no lo marca como de un editor desconocido. Se publica desde la PC del autor con `npm run publicar`.

**Scrims RITE en el hub**
- Kirka y VOXARENA se pliegan con un clic en su encabezado, que muestra cuántos hay en cola; se recuerda. La cola en la que estás nunca se esconde.
- Ya no sale «null» entre las colas.

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
