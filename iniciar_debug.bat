@echo on
title Holomedic Cobros

cd /d "%~dp0"

echo ============================================
echo   Holomedic Cobros - Servidor de Produccion
echo ============================================
echo.

:: ---- 1. Verificar Node.js ----
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no esta instalado.
    echo Descargalo de: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node:
node -v

:: ---- 2. Verificar / Instalar pnpm ----
where pnpm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [..] Instalando pnpm...
    npm install -g pnpm
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] No se pudo instalar pnpm
        pause
        exit /b 1
    )
)
echo [OK] pnpm:
pnpm -v

:: ---- 3. Verificar .env.local ----
if not exist ".env.local" (
    echo [ERROR] No se encuentra .env.local
    echo Este archivo NUNCA se sincroniza por la red: hay que copiarlo manualmente.
    echo Copialo desde el repositorio del proyecto hacia C:\HOLOMEDIC. Ver AGENTS.md, seccion "SDK Sync".
    pause
    exit /b 1
)

:: ---- 4. Instalar dependencias ----
echo.
echo [1/3] Instalando dependencias...
call pnpm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo la instalacion de dependencias
    pause
    exit /b 1
)

:: ---- 5. Build de produccion ----
echo [2/3] Compilando proyecto...
call pnpm build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo la compilacion
    pause
    exit /b 1
)

:: ---- 6. Iniciar servidor ----
echo [3/3] Iniciando servidor...
echo.
echo  Servidor disponible en: http://localhost:3000
echo  Presiona Ctrl+C para detenerlo.
echo.
start http://localhost:3000
call pnpm start

pause
