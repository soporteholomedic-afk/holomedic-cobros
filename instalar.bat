@echo off
title HOLOMEDIC - Instalacion desde SDK

set "ORIGEN=\\172.16.10.12\instaladores\HOLOMEDICSDK"
set "DESTINO=C:\HOLOMEDIC"

echo ============================================
echo  Copiando SDK a %DESTINO%...
echo ============================================
echo.

:: Verificar que el origen existe
if not exist "%ORIGEN%\iniciar.bat" (
    echo [ERROR] No se encuentra el SDK en %ORIGEN%
    echo Verifica que la red esta accesible.
    pause
    exit /b 1
)

:: Crear destino si no existe
if not exist "%DESTINO%" mkdir "%DESTINO%"

:: Espejo auto-sanador: deja DESTINO identico a ORIGEN (borra archivos
:: viejos que ya no existen en la red). Se excluyen node_modules y .next
:: (los genera iniciar.bat) y los .env* (nunca viajan por la red: se copian
:: manualmente, ver AGENTS.md seccion "SDK Sync").
robocopy "%ORIGEN%" "%DESTINO%" /MIR /XD node_modules .next /XF .env* /R:2 /W:2

:: robocopy: 0-7 = exito (incluye "sin cambios"), 8 o mas = error
if %ERRORLEVEL% GEQ 8 (
    echo [ERROR] Fallo la copia. Codigo robocopy: %ERRORLEVEL%
    pause
    exit /b 1
)

echo [OK] SDK copiado a %DESTINO%
echo.
echo  Ejecutando iniciar.bat...
echo.
cd /d "%DESTINO%"
call iniciar.bat
