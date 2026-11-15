@echo off
title PoseyHub - Test
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installe la version LTS sur https://nodejs.org
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des composants, premiere fois seulement...
  call npm install
  if errorlevel 1 goto :error
)

echo Lancement de PoseyHub...
call npm start
exit /b 0

:error
echo [ERREUR] L'installation a echoue. Verifie ta connexion Internet.
pause
exit /b 1
