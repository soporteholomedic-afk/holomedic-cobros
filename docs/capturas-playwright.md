# Capturas de pantalla con Playwright

Herramienta de desarrollo para tomar capturas de pantalla de páginas (locales o remotas) por lote, usando Chromium headless. Sirve para documentar vistas, armar evidencia de QA o comparar flujos de UI.

## Uso

```powershell
# Una URL
pnpm capturas http://localhost:3001/auth/login

# Varias URLs, página completa, salida personalizada
pnpm capturas http://localhost:3001/cobros http://localhost:3001/clientes --pagina-completa --salida temp/shots

# Varias URLs, página completa, salida personalizada y envío por correo
pnpm capturas http://localhost:3001/cobros --pagina-completa --enviar-a operador@ejemplo.com

# Desde un archivo (una URL por línea, '#' = comentario)
pnpm capturas --desde rutas.txt --concurrencia 3
```

Opciones: `--desde`, `--salida` (default `capturas/`), `--ancho`/`--alto` (default 1440×900), `--pagina-completa`, `--concurrencia` (default 2), `--timeout-ms` (default 30000), `--enviar-a`, `--ayuda`.

`--enviar-a correo@dominio` adjunta las capturas exitosas en un solo correo enviado por la cuenta SMTP de facturación (`SMTP_USER_FACTURACION`, misma config que `src/utils/sendEmail.ts`). No envía nada si todas las capturas fallaron.

Los archivos se nombran `<slug>_<fecha-hora>.png` y la salida `capturas/` está en `.gitignore`.

## Notas de RAM (esta máquina: 8 GiB, sin swap)

- Un Chromium headless consume ~300–500 MiB por página abierta.
- La concurrencia por defecto es **2** a propósito: el equipo no tiene swap y un lote con decenas de tabs en paralelo termina en OOM kill.
- No subir `--concurrencia` por encima de **3** sin agregar swap.

## Windows

El browser ya está instalado en el entorno Linux/WSL (`~/.cache/ms-playwright`). En una máquina Windows nueva basta:

```powershell
pnpm install
pnpm exec playwright install chromium --only-shell
```

## Ver las capturas por navegador (VPN/SSH) — canal por defecto

El flujo por defecto es: cada captura se **graba en disco** (`capturas/`) y queda disponible por red en un servidor HTTP propio del repo:

> **http://172.16.10.20:8899/**

Está instalado como **servicio systemd del usuario** (`capturas.service`, con Linger activo: sobrevive reinicios y cierres de sesión):

```bash
systemctl --user status capturas      # estado / logs
systemctl --user restart capturas     # tras cambiar el script
```

- Comando manual equivalente: `pnpm capturas:servir` (opciones `--puerto`, `--host`, `--directorio`).
- Solo sirve `capturas/`: rechaza path traversal y métodos que no sean GET/HEAD.
- Puerto 8899 elegido para no chocar con `pnpm dev` (3001).
- El listado ordena carpetas primero y archivos por fecha (más nuevos arriba).

El envío por email (`--enviar-a`) queda como canal opcional, no por defecto.

## Relación con puppeteer-core

`puppeteer-core` (dependencia runtime) se usa solo para el flujo de impresión PDF (`src/features/musculoesqueletica-pdf/infrastructure/printer/edgePrinter.ts`). Playwright es una devDependency independiente para capturas; no lo usar para PDFs ni reemplazar a puppeteer-core en ese flujo.
