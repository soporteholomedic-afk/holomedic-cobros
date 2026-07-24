# Code Review Rules — Holomedic Cobros

## TypeScript

- Use `const`/`let`; never `var`
- Prefer `interface` over `type` for object shapes; use `type` for unions and primitives
- No `any` — use `unknown` and narrow it, or create a proper type
- Enable and respect strict mode (`tsconfig.json` → `"strict": true`)
- Export types from `src/types/` — do not define shared types inline in components
- Avoid non-null assertions (`!`) unless the null case is structurally impossible and a comment explains why

## React

- Use functional components exclusively — no class components
- Use named exports for components; default exports only for Next.js page/layout files
- Keep components focused: one responsibility per file
- Extract business logic into custom hooks (`useXxx`) — components should not contain raw `fetch` or data-transformation logic
- Prop types must be typed via `interface` — no implicit `any` props
- Avoid `useEffect` for data that can be derived from existing state or props

## Next.js (App Router)

- Server Components by default; add `"use client"` only when strictly necessary (event handlers, hooks, browser APIs)
- API routes live under `src/app/api/` and must return typed responses
- Do not expose secrets or server-only logic in Client Components
- Use `next/navigation` hooks (`useRouter`, `useSearchParams`) — not `next/router`

## State Management

- Prefer local state (`useState`, `useReducer`) for UI state scoped to a component tree
- Lift state up only as far as necessary — avoid prop drilling beyond two levels; use context or composition instead
- Do not store derived data in state; compute it during render or with `useMemo`

## Naming

- Components: `PascalCase`
- Hooks: `camelCase` prefixed with `use`
- Utilities and helpers: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Files mirror their primary export name (`ClientList.tsx` exports `ClientList`)

## Error Handling

- All `async`/`await` calls must handle errors — use try/catch or `.catch()`; never let promises fail silently
- API routes must return meaningful HTTP status codes and a JSON error body
- Validate external data (API responses, form input) before use — do not assume shape

## Testing

- Unit tests alongside source files (`*.test.ts` / `*.test.tsx`)
- Test behavior, not implementation details
- Mock external dependencies (fetch, Supabase client) at the module boundary
- Aim for coverage on utilities and custom hooks; UI tests for critical user flows
- In `sdd-apply` mode, run tests only on modified or affected files; global testing is strictly reserved for `sdd-verify` mode. Running global tests in `sdd-apply` mode is strictly forbidden.

## Style & Formatting

- Follow the existing ESLint config (`eslint.config.mjs`) — no disabling rules without a comment explaining why
- No commented-out code in committed files — use `git stash` or a branch instead
- Imports: external packages first, then internal paths; no unused imports
- In `sdd-apply` mode, run linting only on modified files; global linting is strictly reserved for `sdd-verify` mode. Running global linting in `sdd-apply` mode is strictly forbidden.

## Security

- Never log sensitive data (tokens, passwords, PII) to the console
- Sanitize any HTML rendered via `dangerouslySetInnerHTML`
- Do not commit secrets, API keys, or `.env` files — use environment variables and `.env.local`

### SIGLA Database Access

- **SIGLA exploration**: use the `EXPLORADOR_DATOS` profile only (`HOLOMEDIC_DB_USER=explorar_datos` in `.env.local`). This profile has read-only access to the `SIGLA` database and is safer for querying and inspection.
- **NEVER** use the `SA` profile (`DB_USER=sa`) for exploration. `sa` is an administrative account with full write access — only use it when the application code requires it at runtime (and never for interactive exploration).

## Environment & Shell

- Write and execute all terminal commands specifically for PowerShell compatibility

## Package Manager

- All package installations, upgrades, and removals **MUST** be done with **pnpm** (currently 11.9.0). The lockfile is `pnpm-lock.yaml` and is the source of truth.
- Use `pnpm add <pkg>` to add a runtime dependency and `pnpm add -D <pkg>` for a dev dependency; `pnpm remove <pkg>` to remove one.
- To install all dependencies from the lockfile (after cloning, switching branches, or pulling new commits), use `pnpm install` — never `npm install` or `yarn install`.
- Do NOT use `npm install`, `npm i`, `yarn add`, or any other package manager. Other managers will produce an incompatible `node_modules` and will silently drift from `pnpm-lock.yaml`.
- Run scripts with `pnpm <script>` (e.g., `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build`).
- CI and the Windows SDK sync must also use pnpm — when in doubt, check `package.json` for the `packageManager` field.

## SDK Sync

After every code change (especially to API routes or constants), sync the project to the Windows SDK:

```powershell
.\sync-sdk.ps1
```

This copies the source (excluding `node_modules`, `.next`, `.git`, etc.) directly to `\\172.16.10.12\INSTALADORES\HOLOMEDICSDK` using `robocopy` (native Windows — no WSL needed).

(The old `sync-sdk.sh` was written for WSL/Linux; use `sync-sdk.ps1` from PowerShell instead.)

The sync is **always required** before running the app from the SDK on Windows.

## SIGLA.Cli Sync

The `sigla-cli/` folder holds the compiled .NET runtime the Next.js server spawns to render PDFs (`SIGLA.PdfCli.exe` + `Negocio.dll`, `Entidad.dll`, `Datos.dll` + `rpt/` Crystal Reports templates). It is a **runtime dependency**, not source.

- It is **git-ignored** (see `.gitignore`: `/sigla-cli`).
- It **is synced** to the Windows SDK as part of `sync-sdk.ps1` / `sync-sdk.sh` — do **not** re-add it to the exclude lists.
- The path is resolved at runtime by `src/features/envio-resultados/infrastructure/informes/constants.ts` as `path.resolve(process.cwd(), 'sigla-cli', 'SIGLA.PdfCli.exe')`. Override with the `PDFCLI_EXE_PATH` env var if you need to point at a different binary location.
- Because `robocopy /MIR` is used, deleting `sigla-cli/` locally and re-syncing will **also delete it on the SDK** — do not run the sync with the folder missing unless you intend to.

## Auth & Route Protection

### Route Registration

Al agregar una nueva página que requiera autenticación:
1. Registrar la ruta en `src/features/auth/domain/routes.ts` (array `RUTAS_PROTEGIDAS`)
2. Si se necesita un **nuevo permiso**, agregarlo primero en la constante `PERMISOS` en `src/features/auth/domain/entities.ts`
3. `PERMISOS` es la fuente de verdad única — también alimenta los checkboxes del CRUD de usuarios en `/admin/usuarios`

### Permission Model

Cada ruta protegida requiere exactamente un permiso. El usuario debe tenerlo en su array `permisos` para acceder. Rutas no listadas en `RUTAS_PROTEGIDAS` son públicas (home, login, acceso denegado).

### Comportamiento del Proxy

El proxy (`src/proxy.ts`) evalúa toda navegación a rutas internas con 3 resultados posibles:

| Estado | Resultado |
|---|---|
| Logueado + tiene permiso | Pasa directo (`NextResponse.next()`) |
| No logueado | Redirige a `/auth/login?redirect=<ruta>` |
| Logueado pero sin permiso | Redirige a `/auth/denegado?permiso=<permiso>&label=<label>&ruta=<ruta>` |

## External Workspace Permissions

By explicit user instruction, this agent is permitted to read and write outside the default project root at the following paths:

- `C:\Users\soporte\Desktop\SIGLA`
- `C:\Users\soporte\Desktop\SIGLA\SIGLA.PdfCli`

All other locations outside the working directory remain off-limits unless explicitly authorized.

