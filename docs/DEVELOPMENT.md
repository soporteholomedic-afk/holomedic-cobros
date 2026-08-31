# Flujo de desarrollo y ramas — Holomedic Cobros

Cómo se trabaja en este repositorio: el modelo de ramas, el setup inicial, los comandos diarios y las convenciones de código. Fuente de verdad normativa: `AGENTS.md` en la raíz del repo; este documento la operacionaliza.

## Regla de oro

> **Todo el trabajo diario se hace sobre `develop`. `master` solo recibe merges promovidos desde `develop`.**

`master` es la rama de deploy: lo que está en `master` es lo que se construye y despliega (ver `docs/DEPLOY.md`). Nunca se commitea directo a `master` ni se crean ramas desde él.

```
master   ────●────────●──────────  (solo merges promovidos)
                \    /
develop   ──●──●──●──●──●──●──●──  (trabajo diario)
            \   /
feature/…  ──●──  (ramas cortas desde develop)
```

## Setup inicial

```bash
# 1. Clonar
git clone <repo-url> holomedic-cobros
cd holomedic-cobros

# 2. Instalar dependencias — SIEMPRE pnpm (11.9.0), jamás npm/yarn
pnpm install

# 3. Crear .env.local a partir de la plantilla y completar credenciales
cp .env.local.example .env.local
```

- El lockfile es `pnpm-lock.yaml` y es la fuente de verdad. `npm install` o `yarn add` generan un `node_modules` incompatible que deriva del lockfile de forma silenciosa.
- Para agregar/quitar dependencias: `pnpm add <pkg>` (runtime) o `pnpm add -D <pkg>` (dev); `pnpm remove <pkg>` para quitar.
- El detalle de cada variable de entorno está en `docs/DEPLOY.md`, sección "Entorno y configuración".
- La carpeta `sigla-cli/` viene con el clone (está git-trackreada a propósito): no requiere copia manual.

## Comandos diarios

Scripts verificados en `package.json`:

| Comando | Script real | Qué hace |
|---|---|---|
| `pnpm dev` | `next dev --hostname 0.0.0.0 --port 3001` | Servidor de desarrollo en **http://localhost:3001** (no 3000). |
| `pnpm build` | `next build` | Build de producción (salida `standalone`). |
| `pnpm start` | `next start` | Servidor de producción (puerto 3000; así lo usa `iniciar.bat` en el SDK Windows). |
| `pnpm lint` | `eslint` | Linter. |
| `pnpm test` | `vitest run` | Suite de tests en ejecución única. |
| `pnpm test:watch` | `vitest` | Tests en modo watch. |

## Flujo de trabajo con ramas

**1. Feature branch desde `develop`** (nunca desde `master`):

```powershell
git checkout develop
git checkout -b feature/<nombre>
```

**2. Trabajar y merge a `develop`**: commits convencionales en la feature branch, merge a `develop` cuando el cambio está verificado.

**3. Promoción a `master`** (trabajo terminado, verificado y mergeado en `develop`):

```powershell
git checkout master
git merge develop
git push origin master
git checkout develop
```

**4. Política de ramas remotas**: SOLO `master` y `develop` existen en el remoto. Toda feature branch remota se elimina al dejar de ser necesaria:

```powershell
git push origin --delete feature/<nombre>
```

## Reglas de testing y lint por modo

| Modo | Tests | Lint |
|---|---|---|
| Trabajo normal / apply | **Solo archivos modificados o afectados** | **Solo archivos modificados** |
| Verificación completa (verify) | Suite global | Global |

Correr la suite global o el lint completo durante el trabajo diario está prohibido: consume tiempo y ensaya código que no está en scope del cambio.

## Convenciones clave del repo

Resumen operativo; la norma completa está en `AGENTS.md`.

### TypeScript

- `const`/`let`, nunca `var`. Strict mode activo y respetado.
- `interface` para formas de objeto; `type` para uniones y primitivas.
- Prohibido `any`: usar `unknown` y estrechar, o crear un tipo proper.
- Tipos compartidos se exportan desde `src/types/`, no inline en componentes.
- Evitar aserciones no-nulas (`!`) salvo caso estructuralmente imposible, con comentario.

### React y Next.js (App Router)

- Componentes exclusivamente funcionales, con **named exports** (default solo en páginas/layouts de Next.js).
- Server Components por defecto; `"use client"` solo cuando es estrictamente necesario.
- Lógica de negocio en hooks (`useXxx`): sin `fetch` crudo ni transformación de datos en componentes.
- API routes bajo `src/app/api/` con respuestas tipadas y códigos HTTP significativos + cuerpo de error JSON.
- Navegación con `next/navigation` (`useRouter`, `useSearchParams`), no `next/router`.
- Estado derivado no se guarda: se computa en render o con `useMemo`.

### Errores y seguridad

- Todo `async`/`await` maneja errores (try/catch o `.catch()`); jamás promesas que fallan en silencio.
- Validar datos externos (respuestas de API, input de formularios) antes de usarlos.
- No loguear datos sensibles (tokens, contraseñas, PII). No commitear secretos ni `.env`.
- HTML vía `dangerouslySetInnerHTML` se sanitiza siempre.

### Base de datos SIGLA

- Exploración de SIGLA: **solo** perfil `EXPLORADOR_DATOS` (`HOLOMEDIC_DB_USER=explorar_datos`, solo lectura).
- **Nunca** usar `SA` (`DB_USER=sa`) para exploración interactiva.

## Auth y protección de rutas

### Registro de una nueva página protegida

1. Si hace falta un **permiso nuevo**, agregarlo primero a la constante `PERMISOS` en `src/features/auth/domain/entities.ts` — es la fuente de verdad única y también alimenta los checkboxes del CRUD de usuarios en `/admin/usuarios`.
2. Registrar la ruta en el array `RUTAS_PROTEGIDAS` en `src/features/auth/domain/routes.ts` (`path`, `permiso`, `label`).

Cada ruta protegida requiere exactamente un permiso. Las rutas no listadas en `RUTAS_PROTEGIDAS` son públicas (home, login, acceso denegado). El matching es por prefijo `startsWith` con el path más largo primero.

### Comportamiento del proxy (`src/proxy.ts`)

| Estado | Página | API (`/api/...`) |
|---|---|---|
| Logueado + tiene permiso | Pasa directo (`NextResponse.next()`) | Pasa directo |
| No logueado | Redirige a `/auth/login?redirect=<ruta>` | JSON `401` `{ success: false, error: "No autenticado" }` |
| Logueado sin permiso | Redirige a `/auth/denegado?permiso=<permiso>&label=<label>&ruta=<ruta>` | JSON `403` con `permisoRequerido` |

Permisos existentes (verificar siempre contra `PERMISOS` en `entities.ts`): `admin`, `cobranza`, `consolidados`, `valoraciones`, `envio_resultados`, `plantillas`, `firma_correo`, `generar_pdfs`, `informes`, `pacientes`, `jjc`.

## Checklist de cambio completo

Del feature branch al deploy:

- [ ] Feature branch creada desde `develop`.
- [ ] Tests y lint pasados **solo en los archivos modificados**.
- [ ] Si hay páginas nuevas protegidas: permiso en `PERMISOS` + ruta en `RUTAS_PROTEGIDAS`.
- [ ] Si hay env vars nuevas: documentadas en `.env.local.example` y en `docs/DEPLOY.md`.
- [ ] Merge a `develop`; verificación completa del cambio (suite global solo acá).
- [ ] Promoción: `master` ← merge de `develop` → `git push origin master` → volver a `develop`.
- [ ] Feature branch remota eliminada (`git push origin --delete feature/<nombre>`).
- [ ] Deploy Docker según `docs/DEPLOY.md` (build, rotación `-old`, run, HTTP 200).
- [ ] Si el cambio aplica al SDK Windows (API routes, constantes, runtime): sync con `./sync-sdk.sh` o `.\sync-sdk.ps1`, y `.env.local` de `C:\HOLOMEDIC` actualizado a mano si cambiaron variables.

## Worktrees (práctica opcional)

Para cambios grandes que conviven con trabajo en curso, el equipo usa worktrees como siblings del checkout principal:

```bash
mkdir -p ../holomedic-cobros-worktrees
git worktree add ../holomedic-cobros-worktrees/<nombre> -b feature/<nombre> develop
```

- Cada worktree es un checkout completo: `pnpm install` propio, y `sigla-cli/` viene incluido por estar git-trackreado.
- Al terminar: `git worktree remove ../holomedic-cobros-worktrees/<nombre>` y `git worktree prune`.
- No compartir `node_modules` ni `.env.local` entre worktrees; cada uno lleva los suyos.
