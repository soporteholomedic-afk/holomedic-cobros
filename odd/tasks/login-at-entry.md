# login-at-entry

Ask for credentials when entering the platform (home and /areas), not when
entering the areas.

## Specs

S1: User (verbatim): "vamos a corregir la logica del login de la plataforma, necwsito que a la hora ingresar, me pida la contraseña. no cuando entre a las areas. Revisa como esta la logica de la autorizacion y la autenticacion"

S2: An unauthenticated visit to home `/` is redirected by the proxy to
`/auth/login?redirect=/` instead of rendering the public landing page.

S3: The area index pages (`/areas/medicina`, `/areas/calidad`,
`/areas/musculoesqueletica`, and any unregistered `/areas/*` path) require a
valid session but NO specific permiso: an authenticated user with an empty
permisos array passes; an unauthenticated request gets the login redirect.

S4: Existing authorization is unchanged: `/areas/medicina/jjc` and
`/areas/musculoesqueletica/jjc` (and subpaths) keep requiring the `jjc`
permiso — the longest-first `RUTAS_PROTEGIDAS` match wins over the
session-only gate.

S5: Routes that are unregistered today and rely on the proxy pass-through
keep working: `/api/asistencia/*` (device Bearer auth inside the route) must
NOT start requiring the session cookie; no unregistered `/api/*` path may
match a session-only entry.

S6: `/auth/login` and `/auth/denegado` stay public; the login page keeps
honoring `?redirect=` so the user lands back where they were headed.

## Tasks

- T1 (S2,S3,S4,S5,S6): RED tests — session-gate outcomes in
  `src/proxy.test.ts` and registry contract in
  `src/features/auth/domain/__tests__/routes.solo-sesion.test.ts`. commit: feat(auth)
- T2 (S2,S3,S4,S5): `RUTAS_SOLO_SESION` + `buscarRutaSoloSesion` in
  `src/features/auth/domain/routes.ts`; enforcement in `src/proxy.ts` with a
  shared `noAutenticado` helper (exact 401 JSON body pinned by tests). commit: feat(auth)
- T3 (S1..S6): GREEN — run affected tests only: `src/proxy.test.ts` and the
  routes domain tests. commit: same as T2
- T4 (S5,S6): Update AGENTS.md "Auth & Route Protection" section (home and
  /areas now require session; public: /auth/*, unregistered APIs). commit: feat(auth)
- T5: work-unit commit, native assess, SDK sync attempt, close report.

## Log

- L1 (user, verbatim): "vamos a corregir la logica del login de la plataforma, necwsito que a la hora ingresar, me pida la contraseña. no cuando entre a las areas. Revisa como esta la logica de la autorizacion y la autenticacion"
- L2: Review finding — the gap is route registration, not the login form:
  `/` and `/areas/*` indexes are public (proxy passes unregistered paths),
  so the password prompt only appears when hitting a registered route
  (e.g. JJC). Fix direction: session-only registry, permiso model untouched.
- L3: Implemented. RED 5 failed → GREEN 111 passed (12 files: proxy + all
  routes domain tests). eslint clean on touched files; tsc clean in src
  (only pre-existing temp/*.mts errors). AGENTS.md Permission Model and
  Proxy table updated. Evidence commit: ec9e092 (feat(auth): require
  session at platform entry).
