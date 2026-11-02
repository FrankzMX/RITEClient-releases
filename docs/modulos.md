# Módulos RITE: cómo publicar

Los módulos son scripts de página (como los userscripts) que el cliente baja solo
y aplica al recargar (F5). Código: `src/main/modules.js`. Comando: `scripts/modulos.js`.

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
- Otras opciones: `--nombre`, `--descripcion`, `--autor`, `--tipo visual|utilidad|info`,
  `--cambios "texto"`, `--min-client 0.1.0-beta.27`.
- Necesita GitHub CLI con sesión (`gh auth login`) y permiso de escritura en
  `FrankzMX/RITEClient-releases`. La lista vive en la rama `modulos` de ese repo
  (la crea el primer `publicar`).

## Cómo lo revisa el cliente

- Al abrir, cada 15 minutos y antes de cada carga de la página de Kirka (espera hasta
  2.5 s; si no contesta, usa la última copia verificada).
- Pregunta a la API de GitHub (sin la caché de 5 min de raw.githubusercontent), con ETag
  para no gastar el límite de 60 consultas por hora. Si la API no deja, usa raw.
- Rechaza la lista si la firma no es de RITE o si su secuencia es menor a la que ya vio,
  y cada archivo si su SHA-256 no es el de la lista.
