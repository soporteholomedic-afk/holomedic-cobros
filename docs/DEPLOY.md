# Despliegue y operación — Holomedic Cobros

Guía operativa de los dos entornos de ejecución del proyecto: el **contenedor Docker de producción (Linux, puerto 3000)** y el **SDK Windows en el share de red**. Todos los comandos y rutas fueron verificados contra los archivos reales del repositorio (`Dockerfile`, `scripts/sync-sdk.mjs`, `sync-sdk.sh`, `sync-sdk.ps1`, `iniciar.bat`, `instalar.bat`, `package.json`, `.env.local.example`).

## Ruta rápida (deploy Docker)

1. `docker build -t holomedic-cobros:latest .`
2. Extraer las variables de entorno del contenedor actual a un env-file (sin imprimirlas).
3. Rotar el contenedor actual a `holomedic-cobros-app-old` (rollback).
4. `docker run` del nuevo contenedor en el puerto 3000.
5. Verificar HTTP 200.

Detalle completo en [A. Deploy Docker](#a-deploy-docker-producción-linux).

---

## A. Deploy Docker (producción Linux)

La imagen es un Dockerfile multi-stage de Next.js con salida `standalone` (`next.config.ts` → `output: 'standalone'`), basado en `node:22-alpine` con pnpm habilitado vía `corepack`. La etapa final instala `chromium` (más `nss`, `freetype`, `harfbuzz`, `ttf-freefont`) porque el generador de PDFs `EdgePrinter` usa `puppeteer-core` sin navegador empaquetado, y lo resuelve con `EDGE_EXECUTABLE_PATH=/usr/bin/chromium-browser`. El contenedor corre como usuario no privilegiado `nextjs` y ejecuta `node server.js` en el puerto 3000.

### Procedimiento de deploy

Paso a paso confirmado por el maintainer. Ejecutar desde la raíz del checkout del repositorio en el host Linux de producción.

**1. Construir la imagen**

```bash
docker build -t holomedic-cobros:latest .
```

**2. Extraer el entorno de runtime del contenedor actual — SIN imprimirlo**

El env-file se genera desde el contenedor en ejecución, filtrando solo los prefijos de credenciales y conexión. Nunca hacer `cat` ni `echo` del resultado: contiene contraseñas de SMTP y SQL Server.

```bash
docker inspect holomedic-cobros-app \
  --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(SMTP_|DB_|HOLOMEDIC_DB_)' > /root/holomedic-cobros.env

chmod 600 /root/holomedic-cobros.env
```

> **Advertencia sobre el filtro**: el patrón `^(SMTP_|DB_|HOLOMEDIC_DB_)` captura credenciales SMTP (incluidas las variantes por propósito `SMTP_USER_FACTURACION`, etc.) y de base de datos, pero **no** captura otras variables de runtime que el código lee: `JWT_SECRET`, `COOKIE_SECURE`, `FILE_SERVER_BASE_PATH` y `PDFCLI_*`. Si el contenedor actual las define, agregarlas al `grep` o al env-file manualmente antes del paso 4.

**3. Rotar el contenedor actual a `-old` (patrón de rollback)**

```bash
# Eliminar el -old de la rotación anterior, si existe
docker rm -f holomedic-cobros-app-old

# Renombrar el actual y detenerlo: queda como rollback instantáneo
docker rename holomedic-cobros-app holomedic-cobros-app-old
docker stop holomedic-cobros-app-old
```

**4. Lanzar el nuevo contenedor**

```bash
docker run -d \
  --name holomedic-cobros-app \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file /root/holomedic-cobros.env \
  -v /mnt/sigla:/mnt/sigla \
  holomedic-cobros:latest
```

El volumen `/mnt/sigla` es el share SMB del archivo de pacientes. En Linux, `src/lib/platform.ts` resuelve `FILE_SERVER_BASE_PATH` por defecto a `/mnt/sigla` (en Windows usa la ruta UNC `\\172.16.10.12\sigla`); por eso el mount debe existir con ese nombre exacto, salvo que se sobrescriba la variable de entorno.

**5. Verificar** — ver [Verificación post-deploy](#verificación-post-deploy).

### Rollback

El contenedor `-old` queda detenido como imagen de rollback instantáneo. Para volver a la versión anterior:

```bash
# Detener y eliminar el contenedor nuevo (el que falló)
docker rm -f holomedic-cobros-app

# Restaurar el -old: renombrar y arrancar
docker rename holomedic-cobros-app-old holomedic-cobros-app
docker start holomedic-cobros-app

# Verificar
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000
```

Nota: el rollback reutiliza el env-file y la imagen del contenedor `-old` tal como estaban; no requiere reconstruir nada.

### Verificación post-deploy

```bash
# HTTP 200 esperado
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000

# El contenedor corre y no reinicia en loop
docker ps --filter name=holomedic-cobros-app
docker logs --tail 50 holomedic-cobros-app
```

- **200** → deploy OK. El contenedor `-old` queda detenido como rollback.
- **Otro código / reinicios en loop** → revisar `docker logs` (falta una env var, SQL Server inalcanzable, mount `/mnt/sigla` ausente) y evaluar el rollback.
- Verificación funcional mínima recomendada: login en la app y una descarga de un informe que toque el share de archivos.

---

## B. Sync al SDK Windows

El engine canónico es `node scripts/sync-sdk.mjs`. Es un **espejo real**: además de copiar archivos cambiados (comparación de tamaño + SHA-256), **BORRA del destino los archivos que ya no existen en el origen**. Los wrappers `sync-sdk.sh` y `sync-sdk.ps1` son delegados finos que solo validan el entorno y forwarding de argumentos.

```bash
# Linux / WSL — requiere el share montado en /mnt/instaladores/HOLOMEDICSDK
./sync-sdk.sh
```

```powershell
# Windows (PowerShell)
.\sync-sdk.ps1
```

Ambos equivalen a ejecutar `node scripts/sync-sdk.mjs` directamente.

| Concepto | Valor |
|---|---|
| Destino (Windows) | `\\172.16.10.12\INSTALADORES\HOLOMEDICSDK` |
| Destino (Linux/WSL) | `/mnt/instaladores/HOLOMEDICSDK` (mount del share) |
| Origen | El checkout desde donde corre el script (resuelto desde la ubicación del propio script, nunca desde el CWD) |
| Flag `--dry-run` | Imprime el plan completo (cada copia y cada borrado) sin mutar nada |
| Overrides | `SDK_SOURCE_DIR` (origen) y `SDK_DEST_DIR` (destino) — seams de test |

### Exit codes

| Código | Significado |
|---|---|
| `0` | Éxito |
| `1` | Fallo de operación de archivos (copy/delete) |
| `2` | Fallo de pre-flight: falta `sigla-cli/SIGLA.PdfCli.exe` en el origen |

### Excluidos y protegidos

**Excluidos del walk del origen** (nunca se copian; constantes `EXCLUDED_DIR_NAMES` / `EXCLUDED_FILE_GLOBS` del engine):

| Directorios | Patrones de archivo |
|---|---|
| `node_modules`, `.next`, `.git`, `openspec`, `sdd`, `docs`, `.gga`, `.codegraph`, `.atl`, `temp`, `tmp` | `*.zip`, `tsconfig.tsbuildinfo`, `*.xlsx`, `.env`, `.env.*`, `.pr-*.md` |

**Protegidos en el destino** (constante `PROTECTED_PATHS` — nunca se borran, aunque no existan en el origen):

- `sigla-cli/` — runtime de PDFs, ver abajo.
- `.env.local` — un espejo jamás debe destruir credenciales del destino.

La protección bloquea el borrado, no la actualización: si el archivo existe en ambos lados y cambia, se copia.

### `sigla-cli/` — runtime dependency git-trackeado

`sigla-cli/` contiene el runtime .NET que el servidor Next.js invoca para renderizar PDFs: `SIGLA.PdfCli.exe` + `Negocio.dll`, `Entidad.dll`, `Datos.dll` + plantillas Crystal Reports en `rpt/`. No es código fuente: es una dependencia de runtime.

- Está **git-trackeado a propósito** (20 archivos, confirmado por el maintainer). Cada clone y cada worktree lo obtiene vía `git checkout` — no hay paso de copia manual.
- **Se sync-ea** al SDK como parte del espejo. No volver a agregarlo a las listas de excludes.
- El path se resuelve en runtime como `path.resolve(process.cwd(), 'sigla-cli', 'SIGLA.PdfCli.exe')` (`src/features/envio-resultados/infrastructure/informes/constants.ts`). Se puede sobrescribir con la variable `PDFCLI_EXE_PATH`.
- Pre-flight del sync: si falta el exe en el origen, aborta (exit 2) antes de tocar el destino, porque un espejo sin el runtime podría borrarlo del share.

### Primera vez contra el share — checklist único

- [ ] **Dry-run y revisión**: `node scripts/sync-sdk.mjs --dry-run`. El primer run anuncia ~11 ghost files verificados más artefactos filtrados (`.codegraph/`, `temp/`, `docs/`, `.gga`, `.pr-1-body.md`) para borrado. El dry-run imprime la lista exacta de borrados para que nada sea sorpresa.
- [ ] **Borrar manualmente el `.env.local` filtrado del share (una sola vez)**. Un `.env.local` quedó en el share por los scripts viejos de solo-copia. Como el engine protege por diseño el `.env.local` del destino, lo escudaría para siempre: hay que eliminarlo a mano. **Nunca automatizar este paso.**
- [ ] **Sync vivo**: `./sync-sdk.sh` (o `.\sync-sdk.ps1`) y spot-check del share.

### `.env.local` NUNCA se sync-ea

`.env` y `.env.*` están excluidos de todo sync. El aprovisionamiento es **manual**: copiar el `.env.local` del checkout de desarrollo a `C:\HOLOMEDIC\.env.local` en la máquina Windows. Ningún script lo hace. `iniciar.bat` detecta la ausencia y muestra el recordatorio del procedimiento antes de abortar.

### Cadena completa del SDK Windows

El sync al share es el primer eslabón; la máquina Windows completa la instalación:

| Paso | Script | Qué hace |
|---|---|---|
| 1 | `sync-sdk.sh` / `sync-sdk.ps1` (dev) | Espeja el checkout al share de red. **Siempre requerido antes de correr la app desde el SDK.** |
| 2 | `instalar.bat` (Windows) | `robocopy /MIR` del share a `C:\HOLOMEDIC` (excluye `node_modules`, `.next`, `.env*`) y ejecuta `iniciar.bat`. |
| 3 | `iniciar.bat` (Windows) | Verifica Node y pnpm, exige `.env.local` presente, luego `pnpm install` → `pnpm build` → `pnpm start` en `http://localhost:3000`. |

---

## C. Entorno y configuración

### Variables de entorno

Fuente de verdad: `.env.local.example` en la raíz del repo (plantilla para armar el `.env.local` de cada entorno) más las lecturas de `process.env` en `src/`. No existen variables `NEXT_PUBLIC_*` en el código.

#### SMTP — envío de correos (`src/utils/sendEmail.ts`)

| Variable | Obligatoria | Nota |
|---|---|---|
| `SMTP_HOST` | Sí | Servidor SMTP (Google Workspace en producción). |
| `SMTP_PORT` | Sí | Puerto SMTP. |
| `SMTP_USER_FACTURACION` / `SMTP_PASS_FACTURACION` | Sí | Credenciales del propósito `facturacion`. |
| `SMTP_USER_CONSOLIDADOS` / `SMTP_PASS_CONSOLIDADOS` | Sí | Credenciales del propósito `consolidados`. |
| `SMTP_USER_COBRANZA` / `SMTP_PASS_COBRANZA` | Opcional | Propósito `cobranza`; si faltan, cae al fallback de `facturacion`. |

Las credenciales son **por propósito**: cada propósito X lee `SMTP_USER_X` / `SMTP_PASS_X`, sin default implícito. Con MFA habilitado, usar App Password. Los nombres legacy `SMTP_USER` / `SMTP_PASS` fueron renombrados (breaking): producción debe usar los sufijados.

#### SQL Server (`src/lib/db.ts`)

| Variable | Obligatoria | Nota |
|---|---|---|
| `DB_HOST` | Sí | Instancia SQL Server del pool SIGLA/legacy. |
| `DB_PORT` | No | Default `1433`. |
| `DB_USER` | Sí | Usuario del pool SIGLA. |
| `DB_PASSWORD` | Sí | Contraseña del pool SIGLA. |
| `DB_NAME` | No | Default del código: `ICCGSA`. |
| `HOLOMEDIC_DB_NAME` | No | Default `HOLOMEDIC`. Siempre se lee. |
| `HOLOMEDIC_DB_HOST` / `_PORT` / `_USER` / `_PASSWORD` | No | Si **alguna** de HOST/USER/PASSWORD está seteada, todo el pool HOLOMEDIC pasa al prefijo `HOLOMEDIC_DB_*`; si ninguna lo está, hereda las `DB_*` (misma instancia, otra base). |

#### Runtime y plataforma

| Variable | Default | Nota |
|---|---|---|
| `JWT_SECRET` | `'dev-secret-change-in-production'` | Firma de los tokens de sesión (`src/proxy.ts`, `src/lib/auth.ts`). **Definir en producción.** |
| `COOKIE_SECURE` | insegura | `'true'` marca la cookie de sesión como `secure`. |
| `FILE_SERVER_BASE_PATH` | Windows: `\\172.16.10.12\sigla` · Linux: `/mnt/sigla` | Raíz del share de archivos de pacientes (`src/lib/platform.ts`). |
| `PDFCLI_EXE_PATH` | `<cwd>/sigla-cli/SIGLA.PdfCli.exe` | Override de la ubicación del binario de PDFs. |
| `PDFCLI_RETRY_TRANSIENT_AUTH` | habilitado | `'0'` deshabilita el retry ante errores de autenticación transitorios del CLI. |
| `EDGE_EXECUTABLE_PATH` | detección automática | Navegador para `EdgePrinter`. La imagen Docker ya lo setea a `/usr/bin/chromium-browser`. |
| `SDK_SOURCE_DIR` / `SDK_DEST_DIR` | — | Overrides del engine de sync (seams de test). |

### Perfiles de base de datos — regla de seguridad

| Perfil | Uso permitido |
|---|---|
| `EXPLORADOR_DATOS` (`HOLOMEDIC_DB_USER=explorar_datos`) | **Único perfil válido para exploración** de la base `SIGLA`. Acceso de solo lectura. |
| `SA` (`DB_USER=sa`) | **JAMÁS para exploración interactiva.** Cuenta administrativa con acceso total de escritura; solo si el código de la aplicación lo requiere en runtime. |

---

## D. Deploy del worker de asistencia (Linux)

El worker de captura (`tools/worker-asistencia/`) **no** es parte del contenedor Docker: corre como servicio systemd nativo en el host Linux, se conecta al lector ZKTeco K20 Pro (TCP 4370) y publica las marcaciones en la API de la app. La app se despliega por la vía estándar de [A. Deploy Docker (producción Linux)](#a-deploy-docker-producción-linux); esa sección no se repite aquí.

> **Nota ADR-10 — sync-sdk no aplica al worker**: `scripts/sync-sdk.mjs` excluye el directorio `tools/` del espejo al share Windows. El worker vive únicamente en este checkout y en el server Linux; jamás se sincroniza al SDK.

### Procedimiento de instalación

Ejecutar desde la raíz del checkout en el host Linux de producción.

**1. Crear el usuario de sistema (sin shell, sin home)**

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin worker-asistencia
```

**2. Crear los directorios de código y de estado**

```bash
sudo mkdir -p /opt/worker-asistencia /var/lib/worker-asistencia
sudo chown -R worker-asistencia:worker-asistencia /opt/worker-asistencia /var/lib/worker-asistencia
```

`/var/lib/worker-asistencia` es el único directorio escribible del servicio: ahí vive el buffer SQLite append-only, y el unit lo declara explícitamente en `ReadWritePaths`.

**3. Copiar el código del checkout**

```bash
sudo rsync -a --delete \
  --exclude 'tests/' --exclude '__pycache__/' \
  tools/worker-asistencia/ /opt/worker-asistencia/
```

**4. Crear el venv e instalar dependencias (PEP 668)**

Las distros modernas bloquean `pip` fuera de un entorno virtual. La única dependencia runtime es `pyzk` (declarada en `requirements.txt`; el resto es stdlib):

```bash
sudo -u worker-asistencia python3 -m venv /opt/worker-asistencia/venv
sudo -u worker-asistencia /opt/worker-asistencia/venv/bin/pip install -r /opt/worker-asistencia/requirements.txt
```

**5. Crear el archivo de entorno**

Partir de la plantilla (las 12 variables que lee `worker/config.py`, 4 requeridas) y completar los valores reales:

```bash
sudo cp tools/worker-asistencia/env.example /etc/worker-asistencia.env
sudo nano /etc/worker-asistencia.env
sudo chown root:worker-asistencia /etc/worker-asistencia.env
sudo chmod 640 /etc/worker-asistencia.env
```

> **DB_PATH en producción**: descomentar `#DB_PATH=/var/lib/worker-asistencia/buffer.sqlite3`. El default del código es relativo (`buffer.sqlite3`) y mezclaría datos con código en `/opt`. El token (`DEVICE_TOKEN`) se obtiene del provisioning — ver el runbook.

**6. Instalar y arrancar el servicio**

```bash
sudo cp tools/worker-asistencia/systemd/worker-asistencia.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now worker-asistencia
```

El unit corre como `worker-asistencia` (jamás root) con hardening mínimo (ADR-11: `ProtectSystem=full`, `ProtectHome=yes`, `NoNewPrivileges=yes`, `ReadWritePaths=/var/lib/worker-asistencia`), elegido para no interferir con el TCP saliente al lector.

**7. Verificar**

```bash
systemctl status worker-asistencia   # active (running), User=worker-asistencia
journalctl -u worker-asistencia -f   # sin errores de arranque
```

Una variable requerida faltante en `/etc/worker-asistencia.env` hace fallar el arranque de forma ruidosa (el servicio reintenta cada 5 s hasta corregirse el env).

### Rollback del worker

```bash
sudo systemctl disable --now worker-asistencia
```

Detiene la captura y deshabilita el arranque automático. El buffer `/var/lib/worker-asistencia/buffer.sqlite3` **no** se borra: es append-only y reenvía las marcas pendientes al restaurar el servicio. El rollback de la app sigue la vía estándar de la [sección A](#a-deploy-docker-producción-linux).

### Go-live completo

Para el checklist ordenado de puesta en producción (verificación de TZ del host SQL, provisioning del dispositivo con rotación de token, smoke end-to-end y operación diaria), ver el [Runbook de go-live de asistencia](./ops/RUNBOOK-asistencia-go-live.md).

## Checklist de deploy completo

- [ ] Cambio mergeado en `develop` y promovido a `master` (ver `docs/DEVELOPMENT.md`).
- [ ] `docker build -t holomedic-cobros:latest .` sin errores.
- [ ] Env-file extraído del contenedor actual con `chmod 600`, sin imprimirlo; filtro revisado contra las variables que el código realmente lee.
- [ ] Contenedor actual rotado a `-old` y detenido.
- [ ] `docker run` con `--restart unless-stopped`, `-p 3000:3000`, `--env-file`, `-v /mnt/sigla:/mnt/sigla`.
- [ ] HTTP 200 verificado; logs sin errores.
- [ ] Si el cambio toca el SDK Windows: sync ejecutado (`./sync-sdk.sh` o `.\sync-sdk.ps1`) y `.env.local` de `C:\HOLOMEDIC` actualizado si cambió alguna variable.
- [ ] Si el deploy incluye el worker de asistencia: instalación de la [sección D](#d-deploy-del-worker-de-asistencia-linux) ejecutada y runbook de go-live completado con su evidencia.
