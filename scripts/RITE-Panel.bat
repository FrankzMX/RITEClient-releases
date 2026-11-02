@echo off
rem RITE Panel: modulos y versiones del cliente con botones.
rem Para tenerlo en el Escritorio: clic derecho > Enviar a > Escritorio (crear acceso directo).
cd /d "%~dp0.."
title RITE Panel
node scripts\panel.js
pause
