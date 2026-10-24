# CRUD de Áreas (catálogo + dropdown en usuarios)

CRUD completo de áreas organizacionales: tabla `dbo.areas`, feature hexagonal
`src/features/areas/`, API `/api/areas`, tab AREAS de `/configuracion` funcional
y formulario de usuarios conectado al catálogo (dropdown). Trabaja a la par con
el agente del feature `configuracion` (mismo worktree, dev :3001).

## Specs

- **S1**: "quiero que trabajes a la par con el agente que está trabajando en la
  configurción en el puerto 3001."
- **S2**: "quiero crear un CRUD para areas."
- **S3**: "Ese dato me servirá para asignar a los usuario a sus respectivas
  aréas."
- **S4** (decisión L2): "CRUD + dropdown en usuarios (recomendado)" — el
  formulario de usuarios elige el área de una lista del catálogo; los valores de
  área existentes se siembran en el catálogo y se conservan.

## Decisiones de arquitectura

- Nueva tabla `dbo.areas` (HOLOMEDIC): `idArea` NVARCHAR(50) PK (UUID),
  `nombre` NVARCHAR(200) NOT NULL UNIQUE, `descripcion` NVARCHAR(500) NULL,
  `activo` BIT NOT NULL DEFAULT 1, `createdAt`/`updatedAt` DATETIME2.
  Soft delete (patrón usuarios): DELETE → `activo = 0`.
- Seed idempotente: `INSERT ... SELECT DISTINCT area FROM dbo.usuarios WHERE
  area <> ''` guardado por `NOT EXISTS` — los valores libres existentes
  se conservan como catálogo.
- Feature hexagonal `src/features/areas/`: `domain` (entities + ports),
  `application` (listar/crear/actualizar/eliminar), `infrastructure/sqlserver`
  (repositorio + migrate + `getAreaDb`).
- API: `GET/POST /api/areas`, `PUT/DELETE /api/areas/[id]`, guard `admin`
  (mismo patrón que `/api/usuarios`), respuestas tipadas.
- UI: el placeholder del tab AREAS se reemplaza por server page +
  `AreasPanel` (client) — listar, crear, editar, activar/desactivar.
- UsuariosPanel: el input de texto libre `area` pasa a `<select>` alimentado
  por `GET /api/areas` (incluye el valor actual del usuario como opción de
 Respaldo si no está en el catálogo).
- Sin permisos nuevos: `/configuracion/areas` ya exige `admin` (routes.ts).
- Convivencia con el otro agente: commits solo con archivos propios
  (`git add <paths>`), superficie email/firma intocada.

## Tasks

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S1 | doc + espejo Engram + todo | (setup, sin commit) |
| T2 | S2, S4 | `src/features/areas/` dominio+app+infra, migrate+seed, tests | `65ecf5a` |
| T3 | S2 | API `/api/areas` + `/api/areas/[id]` + tests | `41a7902` |
| T4 | S2, S3 | tab AREAS: `AreasPanel` + tests (reemplaza placeholder) | `c0be7f1` |
| T5 | S3, S4 | UsuariosPanel: dropdown de áreas + tests | `755ebd2` |
| T6 | S1, S2 | suite focalizada (150) + `tsc` + ESLint + smoke :3001 + migración real contra SQL Server | `ae44888` |
| T7 | S1, S2 | commits por unidad + sync SDK (omitido: share no montado) + memoria | (este commit) |

Slice boundary (guía ~400 líneas): cada unidad es un commit propio;
T2 (~460 líneas con tests) y T4 (~430) exceden levemente la guía por
ir tests+impl juntos (una sola unidad de comportamiento). El contador
de rama (3656 líneas / 10 commits desde origin/master) incluye las
unidades del otro agente del feature `configuracion`.

## Log

- **L1**: "quiero que trabajes a la par con el agente que está trabajando en la
  configurción en el puerto 3001. quiero crear un CRUD para areas. Ese dato me
  servirá para asignar a los usuario a sus respectivas aréas."
- **L2**: decisión del usuario (ask_user_choice): "CRUD + dropdown en usuarios
  (recomendado)" — conectar el formulario de usuarios al catálogo de áreas.
- **L3**: verificación contra la DB real (test temporal, no commiteado)
  destapó que `dbo.areas` YA EXISTÍA en HOLOMEDIC: tabla legacy del
  2026-10-03 (idArea, nombre UNIQUE, createdAt; 0 filas; sin consumidores
  en el código). Tres fixes runtime-verificados en `ae44888`: adopción
  aditiva (ALTER ADD descripcion/activo/updatedAt con gates), CREATE INDEX
  diferido con `sp_executesql` (el batch compila contra el esquema
  pre-migración y fallaba con "Invalid column name 'activo'"), y COLLATE
  DATABASE_DEFAULT en ambos lados del seed (error 468 por collations
  dispares). Resultado: catálogo sembrado con admin, Consolidados,
  Facturación, Medicina General; legacy constraints intactos.
- **L4**: sync SDK omitido: `/mnt/instaladores/HOLOMEDICSDK` no está
  montado en esta sesión. Correr `./sync-sdk.sh` desde el worktree antes
  de usar la app desde el SDK en Windows.
