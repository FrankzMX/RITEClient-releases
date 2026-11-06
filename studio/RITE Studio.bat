@echo off
rem RITE Studio: abre el estudio en el navegador (necesita Node.js 18+).
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js: instalalo desde https://nodejs.org y vuelve a abrir este archivo. & pause & exit /b 1)
start "" http://127.0.0.1:8790/
node kirka-render.cjs estudio --puerto 8790
pause
