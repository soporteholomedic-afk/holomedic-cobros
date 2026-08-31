# Módulo Auth

> Ubicación: `src/features/auth/` · Rutas: `/auth/login`, `/auth/denegado`, `/admin/usuarios`, `/api/auth/*`, `/api/usuarios*`

## Propósito

Autentica a los usuarios de la aplicación (JWT en cookie httpOnly) y autoriza el acceso a cada ruta protegida mediante un modelo de permisos planos. Además, provee el CRUD de usuarios que administra esos permisos.

**Lo esencial en tres líneas:**

1. La lista de rutas protegidas vive en `RUTAS_PROTEGIDAS` (`domain/routes.ts`); la lista de permisos válidos vive en `PERMISOS` (`domain/entities.ts`). Ambas son la fuente de verdad única.
2. El proxy (`src/proxy.ts`) evalúa cada navegación: sin token → login (o 401 JSON si es API); sin permiso → `/auth/denegado` (o 403 JSON si es API).
3. Los usuarios persisten en la tabla `dbo.usuarios` de la base de datos `HOLOMEDIC` (no en SIGLA), con contraseña hasheada con bcrypt y permisos almacenados como JSON.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Entidades (`Usuario`, `Permiso`), catálogo de rutas protegidas, puertos y validación de correo | `domain/entities.ts`, `domain/routes.ts`, `domain/ports.ts`, `domain/correo.ts` |
| `application/` | Casos de uso delgados que delegan en el repositorio (login es el único con lógica: bcrypt + JWT) | `application/login.ts`, `application/crearUsuario.ts`, `application/actualizarUsuario.ts`, `application/eliminarUsuario.ts`, `application/listarUsuarios.ts` |
| `infrastructure/` | Adaptador SQL Server de `IUsuarioRepository`, migración idempotente de esquema y singleton de conexión | `infrastructure/getUsuarioDb.ts`, `infrastructure/sqlserver/sqlServerUsuarioRepository.ts`, `infrastructure/sqlserver/migrate.ts`, `infrastructure/sqlserver/errors.ts` |
| `composition/` (fuera del módulo) | El proxy `src/proxy.ts` consume `buscarRutaProtegida`; `src/lib/auth.ts` firma/verifica JWT y lee la sesión | `src/proxy.ts`, `src/lib/auth.ts` |
| `presentation/` | Contexto React de autenticación (cliente) | `presentation/hooks/useAuth.tsx` |

## Puntos de entrada

### Páginas

| Ruta | Archivo | Notas |
|---|---|---|
| `/auth/login` | `src/app/auth/login/page.tsx` | Pública; lee `?redirect=` y devuelve ahí tras un login exitoso |
| `/auth/denegado` | `src/app/auth/denegado/page.tsx` | Pública; muestra `?permiso=`, `?label=`, `?ruta=` |
| `/admin/usuarios` | `src/app/admin/usuarios/page.tsx` | CRUD de usuarios (permiso `admin`); checkboxes generados desde `PERMISOS`; helper local `filterUsuarios.ts` |

### API

| Método y ruta | Handler | Notas |
|---|---|---|
| `POST /api/auth/login` | `src/app/api/auth/login/route.ts` | Valida body, ejecuta `LoginUseCase`, setea cookie `token` |
| `POST /api/auth/logout` | `src/app/api/auth/logout/route.ts` | Limpia la cookie (maxAge 0) |
| `GET /api/auth/me` | `src/app/api/auth/me/route.ts` | Sesión desde cookie + revalidación contra BD (usuario inactivo → 401) |
| `GET` / `POST /api/usuarios` | `src/app/api/usuarios/route.ts` | Listar / crear (requiere permiso `admin` en la sesión) |
| `PUT` / `DELETE /api/usuarios/[id]` | `src/app/api/usuarios/[id]/route.ts` | Actualizar / desactivar (soft delete) |
| `GET` / `POST /api/usuarios/[id]/firma` | `src/app/api/usuarios/[id]/firma/route.ts` | Leer / subir imagen de firma (`VARBINARY(MAX)`) |

### Exportados

| Export | Archivo | Uso |
|---|---|---|
| `PERMISOS`, `Permiso`, `Usuario`, `CreateUsuarioInput`, `UpdateUsuarioInput` | `domain/entities.ts` | Tipos y catálogo compartidos con rutas API y admin |
| `RUTAS_PROTEGIDAS`, `buscarRutaProtegida`, `permisoParaRuta` | `domain/routes.ts` | Consumidos por `src/proxy.ts` |
| `isValidCorreo` | `domain/correo.ts` | Validación de correo (máx. 200 caracteres) |
| `IUsuarioRepository` | `domain/ports.ts` | Contrato del adaptador SQL Server |
| `AuthProvider`, `useAuth` | `presentation/hooks/useAuth.tsx` | Contexto montado en `src/app/layout.tsx` |
| `SqlServerUsuarioRepository`, `migrate`, `UsuarioNotFoundError`, `InvalidCredentialsError` | `infrastructure/sqlserver/index.ts` | Adaptador y errores tipados |

## Flujo de datos

Login (happy path):

1. El usuario envía el formulario en `/auth/login`; `useAuth().login()` hace `POST /api/auth/login` con `{usuario, contrasena}`.
2. La ruta valida el body (`isLoginBody`) y obtiene el repositorio con `getUsuarioDb()` (singleton en caché; la primera llamada abre el pool `HOLOMEDIC`, corre `migrate()` y envuelve el pool en `SqlServerUsuarioRepository`).
3. `LoginUseCase.execute()` busca el usuario por identificador; si no existe, está inactivo o el hash bcrypt no coincide, lanza `InvalidCredentialsError` (siempre el mismo error, sin distinguir la causa).
4. Con credenciales válidas, firma un JWT (`sub`, `nombre`, `area`, `permisos`; expira en 8 h) y la ruta lo setea como cookie `token` httpOnly.
5. En cada navegación posterior, `src/proxy.ts` verifica: ruta pública (`/`, `/auth*`) → pasa; ruta protegida → busca la entrada más específica en `RUTAS_PROTEGIDAS` (prefijo más largo primero), verifica el token y comprueba que el permiso requerido esté en `payload.permisos`.
6. `/api/auth/me` revalida la sesión contra la BD en cada consulta (un usuario desactivado deja de pasar aunque su token siga vigente).

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `src/lib/auth.ts` | `signJwt` / `verifyJwt` / `getSession` / opciones de cookie |
| Interna | `src/lib/db.ts` → `getHolomedicPool()` | Pool SQL Server de la base `HOLOMEDIC` |
| Interna | `src/proxy.ts` | Middleware Next.js que aplica `RUTAS_PROTEGIDAS` |
| Externa | `jsonwebtoken` | Firma y verificación del JWT |
| Externa | `bcryptjs` | Hash (costo 10) y comparación de contraseñas |
| Externa | `mssql` | Acceso a SQL Server |
| BD | `HOLOMEDIC.dbo.usuarios` | Tabla de usuarios (creada/migrada por `migrate()`) |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `JWT_SECRET` | Secreto de firma del JWT (fallback: `'dev-secret-change-in-production'`) | `src/lib/auth.ts` y `src/proxy.ts` |
| `COOKIE_SECURE` | Si es `'true'`, marca la cookie como `secure` | `src/lib/auth.ts` (`getAuthCookieOptions`) |
| `HOLOMEDIC_DB_*` / `DB_*` | Conexión al SQL Server de `HOLOMEDIC` (fallback a `DB_*` si no hay overrides) | `src/lib/db.ts` (`getHolomedicPool`) |
| `COOKIE_NAME = 'token'` | Nombre de la cookie de sesión | `src/lib/auth.ts` |
| Expiración `8h` | Vida del JWT y de la cookie | `src/lib/auth.ts` |
| Seed `admin-001` | Usuario admin inicial (contraseña `Nortel01$`) sembrado solo si la tabla está vacía | `infrastructure/sqlserver/migrate.ts` |

## Cómo probarlo

```bash
pnpm test src/features/auth
```

Archivos de test del módulo:

- `application/__tests__/crearActualizarUsuario.test.ts`
- `domain/__tests__/correo.test.ts`
- `domain/__tests__/routes.test.ts`
- `domain/__tests__/routes.cobranza.test.ts`
- `domain/__tests__/routes.cobranza-historial.test.ts`
- `domain/__tests__/routes.firma.test.ts`
- `domain/__tests__/routes.musculoesqueletica.test.ts`
- `domain/__tests__/valoraciones-route-protection.test.ts`
- `infrastructure/sqlserver/__tests__/migrate.test.ts`
- `infrastructure/sqlserver/__tests__/sqlServerUsuarioRepository.test.ts`

## Gotchas

- **Next.js 16: el middleware se llama `proxy`.** El archivo es `src/proxy.ts` (no `middleware.ts`); exportar la función `proxy` es la convención de Next 16.
- **Páginas vs. API**: el proxy redirige a login/denegado en rutas de página, pero responde `401`/`403` JSON en rutas `/api/*`. Un consumo por script (curl, cron) nunca recibe un redirect.
- **Los permisos viajan dentro del JWT**: un cambio de permisos aplicado en `/admin/usuarios` no toma efecto para una sesión abierta hasta que el token se renueve (re-login, hasta 8 h). `/api/auth/me` sí revalida `activo` contra la BD.
- **Matching por prefijo más largo**: `buscarRutaProtegida` ordena `RUTAS_PROTEGIDAS` por longitud descendente y usa `startsWith`. Una ruta nueva más específica (p. ej. `/admin/plantillas/firma` con permiso `firma_correo`) "gana" sobre el prefijo genérico (`/admin/plantillas` con permiso `plantillas`). Al registrar rutas, verificar qué prefijo existente cubre la nueva.
- **Rutas no listadas son públicas** — cualquier página nueva que requiera sesión debe registrarse en `RUTAS_PROTEGIDAS`, y todo permiso nuevo debe agregarse primero a `PERMISOS`.
- **`JWT_SECRET` con fallback de desarrollo**: si la variable no está definida en producción, todos los tokens se firman con un secreto conocido. Definirla siempre en el entorno productivo.
- **Usuarios en `HOLOMEDIC`, no en SIGLA**: `dbo.usuarios` vive en la base propia (`HOLOMEDIC_DB_*`); SIGLA (`DB_*`, default `ICCGSA`) es solo lectura de datos clínicos.
- **La migración es estructuralmente idempotente** (gates sobre `sys.columns`, sin tabla de versiones) y auto-repara ejecuciones parciales; el backfill de `nombre` usa `sp_executesql` a propósito (SQL Server compila el batch completo contra el esquema previo; un `UPDATE` directo fallaría con "Invalid column name").
- **Soft delete**: eliminar un usuario solo pone `activo = 0`; el historial queda intacto y el login de un usuario inactivo devuelve credenciales inválidas.
- **Permisos como JSON**: la columna `permisos` es `NVARCHAR(MAX)` con un array JSON; el parseo ocurre en `rowToRow` del adaptador.
