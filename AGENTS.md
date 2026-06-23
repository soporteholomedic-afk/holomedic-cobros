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

## Environment & Shell

- Write and execute all terminal commands specifically for PowerShell compatibility

## External Workspace Permissions

By explicit user instruction, this agent is permitted to read and write outside the default project root at the following paths:

- `C:\Users\soporte\Desktop\SIGLA`
- `C:\Users\soporte\Desktop\SIGLA\SIGLA.PdfCli`

All other locations outside the working directory remain off-limits unless explicitly authorized.

