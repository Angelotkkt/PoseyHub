@echo off
title Simply Hub - Creation du .exe
cd /d "%~dp0"

echo.
echo  ============================================
echo     Simply Hub - par PoseyDevs
echo     Creation de l'application Windows (.exe)
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

echo [1/2] Installation des composants...
echo       La premiere fois ca peut prendre 2 a 5 minutes.
echo.
call npm install
if errorlevel 1 goto :error

echo.
echo [2/2] Fabrication du .exe...
echo.
call npm run dist
if errorlevel 1 goto :error

echo.
echo  ============================================
echo   TERMINE !
echo   Dans le dossier "dist" tu as :
echo     - SimplyHub-portable.exe  : se lance directement
echo     - SimplyHub-Setup.exe     : installe l'appli
echo                                avec un raccourci bureau
echo  ============================================
echo.
start "" "%~dp0dist"
pause
exit /b 0

:nonode
echo [ERREUR] Node.js n'est pas installe sur ce PC.
echo.
echo  1. Va sur https://nodejs.org
echo  2. Telecharge et installe la version "LTS"
echo  3. Relance ce fichier
echo.
start "" "https://nodejs.org"
pause
exit /b 1

:error
echo.
echo [ERREUR] Quelque chose a echoue. Regarde les messages au-dessus.
echo Astuce : verifie ta connexion Internet, puis relance ce fichier.
pause
exit /b 1
