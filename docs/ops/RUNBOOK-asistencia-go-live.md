# Runbook de go-live — Captura de asistencia (ZKTeco K20 Pro)

Checklist ejecutable para poner el worker de asistencia en producción: del servidor con la app deployada a las marcaciones fluyendo al dashboard `/asistencia`, con evidencia registrada en cada paso. La instalación del servicio se hace una sola vez (DEPLOY.md §D); este runbook cubre el orden completo del go-live.

## Ruta rápida

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Verificar TZ del host SQL | Offset `-05:00` confirmado con evidencia |
| 2 | Provisioning del dispositivo | Token generado y guardado en el env del worker |
| 3 | Instalación del worker | Servicio `active (running)` como usuario dedicado |
| 4 | Smoke end-to-end | Marca física → `marcaciones_raw` → dashboard |
| 5 | Fichas y operación diaria | ~35 fichas completadas; pull diario 02:30 activo |
| 6 | (Solo si corresponde) Rollback | Captura detenida; buffer conservado |

---

> ## ⚠️ REGLA DE CONEXIÓN ÚNICA — leer antes de empezar
>
> El K20 Pro admite **UNA sola conexión TCP** (puerto 4370) a la vez.
>
> - **PROHIBIDO** abrir el software PC de ZK (ZKTime, ZKBio, etc.) contra el equipo mientras el worker está corriendo: roba la conexión y la captura se corta.
> - La única vía de conexión al lector es el worker (systemd).
> - **WORKER_CAIADO** es la red de seguridad: si en algún momento el worker queda caído y se necesita diagnosticar con otra herramienta, detener primero el servicio (`sudo systemctl stop worker-asistencia`), usar la herramienta y volver a levantar el worker.

---

## Paso 1 — Verificación de zona horaria del host SQL (cierra R3)

El worker, el equipo y SQL Server comparten el reloj de pared de Lima (America/Lima, UTC-5, sin DST). Una TZ mal configurada genera tardanzas fantasma; por eso se verifica ANTES de provisionar.

**Comando** — contra el SQL Server de producción (sqlcmd o SSMS):

```sql
-- Check 1: offset real de la instancia (esperado: -05:00)
SELECT SYSDATETIMEOFFSET();

-- Check 2: zona configurada a nivel sistema operativo del host
SELECT CURRENT_TIMEZONE();
```

**Esperado**:

| Check | Resultado esperado | Interpretación |
|---|---|---|
| `SYSDATETIMEOFFSET()` | offset **`-05:00`** | La instancia opera en hora de Lima |
| `CURRENT_TIMEZONE()` | `SA Pacific Standard Time` | Nombre **Windows** de `America/Lima` (UTC-5, sin DST). Es el mismo huso: no confundir el nombre con un huso distinto |

**Segundo check (host Linux)** — si el SQL corre en una VM/host Linux accesible:

```bash
timedatectl   # Time zone esperada: America/Lima
```

> **Nota de degradación**: `CURRENT_TIMEZONE()` requiere SQL Server 2016 o superior. En versiones anteriores la consulta falla: degradar el check a `SYSDATETIMEOFFSET()` (offset) + `timedatectl` del host. Con ambos coincidiendo en UTC-5, el paso queda verificado.

**Si falla**: **STOP**. No continuar con el go-live. Corregir la TZ del host SQL (y reiniciar la instancia si el offset no refleja el cambio) y repetir este paso. Continuar con TZ incorrecta garantiza tardanzas fantasma en los reportes.

> **Evidencia — Paso 1**: offset observado `______` · `CURRENT_TIMEZONE()` = `______` · `timedatectl` = `______` · fecha/hora `______` · firma `______`

---

## Paso 2 — Provisioning del dispositivo (+ rotación de token)

Registra el lector en la tabla `dbo.dispositivos` (código, sede, IP) y genera el `DEVICE_TOKEN` que el worker usa como credencial Bearer.

**Comando** — desde la **raíz del checkout** en el server Linux (el script lee el `.env.local` del CWD para conectar a la BD; placeholders `K20-SEDE1`/`"Sede 1"` a reemplazar por el código y sede reales del dispositivo):

```bash
node tools/worker-asistencia/scripts/provisionar_dispositivo.mjs \
  --codigo K20-SEDE1 \
  --sede "Sede 1" \
  --ip 172.16.10.120
```

**Salida esperada** — el token se imprime **UNA sola vez** (el script solo persiste su hash):

```
Accion: registrado
TOKEN (se muestra UNA sola vez; guardalo en el DEVICE_TOKEN del worker — nunca se persiste en claro):
<token>
```

**Acción inmediata**: copiar el token a `/etc/worker-asistencia.env`:

```bash
sudo nano /etc/worker-asistencia.env   # DEVICE_TOKEN=<token>
```

No enviarlo por chat, tickets ni correos. Si el token se pierde antes de guardarse, regenerarlo con `--rotar`.

### Sub-procedimiento: rotación de token (`--rotar`)

Para girar el token de un dispositivo ya registrado (fuga sospechada, rotación periódica):

```bash
node tools/worker-asistencia/scripts/provisionar_dispositivo.mjs \
  --codigo K20-SEDE1 --sede "Sede 1" --ip 172.16.10.120 --rotar
```

Tras rotar, SIEMPRE completar el ciclo en este orden:

1. Copiar el token nuevo (se muestra una sola vez) a `DEVICE_TOKEN` en `/etc/worker-asistencia.env`.
2. `sudo systemctl restart worker-asistencia` — sin restart, el worker sigue presentando el token viejo y la API rechaza sus envíos (401).

> Re-ejecutar el comando SIN `--rotar` es un no-op seguro: no imprime token ni cambia nada.

> **Evidencia — Paso 2**: dispositivo `______` · acción (registrado/rotado) `______` · token guardado en env (sí/no) `______` · restart ejecutado (solo rotación) `______` · fecha/hora `______` · firma `______`

---

## Paso 3 — Instalación del worker

La fuente única del procedimiento es **[DEPLOY.md §D — Deploy del worker de asistencia (Linux)](../DEPLOY.md#d-deploy-del-worker-de-asistencia-linux)**: usuario de sistema, directorios, venv, env, unit y verificación. No se duplica aquí.

**Estado final esperado**:

```bash
systemctl status worker-asistencia
# ● worker-asistencia — Active: active (running)
#   ... con User=worker-asistencia (jamás root)
```

> **Evidencia — Paso 3**: §D pasos 1-7 ejecutados (sí/no) `______` · estado del servicio `______` · fecha/hora `______` · firma `______`

---

## Paso 4 — Smoke end-to-end de captura

Prueba la cadena completa: equipo físico → worker → API → SQL → dashboard.

1. **Marcar** en el equipo reloj con una ficha ya registrada (huella o tarjeta) y anotar la hora exacta de la marca.
2. **Verificar la fila en SQL** (esperar ~1 minuto: el worker envía por lotes cada `SENDER_INTERVALO_SEG`, default 10 s):

   ```sql
   SELECT TOP 10 user_id, fecha_hora, punch, tipo_verificacion
   FROM dbo.marcaciones_raw
   ORDER BY fecha_hora DESC;
   ```

   Debe aparecer la marca recién hecha con el `user_id` de la ficha usada.

3. **Verificar el dashboard `/asistencia`** de la app: la misma marca debe verse en el día en curso.

**Si falla**:

| Síntoma | Dónde mirar |
|---|---|
| No hay fila en `marcaciones_raw` | `journalctl -u worker-asistencia -n 50` — ¿el worker ve el equipo? ¿Hay errores de conexión TCP? Recordar la regla de conexión única (¿software PC ZK robó la conexión?) |
| Fila en SQL pero no en el dashboard | Verificar que la API responde: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/asistencia/...` — se espera HTTP 200; revisar logs del contenedor de la app |
| Errores 401 en journalctl | Token inválido u obsoleto — repetir el sub-procedimiento `--rotar` del Paso 2 |

> **Evidencia — Paso 4**: ficha usada `______` · hora de marca física `______` · fila en `marcaciones_raw` (sí/no) `______` · visible en `/asistencia` (sí/no) `______` · fecha/hora `______` · firma `______`

---

## Paso 5 — Completado de fichas y operación diaria

**Fichas** (una sola vez por go-live): cargar las ~35 fichas de personal desde la UI de **Empleados**, una por una — la cola masiva de fichas está fuera de alcance en esta fase (limitación conocida). Cada ficha queda lista para marcar en el equipo.

**Operación diaria** (a partir de aquí, el sistema se maneja solo):

| Qué | Cuándo | Cómo |
|---|---|---|
| Pull de usuarios/comandos | Diario a las **02:30** (`PULL_HORA`) | Automático — altas/bajas y comandos llegan al equipo al día |
| Captura y envío de marcas | Continuo (lotes cada 10 s) | Automático — buffer append-only si la API no responde |
| Monitoreo read-side | Periódico (recomendado: apertura diaria) | Abrir el dashboard `/asistencia` y confirmar marcas del día; si el dashboard amanece vacío, revisar `journalctl -u worker-asistencia --since yesterday` |

> **Evidencia — Paso 5**: fichas cargadas `____ / ~35` · pull 02:30 confirmado en journal (sí/no) `______` · fecha/hora `______` · firma `______`

---

## Paso 6 — Rollback

Para detener la captura sin perder datos:

```bash
sudo systemctl disable --now worker-asistencia
```

- Detiene el servicio y deshabilita el arranque automático.
- El buffer `/var/lib/worker-asistencia/buffer.sqlite3` **se conserva**: es append-only y las marcas pendientes se reenvían automáticamente al restaurar el servicio (`sudo systemctl enable --now worker-asistencia`).
- El rollback de la **app** (contenedor Docker) sigue el procedimiento estándar de [DEPLOY.md §A — Rollback](../DEPLOY.md#a-deploy-docker-producción-linux).

---

## Checklist de cierre del go-live

- [ ] Paso 1: TZ verificada con evidencia firmada (offset `-05:00`).
- [ ] Paso 2: dispositivo provisionado, token guardado solo en el env.
- [ ] Paso 3: worker `active (running)` como `worker-asistencia`.
- [ ] Paso 4: smoke e2e completo (marca → SQL → dashboard).
- [ ] Paso 5: fichas cargadas y operación diaria confirmada.
- [ ] Caja de conexión única compartida con todo el personal que administre el equipo.
