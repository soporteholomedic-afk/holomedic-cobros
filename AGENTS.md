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

## Git Workflow (Deployment Flow)

Flujo de despliegue obligatorio:

1. **Trabajar SIEMPRE en `develop`** — todo el trabajo diario se hace sobre `develop`. `master` solo recibe merges promovidos desde `develop`.
2. **Feature branches desde `develop`** — toda rama de feature se crea a partir de `develop`, nunca desde `master`:
   ```powershell
   git checkout develop
   git checkout -b feature/<nombre>
   ```
3. **Promoción a `master`** — al terminar el trabajo en `develop` (verificado y mergeado), se promueve a `master` local y se sube al remoto:
   ```powershell
   git checkout master
   git merge develop
   git push origin master
   git checkout develop
   ```
4. **Política de ramas remotas** — SOLO `master` y `develop` pueden existir en el remoto. Cualquier otra rama remota (feature/fix/feat) debe eliminarse al dejar de ser necesaria:
   ```powershell
   git push origin --delete <rama>
   ```

## Package Manager

- All package installations, upgrades, and removals **MUST** be done with **pnpm** (currently 11.9.0). The lockfile is `pnpm-lock.yaml` and is the source of truth.
- Use `pnpm add <pkg>` to add a runtime dependency and `pnpm add -D <pkg>` for a dev dependency; `pnpm remove <pkg>` to remove one.
- To install all dependencies from the lockfile (after cloning, switching branches, or pulling new commits), use `pnpm install` — never `npm install` or `yarn install`.
- Do NOT use `npm install`, `npm i`, `yarn add`, or any other package manager. Other managers will produce an incompatible `node_modules` and will silently drift from `pnpm-lock.yaml`.
- Run scripts with `pnpm <script>` (e.g., `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build`).
- CI and the Windows SDK sync must also use pnpm — when in doubt, check `package.json` for the `packageManager` field.

## SDK Sync

After every code change (especially to API routes or constants), sync the project to the Windows SDK. The canonical flow is the Node engine `scripts/sync-sdk.mjs` — a true mirror that deletes destination files no longer present in the source. Both wrappers are thin delegates to it:

```powershell
# Windows (PowerShell)
.\sync-sdk.ps1
```

```bash
# Linux/WSL (requires the share mounted at /mnt/instaladores/HOLOMEDICSDK)
./sync-sdk.sh
```

Both are equivalent to running `node scripts/sync-sdk.mjs` directly. Supported flag: `--dry-run` prints the full plan (every copy and every deletion) and mutates nothing.

The destination is `\\172.16.10.12\INSTALADORES\HOLOMEDICSDK` (Windows) or `/mnt/instaladores/HOLOMEDICSDK` (mounted share). Excluded from the mirror: `node_modules`, `.next`, `.git`, `openspec`, `sdd`, `docs`, `.gga`, `.codegraph`, `.atl`, `temp`, `tmp`, and the file patterns `*.zip`, `tsconfig.tsbuildinfo`, `*.xlsx`, `.env`, `.env.*`, `.pr-*.md`. Protected on the destination (never deleted, even when absent from the source): `sigla-cli/` and a destination-resident `.env.local`.

The sync is **always required** before running the app from the SDK on Windows. The engine refuses to run when `sigla-cli/SIGLA.PdfCli.exe` is missing from the source checkout (exit 2) — a mirror without the runtime could delete it from the share. Exit codes: 0 success, 1 runtime failure, 2 pre-flight failure.

### `.env.local` is NEVER synced — manual copy

`.env` and `.env.*` files are excluded from every sync. `.env.local` must be provisioned **manually**: copy it from your repo checkout (dev machine) to `C:\HOLOMEDIC\.env.local` on the Windows machine. It is **not** on the network share anymore, and no script will put it there. `iniciar.bat` reminds the operator of this procedure when it detects the file missing.

### First run against the share — one-time steps

1. **Review first**: run `node scripts/sync-sdk.mjs --dry-run` before the first live sync. The first run announces 11 verified ghost files plus leaked artifacts (`.codegraph/`, `temp/`, `docs/`, `openspec/`, `.gga`, `.pr-1-body.md`) for deletion; the dry-run prints the exact delete list so nothing is a surprise.
2. **Manually delete the leaked share `.env.local` once.** A `.env.local` currently sits on the share, leaked by the old copy-only scripts. The engine protects destination-resident `.env.local` by design (a mirror must never destroy credentials), which means it will shield this leaked copy forever — it must be removed by hand, one time. Never automate this step.
3. Then run the live sync and spot-check the share.

## SIGLA.Cli Sync

The `sigla-cli/` folder holds the compiled .NET runtime the Next.js server spawns to render PDFs (`SIGLA.PdfCli.exe` + `Negocio.dll`, `Entidad.dll`, `Datos.dll` + `rpt/` Crystal Reports templates). It is a **runtime dependency**, not source.

- It is **git-tracked** (20 files, no `.gitignore` entry). Earlier docs claimed it was git-ignored — that claim is stale. (Explicit confirmation of the tracking intent is still pending; treat the tracked status as current reality until decided otherwise.)
- Because it is tracked, every clone and every worktree gets it via `git checkout` — no manual copy step is needed when creating a worktree.
- It **is synced** to the Windows SDK as part of `scripts/sync-sdk.mjs` (either wrapper) — do **not** re-add it to the engine's exclude lists.
- The path is resolved at runtime by `src/features/envio-resultados/infrastructure/informes/constants.ts` as `path.resolve(process.cwd(), 'sigla-cli', 'SIGLA.PdfCli.exe')`. Override with the `PDFCLI_EXE_PATH` env var if you need to point at a different binary location.
- The sync is a true mirror with a pre-flight assert: if `sigla-cli/SIGLA.PdfCli.exe` is missing from the source, the sync aborts before touching the destination. On top of that, `sigla-cli/` is protected on the destination, so a run can never delete it from the share.

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

