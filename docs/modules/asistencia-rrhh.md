# Sistema de Asistencia y RRHH — Plan Técnico (v3)

> Estado: plan cerrado y confirmado por negocio (2026-09-01). Fuente de verdad para las fases SDD.
> Go-live de captura: **septiembre 2026**. El cálculo de septiembre se completa en octubre vía recálculo idempotente.

## 1. Contexto y alcance

- Herramienta **interna de Holomedic** (no es producto multi-cliente).
- **35 personas**, **1 equipo biométrico** (ZKTeco K20 Pro, `172.16.10.120:4370`), **1 sede**.
- Sin empleados remotos ni marcación manual fuera del equipo.
- Único perfil administrador: **RRHH** (sin jefes de área, sin autoservicio de empleados).
- Salida final del sistema: **minutos exactos de tardanza y días de inasistencia** que alimentan **planilla** (descuentos). El cálculo de dinero lo hace planilla; este sistema reporta y congela.

## 2. Decisiones cerradas

| # | Tema | Decisión |
|---|---|---|
| D1 | Arquitectura | Integrado a holomedic-cobros (Next.js), base **HOLOMEDIC** compartida, worker Python en Linux |
| D2 | Extracción | Lib Python `zk` (probada contra el equipo real), worker como servicio systemd |
| D3 | Modo del equipo | **Automático** ("solo apoya el dedo") → punch no informativo, emparejamiento inferido |
| D4 | Tolerancia | Gracia de 5 min = beneficio de **6 usos/mes**; ver R-TOL |
| D5 | Tardanza→falta | NO existe regla de conversión (RIT sin media falta por tardanza) |
| D6 | Horas extra | **Solo computan autorizadas** por RRHH (antes o después del turno); modo `PAGAR`/`COMPENSAR` **por empleado** |
| D7 | Bolsa | Sin vencimiento; RRHH puede anular la acumulación (ajuste auditado) |
| D8 | Vacaciones | RRHH las registra directo (sin flujo de aprobación); validación de traslapes |
| D9 | Días abiertos | Cierre **manual** por RRHH con observación obligatoria |
| D10 | Maestro de empleados | Nace del **sync con el equipo**; RRHH completa la ficha |
| D11 | Historial | Se importa todo el raw del equipo; cálculo desde la primera malla (sept 2026); raw consultable en la web |
| D12 | Descuentos/planilla | Export Excel mensual + cierre mensual congelado |

## 3. Arquitectura

```
[ZKTeco K20 Pro — 172.16.10.120:4370, una sola conexión TCP]
        │ (SDK ZK / lib zk)
        ▼
[Worker Python — servicio systemd en Linux]
  - live_capture() continuo con reconexión exponencial
  - pull completo diario (red de seguridad; JAMÁS clear_data)
  - buffer SQLite append-only (contingencia)
  - set_time() al conectar + alerta si drift > 60 s
  - heartbeat + poll de comandos en cada ciclo de envío
        │ (HTTPS POST + Bearer token del dispositivo)
        ▼
[API Routes — src/app/api/asistencia/*]
  - Ingesta idempotente (dedup por constraint)
  - Motor de cálculo por (empleado, fecha) — recalculable
  - Cierre diario 03:00 + cierre mensual congelado
        ▼
[SQL Server — base HOLOMEDIC (compartida)]  ←→  [UI: src/features/asistencia-rrhh/]
```

- Repositorios siguiendo el patrón del repo: `infrastructure/sqlserver/` + fábrica `getAsistenciaDb.ts` que ejecuta `migrate()` (mismo mecanismo que el resto de la plataforma). DDL dentro del patrón de migraciones del repo, no scripts sueltos.
- El naming final de columnas se alinea a la convención del repo (camelCase, p. ej. `createdAt`) en la fase de diseño; las tablas de alto volumen mantienen PK `BIGINT IDENTITY` (UUID en tablas de millones de filas es anti-patrón).
- Zona horaria uniforme: **America/Lima**, naive local en todo el stack (Perú no tiene DST).

## 4. Modelo de datos (referencia lógica — T-SQL)

```sql
CREATE TABLE empleados (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id VARCHAR(20) NOT NULL UNIQUE,      -- user_id del equipo biométrico
  dni VARCHAR(15) NULL,                     -- se completa al cerrar la ficha
  nombres NVARCHAR(100) NULL, apellidos NVARCHAR(100) NULL,
  area NVARCHAR(80) NULL, cargo NVARCHAR(80) NULL,
  fecha_ingreso DATE NULL,
  fecha_baja DATE NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE_FICHA',
  -- PENDIENTE_FICHA / ACTIVO / INACTIVO / SUSPENDIDO
  modo_extras VARCHAR(10) NOT NULL DEFAULT 'PAGAR', -- PAGAR / COMPENSAR (D6)
  created_at DATETIME2(0) DEFAULT SYSDATETIME()
);

CREATE TABLE dispositivos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  sede NVARCHAR(100), ip VARCHAR(45),
  api_token_hash VARBINARY(64) NOT NULL,
  activo BIT DEFAULT 1,
  ultima_sincronizacion DATETIME2(0) NULL
);

CREATE TABLE turnos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  descripcion NVARCHAR(100),
  hora_entrada TIME(0) NOT NULL,
  hora_salida TIME(0) NOT NULL,             -- <= hora_entrada ⇒ cruza medianoche
  hora_inicio_refrigerio TIME(0) NULL,
  hora_fin_refrigerio TIME(0) NULL,
  minutos_tolerancia_ingreso INT DEFAULT 5, -- default tomado de parámetro
  minutos_refrigerio_permitido INT DEFAULT 60,
  activo BIT DEFAULT 1
);

CREATE TABLE feriados (
  id INT IDENTITY(1,1) PRIMARY KEY,
  fecha DATE NOT NULL, alcance VARCHAR(20) DEFAULT 'NACIONAL',
  descripcion NVARCHAR(150), UNIQUE (fecha, alcance)
);

CREATE TABLE programacion_horarios (
  id INT IDENTITY(1,1) PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  fecha DATE NOT NULL,
  turno_id INT NULL REFERENCES turnos(id),
  es_descanso BIT DEFAULT 0,
  UNIQUE (empleado_id, fecha)
);

CREATE TABLE marcaciones_raw (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  dispositivo_id INT NOT NULL REFERENCES dispositivos(id),
  user_id VARCHAR(20) NOT NULL,
  empleado_id INT NULL REFERENCES empleados(id), -- resuelto en ingesta
  fecha_hora DATETIME2(0) NOT NULL,
  punch INT NOT NULL,                       -- se guarda aunque el modo sea automático
  tipo_verificacion VARCHAR(15) NOT NULL,   -- HUELLA / TARJETA / PIN
  procesada BIT DEFAULT 0,
  created_at DATETIME2(0) DEFAULT SYSDATETIME(),
  CONSTRAINT uq_marcacion UNIQUE (user_id, fecha_hora, punch)
);

CREATE TABLE asistencia_diaria (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  fecha DATE NOT NULL,
  turno_id INT NULL,
  hora_ingreso_real DATETIME2(0) NULL,
  refri_inicio_real DATETIME2(0) NULL,
  refri_fin_real DATETIME2(0) NULL,
  hora_salida_real DATETIME2(0) NULL,
  minutos_tardanza INT DEFAULT 0,
  uso_tolerancia BIT DEFAULT 0,             -- consumió 1 de los 6 usos del mes
  minutos_excedente_refrigerio INT DEFAULT 0,
  minutos_salida_anticipada INT DEFAULT 0,
  minutos_trabajados INT DEFAULT 0,
  minutos_extras INT DEFAULT 0,             -- SOLO tiempo autorizado (antes/después)
  estado_dia VARCHAR(30) DEFAULT 'ASISTIO',
  -- ASISTIO / INASISTENCIA / DIA_ABIERTO / VACACIONES / DESCANSO_MEDICO
  -- / PERMISO / DESCANSO / FERIADO
  observaciones NVARCHAR(400) NULL,
  cerrada BIT DEFAULT 0,                    -- cierre diario
  mes_congelado BIT DEFAULT 0,              -- cierre mensual (planilla)
  recalculada_en DATETIME2(0) NULL,
  UNIQUE (empleado_id, fecha)
);

CREATE TABLE bolsa_movimientos (            -- ledger: saldo = SUM(minutos)
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  fecha DATE NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  -- CREDITO_EXTRA / DEBITO_TARDANZA / DEBITO_SALIDA_ANTICIPADA
  -- / DEBITO_REFRIGERIO / AJUSTE_MANUAL (incluye reset de saldo por RRHH)
  minutos INT NOT NULL,                     -- >0 a favor, <0 en contra (neteo natural)
  asistencia_id BIGINT NULL REFERENCES asistencia_diaria(id),
  usuario_id INT NULL,                      -- autor en ajustes manuales
  comentario NVARCHAR(300),
  created_at DATETIME2(0) DEFAULT SYSDATETIME()
);

CREATE TABLE autorizaciones_extras (        -- D6: extras SOLO autorizadas
  id INT IDENTITY(1,1) PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  fecha DATE NOT NULL,
  hora_inicio TIME(0) NULL,                 -- NULL = desde inicio del día
  hora_fin TIME(0) NULL,                    -- NULL = hasta fin del día
  motivo NVARCHAR(300),
  usuario_id INT NOT NULL,                  -- RRHH que autoriza
  created_at DATETIME2(0) DEFAULT SYSDATETIME()
);

CREATE TABLE solicitudes_vacaciones (
  id INT IDENTITY(1,1) PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  periodo VARCHAR(20),
  fecha_inicio DATE NOT NULL, fecha_fin DATE NOT NULL,
  dias_solicitados INT NOT NULL,
  es_adelantada BIT DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'APROBADO',    -- registro directo RRHH (D8)
  registrado_por INT NOT NULL,
  observacion NVARCHAR(400),
  created_at DATETIME2(0) DEFAULT SYSDATETIME()
);

CREATE TABLE permisos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  tipo VARCHAR(30) NOT NULL,                -- CON_GOCE / SIN_GOCE / CITACION / OTROS
  fecha DATE NOT NULL,
  hora_inicio TIME(0) NULL, hora_fin TIME(0) NULL, -- NULL = día completo
  motivo NVARCHAR(300), documento_url NVARCHAR(500),
  estado VARCHAR(20) DEFAULT 'APROBADO',
  registrado_por INT NOT NULL,
  created_at DATETIME2(0) DEFAULT SYSDATETIME()
);

CREATE TABLE descansos_medicos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  fecha_inicio DATE NOT NULL, fecha_fin DATE NOT NULL,
  numero_citt VARCHAR(50),
  diagnostico_resumen NVARCHAR(255),
  documento_url NVARCHAR(500),
  created_at DATETIME2(0) DEFAULT SYSDATETIME()
);

CREATE TABLE parametros_sistema (
  clave VARCHAR(50) PRIMARY KEY,
  valor NVARCHAR(200) NOT NULL,
  descripcion NVARCHAR(300),
  updated_at DATETIME2(0) DEFAULT SYSDATETIME()
);
-- Valores iniciales:
--   TOLERANCIA_MINUTOS=5, TOLERANCIA_USOS_MES=6 (global, sin override por empleado)
--   MIN_COLAPSO_MARCAS=2, REFRI_MIN_MINUTOS=15, REFRI_MAX_MINUTOS=180
--   TARDANZA_ALARMA_RELOJ_SEG=60

CREATE TABLE alertas (
  id INT IDENTITY(1,1) PRIMARY KEY,
  tipo VARCHAR(40) NOT NULL,
  -- CUOTA_TOLERANCIA_AGOTADA / DIA_ABIERTO_PENDIENTE / DRIFT_RELOJ / WORKER_CAIADO
  -- / USER_ID_DESCONOCIDO / DIA_REABIERTO / TRASLAPES?
  empleado_id INT NULL, detalle NVARCHAR(500),
  fecha DATETIME2(0) DEFAULT SYSDATETIME(),
  atendida BIT DEFAULT 0
);

CREATE TABLE comandos_dispositivo (         -- canal web→worker por POLL
  id INT IDENTITY(1,1) PRIMARY KEY,
  dispositivo_id INT NOT NULL REFERENCES dispositivos(id),
  tipo VARCHAR(30) NOT NULL,                -- DESACTIVAR_USER / SET_TIME / SYNC_COMPLETO
  payload NVARCHAR(MAX),
  estado VARCHAR(20) DEFAULT 'PENDIENTE',   -- PENDIENTE/ENVIADO/CONFIRMADO/ERROR
  created_at DATETIME2(0) DEFAULT SYSDATETIME(),
  enviado_at DATETIME2(0) NULL, confirmado_at DATETIME2(0) NULL
);

CREATE TABLE auditoria (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  tabla NVARCHAR(60), registro_id BIGINT, accion VARCHAR(10),
  datos_anteriores NVARCHAR(MAX), datos_nuevos NVARCHAR(MAX),
  usuario_id INT, created_at DATETIME2(0) DEFAULT SYSDATETIME()
);
```

Notas:
- `uso_tolerancia` en `asistencia_diaria` es el contador de consumo de cuota (un día consume a lo sumo 1 uso).
- El alta por comando web quedó **opcional** (D10): el sync descubre usuarios nuevos; `DESACTIVAR_USER` queda para bajas.

## 5. Motor de cálculo — reglas

**R1 — Día del turno y nocturnos.** `E = fecha + hora_entrada`; si `hora_salida <= hora_entrada`, `S = E + 1 día`. Todo el cálculo en datetime absoluto.

**R2 — Ventana de captura.** Marcas candidatas del empleado en `[E − 4h, S + 6h]`.

**R3 — Colapso de dobles marcas.** Marcas consecutivas del mismo empleado a < `MIN_COLAPSO_MARCAS` (2 min) cuentan como una. Se aplica en el engine; el raw queda intacto.

**R4 — Emparejamiento (modo automático, D3).** `ingreso_real` = primera marca de la ventana; `salida_real` = última; par intermedio con duración 15–180 min = refrigerio (`refri_inicio_real`, `refri_fin_real`). Sin par → refri no marcado (excedente 0 + observación). Si el punch llega informativo (cambio futuro a modo manual), tiene precedencia sobre la inferencia.

**R5 — Marcas faltantes.** Sin ingreso ni salida en día laborable programado → `INASISTENCIA`. Ingreso sin salida → `DIA_ABIERTO` (cálculo parcial + observación). Salida sin ingreso → observación; tardanza no computable. `DIA_ABIERTO` persiste hasta **cierre manual de RRHH** con observación obligatoria (D9); el cierre mensual exige resolver todos los días abiertos.

**R-TOL — Tolerancia con cuota mensual** (D4; la gracia son 5 min y es un beneficio de 6 usos/mes, global, renovado el 1° de cada mes calendario):

| Marca (entrada 08:30, tol 5) | Cuota disponible | Resultado |
|---|---|---|
| ≤ 08:30 | — | tardanza 0 |
| 08:31–08:35 | sí | tardanza 0, **consume 1 uso** |
| 08:31–08:35 | no (agotada) | tardanza = marca − 08:30 (desde la hora) |
| > 08:35 | sí | tardanza = marca − 08:35 (desde el límite) |
| > 08:35 | no (agotada) | tardanza = marca − 08:30 (desde la hora) |

- Solo las llegadas dentro de la gracia consumen uso (1a).
- Agotada la cuota, todo cuenta desde la hora programada, incluidas las graves (1b).
- Al consumir el 6° uso del mes → **alerta RRHH** (`CUOTA_TOLERANCIA_AGOTADA`). Esta alerta reemplaza a la vieja "6 tardanzas" del plan original.
- No existe conversión tardanza→falta (D5): la tardanza siempre son minutos.

**R7 — Refrigerio.** Excedente = máx(0, tomado − asignado). Refri no marcado → excedente 0 + observación.

**R8 — Trabajados.** `minutos_trabajados = (salida − ingreso) − refri tomado` (día abierto: parcial hasta la última marca).

**R-EXTRA — Tiempo fuera del turno** (D6): minutos antes del ingreso y después de la salida computan como `minutos_extras` **solo si caen dentro de una `autorizaciones_extras`** del empleado para esa fecha/rango horario. Si `modo_extras = COMPENSAR` → acreditan en la bolsa (`CREDITO_EXTRA`); si `PAGAR` → van al reporte mensual para planilla. Sin autorización → no computan (quedan visibles como observación).

**R-BOLSA — Ledger.** El cierre diario inserta débitos (`DEBITO_TARDANZA`, `DEBITO_SALIDA_ANTICIPADA`, `DEBITO_REFRIGERIO`) y créditos (`CREDITO_EXTRA`) con `asistencia_id` como referencia. Saldo único neto = `SUM(minutos)`. Sin vencimiento. RRHH puede anular la acumulación → `AJUSTE_MANUAL` auditado (usuario + comentario obligatorio). La compensación de tardanzas con saldo también es un `AJUSTE_MANUAL` aprobado por RRHH (nada automático).

**R10 — Recálculo y cierres.**
- **Cierre diario** (job 03:00): cierra el día D−1 (`cerrada=1`) y evalúa alertas.
- Marca tardía (buffer de contingencia) → re-abre el día (`cerrada=0`), recalcula, alerta `DIA_REABIERTO`.
- **Cierre mensual** (RRHH lo dispara): congela el mes (`mes_congelado=1`); exige todos los días cerrados y sin días abiertos pendientes; después del congelado no hay recálculo (exepto descongelado manual explícito, auditado).
- Recalcular un día = recomputar `asistencia_diaria` + regenerar sus movimientos de bolsa derivados (idempotente).

**R11 — Estados del día (prioridad).** feriado > vacaciones > descanso médico > permiso > descanso programado > cálculo de marcas.

**R-TRASLAPES.** Al registrar vacaciones, permisos o descansos médicos: validar que las fechas no pisen otros períodos ya registrados del mismo empleado → bloqueo con detalle del conflicto (D8/13).

**R-HISTORIAL (D11).** El historial completo del equipo se importa a `marcaciones_raw` (evidencia inmutable). El cálculo diario corre desde la primera malla (septiembre 2026). El raw histórico es consultable en la web por empleado/fecha.

## 6. Contrato API (worker → backend)

```http
POST /api/asistencia/marcaciones
Authorization: Bearer <token del dispositivo>
{
  "codigo_dispositivo": "BIO_SEDE_CENTRAL_01",
  "marcaciones": [
    { "user_id": "72849102", "fecha_hora": "2026-09-01T08:04:12",
      "punch": 0, "tipo_verificacion": "HUELLA" }
  ]
}
→ 200 { "recibidos": 120, "insertados": 118, "duplicados": 2,
        "comandos": [ { "id": 45, "tipo": "DESACTIVAR_USER", "payload": {...} } ] }

POST /api/asistencia/comandos/{id}/confirmar   → ack del worker
POST /api/asistencia/heartbeat                 → actualiza ultima_sincronizacion
```

- Dedup por constraint `uq_marcacion` + `INSERT ... WHERE NOT EXISTS`.
- `user_id` desconocido → se guarda con `empleado_id NULL` + alerta `USER_ID_DESCONOCIDO`.

## 7. Worker Python (producción)

1. Buffer SQLite append-only con cola de envío (pendiente/enviado). Sin `DROP TABLE`.
2. `live_capture()` continuo con reconexión exponencial + pull completo diario como red de seguridad. Jamás `clear_data()`.
3. Retry/backoff: el K20 Pro admite una sola conexión TCP (regla operativa: sin software PC de ZK abierto en paralelo).
4. `set_time()` al conectar + alerta si drift > 60 s.
5. Envía `user_id` (nunca `uid`); no persiste ni envía `password`/`cardno` del equipo.
6. Despliegue: **servicio systemd en Linux** (reinicio automático, watchdog por heartbeat).

## 8. Flujos operativos

- **Alta de empleado**: se enrola en el equipo → el sync (`get_users()`) lo descubre → se crea ficha `PENDIENTE_FICHA` (user_id + nombre) → RRHH completa DNI, apellidos, área, fecha de ingreso → `ACTIVO`. Sus marcas anteriores al cierre de ficha quedan enlazadas al user_id.
- **Baja**: RRHH marca `INACTIVO` + `fecha_baja` → comando `DESACTIVAR_USER` → worker ejecuta `delete_user` → confirmación. El historial de marcas no se toca.
- **Día abierto**: cola RRHH → cierre manual con observación obligatoria.
- **Cierre mensual**: RRHH dispara → validación (días cerrados, sin abiertos) → congelado → export Excel por empleado para planilla.

## 9. UI (`src/features/asistencia-rrhh/`)

Solo RRHH. Permisos en `PERMISOS` (`src/features/auth/domain/entities.ts`) y rutas en `RUTAS_PROTEGIDAS` (`src/features/auth/domain/routes.ts`): `ASISTENCIA_VER`, `ASISTENCIA_GESTIONAR` (malla, ajustes, bolsa, cierres), `ASISTENCIA_ADMIN` (dispositivos, parámetros, exported).

Pantallas: dashboard del día (marcas en vivo + alertas), empleados (fichas + modo extras), malla horaria mensual (con copiar mes anterior), turnos (CRUD), marcadas raw (búsqueda histórico), asistencia diaria (edición/cierre de días abiertos), bolsa (saldos + ajustes), vacaciones/permisos/descansos médicos (con validación de traslapes), autorizaciones de extras, reporte mensual + export Excel, dispositivos/parámetros.

## 10. Cronograma (go-live de captura: septiembre 2026)

| Fase | Sep 2026 | Oct 2026 | Nov 2026 | Dic 2026 |
|---|---|---|---|---|
| **F1** DB + worker + ingesta + UI lectura cruda | ██ | | | |
| **F2** Motor de cálculo + malla + reporte diario | (diseño) | ██ | | |
| **F3** Bolsa + alertas + cierres + vacaciones/traslapes | | | ██ | |
| **F4** Export Excel + bajas + cierre mensual congelado | | | | ██ |

- **Septiembre captura; octubre calcula septiembre**: la ingesta arranca cuanto antes para acumular el raw desde el 1°; el engine (F2) recalcula septiembre completo al estar listo (R10 idempotente).
- El spike SDK ya está hecho ✅ (el riesgo técnico mayor se eliminó antes de F1).

## 11. Riesgos residuales

| Riesgo | Mitigación |
|---|---|
| Conexión única del equipo bloqueada por software PC | Regla operativa + retry/backoff + alerta WORKER_CAIADO |
| Drift de reloj → tardanzas fantasma | `set_time()` al conectar + alarma > 60 s |
| Emparejamiento inferido (modo automático) en refri | Reglas fijas R4 + observaciones; palanca futura: modo manual del equipo |
| Enrolamiento actual con user_ids arbitrarios | Fichas PENDIENTE_FICHA + RRHH completa; user_id queda como clave estable |
| Descuentos → exigencia legal (RIT/planilla) | El sistema reporta minutos/días exactos; dinero lo calcula planilla; asesoría valida el proceso |
| Go-live septiembre con desarrollo en paralelo | F1 minimal (ingesta + raw) es el único bloque de septiembre; el resto recupera por recálculo |
