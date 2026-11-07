# Módulos RITE: cómo publicar

Los módulos son scripts de página (como los userscripts) que el cliente baja solo
y aplica al recargar (F5). **Todos viven en el servidor de licencias de RITE**
(proyecto «RITE Licencias» en Railway: Postgres + la función `Licencias`; su dirección
está en `src/main/licencia.js`). Ninguno se publica en GitHub. Código del cliente:
`src/main/licencia.js` (y `src/main/modules.js` para la forma de una entrada). Comando:
`scripts/licencias.js`.

Cada módulo es de uno de dos tipos; tú lo decides al publicarlo y lo cambias cuando quieras:

- **Para todo cliente RITE** («abierto»): el servidor se lo da a cualquier cliente, con o
  sin licencia. Es lo que antes era un módulo público (Custom Skin Link, por ejemplo).
- **Con licencia** (el valor por defecto): solo le llega a las PCs cuya licencia lo abre.

## Con botones: RITE Panel

Doble clic en `scripts/RITE-Panel.bat` (o `npm run panel`). Abre una página en el navegador,
solo en esta PC, con:

- el estado (llaves, sesión de GitHub CLI, rama, última versión);
- **Módulos RITE**: la lista del servidor con **Prender**, **Apagar**, **Para todos** /
  **Solo con licencia** y **Quitar**, y el botón «Borrar la rama pública de GitHub» (ver abajo);
- **Licencias**: crear, revocar, reactivar, liberar y borrar;
- **Rendimiento**: las partidas que mandan los jugadores que aceptaron compartir (RITE Bench), de los últimos 30 días, agrupadas por tarjeta de video y ajustes (también `npm run licencias -- rendimiento`);
- **Publicar**: una lista desplegable con tus módulos. Al elegir uno sale su última versión
  guardada, lista para publicar con un botón (nombre, tipo y si es para todos o con licencia
  se conservan), y «Versiones» muestra las anteriores para regresar a una. «+ Módulo nuevo…»
  abre el formulario completo, con la casilla «Para todo cliente RITE (sin licencia)»;
- la **carpeta de versiones** `Documentos\RITEClient\modulos` («Abrir carpeta»): pon ahí los .js
  nuevos, sueltos o en una carpeta con el id del módulo. Cada archivo que publicas se guarda ahí,
  y «Traer las publicadas» baja la versión vigente de cada módulo del servidor;
- **Actualizar repo** y **Publicar versión firmada** del cliente (sugiere la siguiente beta).

Corre los mismos comandos de abajo y muestra su salida. Deja abierta la ventana negra
mientras lo usas.

## Una sola vez: la llave

```
npm run licencias -- llave
```

- Crea la llave privada en `C:\Users\<tú>\.rite-modulos\llave-privada.pem` y escribe la
  pública en `src/main/modules-key.js`.
- Haz commit de `modules-key.js`, publica una versión del cliente (`npm run publicar`) y pon la
  misma llave pública en la variable `RITE_PUBLIC_KEY` del servidor en Railway. Solo las
  versiones con esa llave reciben módulos, y el servidor solo obedece a esa llave.
- Respalda la llave privada fuera de la PC (USB o gestor de contraseñas). **Nunca** en
  GitHub ni en OneDrive. Si se pierde, hay que sacar otra versión del cliente con llave nueva.

## Publicar, prender o apagar, abrir o cerrar

```
npm run licencias -- publicar CustomSkinLink-RITE.js --id custom-skin-link --version 5.0.4 --abierto --reemplaza "CustomSkinLink.js,CustomSkinLink-RITE.js"
npm run licencias -- publicar Grabador.js --id grabador --version 1.0.0 --apagado
npm run licencias -- prender grabador
npm run licencias -- apagar grabador
npm run licencias -- abrir custom-skin-link        # para todo cliente RITE
npm run licencias -- cerrar custom-skin-link       # solo con licencia
npm run licencias -- modulos
npm run licencias -- codigo custom-skin-link --salida CustomSkinLink-5.0.4.js
npm run licencias -- quitar grabador
```

- `--abierto` lo publica para todo cliente; sin él, un módulo nuevo queda solo con licencia y
  uno ya publicado conserva lo que tenía (`abrir` y `cerrar` lo cambian después).
- `--apagado` lo sube sin mostrarlo a nadie. `prender` lo muestra en el siguiente F5 de
  cada jugador; `apagar` lo quita en el siguiente F5. `quitar` lo borra del servidor.
- `publicar` firma la entrada del módulo (id, versión, SHA-256, nombre…) con tu llave y la sube
  con el código. El cliente vuelve a verificar esa firma y el SHA-256 antes de correrlo: el
  servidor decide quién lo recibe y si está prendido, pero no puede inventar ni cambiar un
  módulo. El servidor guarda una versión por módulo; las anteriores quedan en tu carpeta de
  versiones.
- Lo que se publica va **sin comentarios y minificado** (`scripts/compactar.js`): se conserva
  solo la cabecera `==UserScript==`. Tu archivo con comentarios se queda en la carpeta de
  versiones; nunca sale. `--con-comentarios` lo sube tal cual.
- Otras opciones: `--nombre`, `--descripcion`, `--autor`, `--tipo visual|utilidad|info`,
  `--cambios "texto"`, `--min-client 0.1.0-beta.27`. Sin `--id`, `--nombre` o `--version` se
  toman del encabezado `==UserScript==`.

## Licencias

```
npm run licencias -- crear --nombre "Admin X" [--modulos grabador,reproductor | *] [--nota "..."]
npm run licencias -- lista
npm run licencias -- revocar lic_xxxxxxxxxx       # corte en el siguiente F5 de esa PC
npm run licencias -- reactivar lic_xxxxxxxxxx
npm run licencias -- liberar lic_xxxxxxxxxx       # la suelta de su PC para activarla en otra
npm run licencias -- cambiar lic_xxxxxxxxxx --modulos grabador
npm run licencias -- borrar lic_xxxxxxxxxx
npm run licencias -- bitacora
npm run licencias -- estado
```

- `crear` muestra el código (`RITE-XXXX-XXXX-XXXX`) una sola vez. El jugador lo pega en el menú
  (Módulos RITE → Licencia) y queda ligado a esa PC: en otra PC se rechaza. Para que cambie de
  PC, `liberar`.
- Una licencia abre los módulos «con licencia» que le pongas (`*` = todos). Los módulos «para
  todos» no la necesitan.
- Licencia revocada o pase usado desde otra PC: sus módulos se le borran en el siguiente F5; los
  de «para todos» se quedan. Sin conexión con el servidor, la última copia de un módulo con
  licencia corre un día y luego se pausa; los de «para todos» siguen con su última copia.
- `bitacora` muestra activaciones, rechazos y cambios.

## La rama pública vieja de GitHub

Hasta la 0.1.0-beta.31 los módulos públicos se leían de la rama `modulos` de
`FrankzMX/RITEClient-releases`. Esa rama ya no se usa: el botón «Borrar la rama pública de
GitHub» del panel la borra (`gh api -X DELETE repos/FrankzMX/RITEClient-releases/git/refs/heads/modulos`).
Los clientes anteriores a esta versión siguen leyendo de ahí, así que al borrarla se quedan
sin módulos hasta que actualicen.

## Cómo lo revisa el cliente

- Al abrir, cada 15 minutos y antes de cada carga de la página de Kirka (espera hasta
  2.5 s; si no contesta, usa la última copia verificada).
- Sin licencia pide la lista sin identificarse: no manda nada de la PC. Con licencia manda su
  pase y un hash del identificador de la PC (nunca el identificador, ni el nombre del equipo o
  del usuario).
- Usa ETag para no bajar la lista si no cambió. Rechaza cada entrada cuya firma no sea de RITE
  y cada archivo cuyo SHA-256 no sea el de su entrada.
