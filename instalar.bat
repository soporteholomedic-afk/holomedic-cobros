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

:: Copiar todo (sobrescribe)
xcopy "%ORIGEN%\*" "%DESTINO%\" /E /Y /I /R

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo la copia.
    pause
    exit /b 1
)

echo [OK] SDK copiado a %DESTINO%
echo.
echo  Ejecutando iniciar.bat...
echo.
cd /d "%DESTINO%"
call iniciar.bat
