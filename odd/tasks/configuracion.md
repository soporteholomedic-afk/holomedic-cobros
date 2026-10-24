# Configuración (tabs: Usuarios / Áreas / Mi firma)

Nueva sección `/configuracion` con tabs que agrupa la gestión de usuarios, un
placeholder de áreas y el editor de firma propia. Reemplaza las entradas sueltas
"Usuarios" y "Mi firma" del sidebar.

## Specs

- **S1**: "vamos a trabajar en un worktree en el puerto: 3001"
- **S2**: "quiero crear una opción en el sidebar: \"Configuración\""
- **S3**: "Dentro quiero tener tabs de: USUARIOS, AREAS (VISTA VACÍA), MI FIRMA."
- **S4** (decisión L2): las entradas "Usuarios" y "Mi firma" del sidebar se
  REEMPLAZAN por "Configuración" (una sola entrada). Las rutas viejas
  `/admin/usuarios` y `/admin/plantillas/firma` siguen funcionando (bookmarks).

## Decisiones de arquitectura

- Sub-rutas por tab, cada una con exactamente un permiso (patrón longest-prefix
  del proxy, precedente `firma_correo`):
  - `/configuracion/usuarios` → `admin`
  - `/configuracion/areas` → `admin`
  - `/configuracion/firma` → `firma_correo`
- `/configuracion` (bare) NO se registra: página server de solo-redirect según
  sesión (sin sesión → login con `?redirect=`, con sesión → primera tab
  permitida, sin permisos → denegado). No expone contenido.
- Sin permisos nuevos en `PERMISOS`.
- USUARIOS reutiliza el CRUD existente: el cliente de 511 líneas de
  `/admin/usuarios/page.tsx` se extrae a `UsuariosPanel.tsx` (named export); la
  página vieja re-exporta → tests viejos verdes.
- MI FIRMA renderiza `FirmaForm` inline (server page + `resolveFirmaPageData`
  de la primera área registrada, precedente `/admin/plantillas/firma`).
- AREAS: vista vacía (placeholder, sin CRUD por ahora).
- Tab bar: `TabsConfiguracion` (client) filtra por `useAuth`: `admin` →
  USUARIOS + AREAS; `firma_correo` → MI FIRMA. Entrada "Configuración" del
  sidebar visible con `admin` OR `firma_correo`, apunta a la primera tab
  permitida, activa en `/configuracion/*`.

## Tasks

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S1 | worktree `feature/configuracion` + dev 3001 | (setup, sin commit) |
| T2 | S3 | `RUTAS_PROTEGIDAS` + `routes.configuracion.test.ts` | `8a9eb18` |
| T3 | S3 | extraer `UsuariosPanel` de `/admin/usuarios` | `507f3bc` |
| T4 | S2, S3 | páginas `/configuracion/*` + tabs + tests | `9dd1bdb` |
| T5 | S2, S4 | sidebar: alta "Configuración", baja "Usuarios"/"Mi firma" + tests | `06104d5` |
| T6 | — | suite focalizada (271 tests) + `tsc --noEmit` + ESLint + smoke curl | transversal |
| T7 | — | commits por unidad | `8a9eb18`..`06104d5` + docs |

Slice boundary (guía ~400 líneas): T3 cuenta ~1239 líneas porque el rename
`page.tsx → UsuariosPanel.tsx` suma ambas caras del archivo; el cambio real es
mecánico (extracción verbatim). Slices: [T2] [T3] [T4] [T5].

## Log

- **L1**: "vamos a trabajar en un worktree en el puerto: 3001. quiero crear una
  opción en el sidebar: \"Configuración\". Dentro quiero tener tabs de:
  USUARIOS, AREAS (VISTA VACÍA), MI FIRMA."
- **L2**: decisión del usuario (ask_user_choice): REEMPLAZAR las entradas
  "Usuarios" y "Mi firma" del sidebar por "Configuración"; las rutas viejas
  siguen funcionando para bookmarks.
