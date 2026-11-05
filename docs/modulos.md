# Módulos RITE: cómo publicar

Los módulos son scripts de página (como los userscripts) que el cliente baja solo
y aplica al recargar (F5). Código: `src/main/modules.js`. Comando: `scripts/modulos.js`.

## Con botones: RITE Panel

Doble clic en `scripts/RITE-Panel.bat` (o `npm run panel`). Abre una página en el navegador,
solo en esta PC, con:

- el estado (llaves, sesión de GitHub CLI, rama, última versión);
- la lista de módulos con **Prender**, **Apagar** y **Quitar**;
- **Publicar**: una lista desplegable con tus módulos. Al elegir uno sale su última versión
  guardada, lista para publicar con un botón (nombre, tipo y lo demás se conservan), y
  «Versiones» muestra las anteriores para regresar a una. «+ Módulo nuevo…» abre el formulario
  completo;
- la **carpeta de versiones** `Documentos\RITEClient\modulos` («Abrir carpeta»): pon ahí los .js
  nuevos, sueltos o en una carpeta con el id del módulo. Cada archivo que publicas se guarda ahí,
  y «Traer las publicadas» baja todas las versiones que ya están en GitHub;
- **Actualizar repo** y **Publicar versión firmada** del cliente (sugiere la siguiente beta).

Corre los mismos comandos de abajo y muestra su salida. Deja abierta la ventana negra
mientras lo usas.

## Una sola vez: la llave

```
npm run modulos -- llave
```

- Crea la llave privada en `C:\Users\<tú>\.rite-modulos\llave-privada.pem` y escribe la
  pública en `src/main/modules-key.js`.
- Haz commit de `modules-key.js` y publica una versión del cliente (`npm run publicar`).
  Solo las versiones con esa llave reciben módulos.
- Respalda la llave privada fuera de la PC (USB o gestor de contraseñas). **Nunca** en
  GitHub ni en OneDrive. Si se pierde, hay que sacar otra versión del cliente con llave nueva.

## Publicar y prender o apagar

```
npm run modulos -- publicar CustomSkinLink-RITE.js --id custom-skin-link --version 4.0.1 --reemplaza "CustomSkinLink.js,CustomSkinLink-RITE.js" --apagado
npm run modulos -- prender custom-skin-link
npm run modulos -- apagar custom-skin-link
npm run modulos -- lista
npm run modulos -- quitar custom-skin-link
```

- `--apagado` lo sube sin mostrarlo a nadie. `prender` lo muestra en el siguiente F5 de
  cada jugador; `apagar` lo quita en el siguiente F5.
- Lo que se publica (público o privado) va **sin comentarios y minificado**
  (`scripts/compactar.js`): se conserva solo la cabecera `==UserScript==`. Tu archivo con
  comentarios se queda en la carpeta de versiones; nunca sale. `--con-comentarios` lo sube
  tal cual.
- `npm run modulos -- limpiar-historial` (o «Limpiar historial público» en el panel) vuelve
  a crear la rama `modulos` con un solo commit: la lista firmada y la versión vigente de cada
  módulo. Las versiones anteriores dejan de verse en GitHub. Quien ya clonó la rama conserva
  su copia, y GitHub puede guardar los commits viejos un tiempo (para borrarlos del todo se
  pide a su soporte).
- Otras opciones: `--nombre`, `--descripcion`, `--autor`, `--tipo visual|utilidad|info`,
  `--cambios "texto"`, `--min-client 0.1.0-beta.27`.
- Necesita GitHub CLI con sesión (`gh auth login`) y permiso de escritura en
  `FrankzMX/RITEClient-releases`. La lista vive en la rama `modulos` de ese repo
  (la crea el primer `publicar`).

## Licencias y módulos privados

Un módulo privado solo le llega a quien tenga una licencia de RITE. Viven en el servidor de
licencias (proyecto «RITE Licencias» en Railway: Postgres + la función `Licencias`; su dirección
está en `src/main/licencia.js`), no en el repo público. Código del cliente: `src/main/licencia.js`.
Comando: `scripts/licencias.js`.

```
npm run licencias -- crear --nombre "Admin X" [--modulos grabador,reproductor | *] [--nota "..."]
npm run licencias -- lista
npm run licencias -- revocar lic_xxxxxxxxxx       # corte en el siguiente F5 de esa PC
npm run licencias -- reactivar lic_xxxxxxxxxx
npm run licencias -- liberar lic_xxxxxxxxxx       # la suelta de su PC para activarla en otra
npm run licencias -- cambiar lic_xxxxxxxxxx --modulos grabador
npm run licencias -- borrar lic_xxxxxxxxxx
npm run licencias -- publicar Grabador.js --id grabador --version 1.0.0 [--apagado]
npm run licencias -- prender | apagar | quitar grabador
npm run licencias -- modulos
npm run licencias -- bitacora
```

- Todo va firmado con la misma llave privada de los módulos: el servidor solo obedece esa llave
  (variable `RITE_PUBLIC_KEY` en Railway). Sin ella nadie lo administra, aunque sepa la dirección.
- `crear` muestra el código (`RITE-XXXX-XXXX-XXXX`) una sola vez. El jugador lo pega en el menú
  (Módulos RITE → Licencia) y queda ligado a esa PC: en otra PC se rechaza. Para que cambie de
  PC, `liberar`.
- `publicar` firma la entrada del módulo (id, versión, SHA-256, nombre…) y la sube con el código.
  El cliente vuelve a verificar esa firma antes de correrlo: el servidor decide quién lo recibe
  y si está prendido, pero no puede inventar ni cambiar un módulo. El servidor guarda una versión
  por módulo; las anteriores quedan en tu carpeta de versiones.
- El cliente pide sus módulos privados en cada F5 (con su pase y un hash del id de su PC).
  Licencia revocada o pase usado desde otra PC: se le borran al instante. Sin conexión con el
  servidor, la última copia corre un día y luego se pausa.
- En el panel: «Licencias» (crear, revocar, liberar, borrar), «Módulos privados» (prender,
  apagar, quitar) y la casilla «Privado» en «+ Módulo nuevo…». `bitacora` muestra
  activaciones, rechazos y cambios.

## Cómo lo revisa el cliente

- Al abrir, cada 15 minutos y antes de cada carga de la página de Kirka (espera hasta
  2.5 s; si no contesta, usa la última copia verificada).
- Pregunta a la API de GitHub (sin la caché de 5 min de raw.githubusercontent), con ETag
  para no gastar el límite de 60 consultas por hora. Si la API no deja, usa raw.
- Rechaza la lista si la firma no es de RITE o si su secuencia es menor a la que ya vio,
  y cada archivo si su SHA-256 no es el de la lista.
