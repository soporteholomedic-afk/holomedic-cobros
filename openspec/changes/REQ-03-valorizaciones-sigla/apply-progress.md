# Apply Progress — REQ-03-valorizaciones-sigla

**Work units**: U1 (S1 backend, tasks 1.0–1.6) + U2 (S1 UI + CSV retirement, tasks 1.7–1.8) — **S1 complete** · **Mode**: Standard (per-task RED-first as ordered by tasks.md) · **Date**: 2026-08-27
**Delivery**: 3 chained PRs (S1/S2/S3), feature-branch-chain — tracker `feature/valoraciones-sigla-req03` (from `develop`), work branch `feature/valoraciones-sigla-s1`. PR 1 (S1) = U1 + U2, head `feature/valoraciones-sigla-s1` → base tracker.

## Completed Tasks

### U1 (backend) — tasks 1.0–1.6

- [x] 1.0 SP smoke test → `smoke-test-findings.md` (bind freeze gate — findings corrected binds)
- [x] 1.1 `getSiglaReadOnlyPool()` + `SiglaRoSaError` + `__setSiglaRoPoolForTests` in `src/lib/db.ts`; `DbEnvPrefix` widened
- [x] 1.2 Domain: `entities.ts` (RepFacturacion 39 reader cols exact casing, `ValoracionesFilter`, lookup types, `EmpresaGrupo`, `MONEDAS`), `ports.ts`, pure `agrupacion.ts` (CodMon→*MN/*MO, round2, IGV 18%), `fixtures.ts`
- [x] 1.3 Infrastructure: `getValoracionesDb.ts` (cached promise + `__setValoracionesDbForTests`), `sqlserver/SiglaValoracionesRepository.ts` (frozen `REPFACTURACION_BINDS`, typed `.input().execute`, `rowToRepFacturacion` ISO boundary, lookups + D7 fallback) + barrel `sqlserver/index.ts`
- [x] 1.4 `src/app/api/valoraciones/sigla/route.ts` (validation, tri-state indFac, user-safe 500)
- [x] 1.5 `src/app/api/valoraciones/lookups/[tipo]/route.ts` (5 lookups, escaped `q`, destinos gating)
- [x] 1.6 `RUTAS_PROTEGIDAS` += `{path: '/api/valoraciones', permiso: 'valoraciones'}` + threat tests

### U2 (UI + CSV retirement) — tasks 1.7–1.8

- [x] 1.7 UI rewrite: `src/app/valoraciones/page.tsx` (`"use client"`, hooks-only data) + `presentation/hooks/` (`useValoracionesFilters` useReducer with client→destinos reset, `useValoraciones` stale-guarded query + derived moneda-aware groups, `useLookup` debounced/gated) + `presentation/components/` (`FiltersPanel` 11 controls, `ClienteAutocomplete`, `PacienteAutocomplete`, `EmpresaList` adapted from CompanyList, `EmpresaDetailModal`) + `presentation/helpers/format.ts` (`dd/MM/yyyy`, es-PE montos, today ISO). Periodo defaults today; consolidado checkbox DISABLED (slice 1); IndFac tri-state default "No Facturados"; moneda switches MN/MO columns via the query's `codMon` `[Q-R5|Q-R6]`
- [x] 1.8 CSV retirement: deleted `src/app/api/valoraciones/generate/**` (route + 11 tests), `src/utils/valoracionesCore.ts`, `src/utils/valoraciones.ts`, `src/utils/__tests__/valoraciones.test.ts`, `src/components/CompanyList.tsx`, `src/components/CompanyDetailModal.tsx` + both component tests `[Q-R8]`

## Bind Corrections from Smoke Test (1.0 → 1.3)

1. **No `p` prefix**: actual params are `@FecIni…@InFSTA` (design assumed `@p…`).
2. **`@IndFac` is `BIT`** (design said Int) → bound as `true/false/null`; `@InFSTA` BIT; exact casing `@InFSTA`, `@CodCFa`.
3. **Result is 45 columns** (`SELECT *` adds `Identi, CodEmp, CodSed, CodTCl, NumOrd, NumSSe` beyond the 39 reader columns) — mapper reads by name, extras ignored. Design's "38" was off by one; reader set is 39.
4. **`SP_SEL_SEDE` EXECUTE denied** → sedes read directly from `VW_SEDE` (typed static SQL, safer than the SP's dynamic WHERE).
5. **No `Paciente` table** → paciente lookup on `Persona WHERE IndPac = 1 AND IndReg = 1` (name = `ApePat ApeMat NomPer`, DNI = `NroDId`).
6. **Tipo trabajador** = `Constante WHERE CodTCo = 62` (OBRERO 620001 / EMPLEADO 620002 = hardcoded D7 fallback).
7. Adicionales are already applied inside the SP (relevant for S2 consolidado scope).

## Test Evidence (focused, modified files only)

### U1

| Command | Result |
|---|---|
| `pnpm vitest run src/lib/__tests__/db.test.ts` | 21/21 passed (13 pre-existing + 8 new; sa guard, fallback, singleton, seam) |
| `pnpm vitest run src/features/valoraciones` | 23/23 passed (agrupacion 10, repository 11, factory 2) |
| `pnpm vitest run src/app/api/valoraciones/sigla` | 11/11 passed (200 mapping, typed binds, 400 no-SP, user-safe 500) |
| `pnpm vitest run src/app/api/valoraciones/lookups` | 11/11 passed (wildcard escape, destinos gating, 404, user-safe 500) |
| `pnpm vitest run src/features/auth/domain/__tests__/valoraciones-route-protection.test.ts` | 5/5 passed (registration, 401/403 zero-pool, page entry intact) |
| `pnpm vitest run src/proxy.test.ts src/features/auth` | 67/67 passed (no regression on existing auth/proxy) |
| `pnpm eslint <all modified files>` / `pnpm tsc --noEmit` | clean |

### U2

| Command | Result |
|---|---|
| `pnpm vitest run src/features/valoraciones/presentation src/app/valoraciones` | first run 36/41 → fixed fake-timer flush (useLookup) + duplicate-text assertions → **7 files, 41/41 passed** |
| `pnpm vitest run src/features/valoraciones/presentation` | 6 files, 38/38 passed (filters 6, useValoraciones 8, useLookup 7, FiltersPanel 7, EmpresaList 7, EmpresaDetailModal 3) |
| `pnpm vitest run src/app/valoraciones` | 3/3 passed (page integration: lookups on mount, Consultar → sigla URL params, modal open/close) |
| `pnpm vitest run src/features/valoraciones src/app/valoraciones` (U2 aggregate) | **10 files, 64/64 passed** (U1 domain/infra/routes + U2 presentation/page all green together) |
| `pnpm eslint src/features/valoraciones/presentation src/app/valoraciones/page.tsx src/app/valoraciones/__tests__/ValoracionesPage.test.tsx` | clean (no output) |
| `pnpm tsc --noEmit` | clean (after regenerating stale `.next/dev/types` left over from the deleted generate route) |

### Work Unit Evidence

**U1**

| Evidence | Value |
|---|---|
| Focused test command + result | `pnpm vitest run src/lib/__tests__/db.test.ts src/features/valoraciones src/app/api/valoraciones` → 7 files / 77 tests passed |
| Runtime harness | **N/A with reason**: live `/api/valoraciones/sigla` execution requires `GRANT EXECUTE ON dbo.SP_RPT_REPFACTURACION TO explorar_datos` (currently DENIED — smoke-test finding §3). All runtime SQL surfaces were exercised live by the smoke probes with the same read-only login; the route/repository contract is covered by the sedes-pattern mocked-pool tests. Ops grant tracked as the top risk. |
| Rollback boundary | `git revert` of commits `d04b03b..ed8fe48` (or delete `src/features/valoraciones/**` backend files, the two API route folders, and the db.ts/routes.ts additions). No other feature touches these files. |

**U2**

| Evidence | Value |
|---|---|
| Focused test command + result | `pnpm vitest run src/features/valoraciones src/app/valoraciones` → 10 files / 64 tests passed |
| Runtime harness | Page-level integration test (`src/app/valoraciones/__tests__/ValoracionesPage.test.tsx`) drives the real page with fetch mocked at the module boundary: lookups load after debounce, Consultar calls `/api/valoraciones/sigla?…` with SOLES + `indFac=0` defaults, grouped rows render, detail modal opens/closes. A live dev-server browse was NOT run (apply mode; the SP EXECUTE grant is still pending, so a live query would 500 — see risks). |
| Rollback boundary | `git revert 7fc888f` restores the CSV flow verbatim; `git revert 6181eb0` restores the legacy upload page. The two commits are independent of U1's backend commits. |

### CSV retirement RED checks (task 1.8)

- `src/app/api/valoraciones/generate/` deleted → no route module exists → App Router returns **404** for `POST /api/valoraciones/generate`.
- Grep `valoracionesCore|CompanyList|CompanyDetailModal|utils/valoraciones` over `src/` → **0 matches**.
- `pnpm tsc --noEmit` clean → no dangling imports.

## Commits (work branch `feature/valoraciones-sigla-s1`, base: develop `a35eb83`)

### U1 (backend)

| Hash | Message |
|---|---|
| `d04b03b` | feat(valoraciones): add read-only SIGLA pool with sa guard |
| `b863d80` | feat(valoraciones): add domain entities, ports and moneda-aware grouping |
| `cee3b36` | feat(valoraciones): add SIGLA repository with smoke-verified SP binds and lookups |
| `b80338b` | feat(valoraciones): add sigla query route with validated 11-filter input |
| `9247f05` | feat(valoraciones): add protected lookup endpoints with escaped search |
| `ed8fe48` | feat(valoraciones): protect /api/valoraciones surface under valoraciones permiso |
| `5a04f46` | docs(valoraciones): record U1 smoke findings, task checkoffs and apply progress |

### U2 (UI + retirement)

| Hash | Message |
|---|---|
| `6181eb0` | feat(valoraciones): add realtime SIGLA filter panel and results UI |
| `7fc888f` | refactor(valoraciones): retire legacy CSV upload flow and generate endpoint |

## Changed Lines

| Unit | Diff (combined, vs previous unit) | Files |
|---|---|---|
| U1 code (`a35eb83..ed8fe48`) | **+2,137 / −1** (insertions include ~700 test lines traveling with the units) | 18 |
| U1 docs (`5a04f46`) | +844 (openspec artifacts only — not code review load) | 9 |
| U2 (`5a04f46..7fc888f`) | **+2,155 / −2,538** (~1,050 test lines; deletions are the CSV flow + legacy upload page) | 25 |
| **PR 1 total** (`a35eb83..7fc888f`) | **+5,136 / −2,539** | 52 |

> U1 figure corrected from the earlier "~1,740/17" note — validator-confirmed actual is 2,137 insertions across 18 files.
> U2 authored insertions (2,155) exceed the ≤1,600 guidance by ~35%: production code is ~1,100 lines, the rest is the RED/verification suites kept with the work units per work-unit-commits. Deletions are mechanical legacy removal. Flagged to the orchestrator for the PR-1 review-budget note.

## Deviations from Design

U1:
- Binds use no-prefix names + BIT types (smoke-verified — design D2's `@p…`/Int assumption corrected, per spec Q-R2 "Verified names drive binds").
- `buscarSedes` queries `VW_SEDE` instead of executing `SP_SEL_SEDE` (EXECUTE denied for the RO login; the SP is only a dynamic-SQL wrapper over that view).
- Paciente lookup targets `Persona` (no `Paciente` table exists in SIGLA).
- `RepFacturacion` maps the 39 reader columns (design said 38; count corrected by SP source verification).

U2:
- `EmpresaList`/`EmpresaDetailModal` drop the CSV-era download buttons and search history (`useSearchHistory` remains for cobranza's `ClientList`); the search box + pagination are kept from `CompanyList`.
- Moneda column switching is implemented as "amounts derive from the executed query's `codMon`" (re-query on moneda change) rather than client-side column toggling — the SP filters by `CodMon`, so the other currency's rows are not in the result set.
- Consolidado: state field + disabled checkbox render exist (slice-2 enable point); no reducer setter yet.

## Issues / Risks

1. **OPS BLOCKER (runtime)**: `GRANT EXECUTE ON dbo.SP_RPT_REPFACTURACION TO explorar_datos` (+ `SP_RPT_CONSOLIDADOFACTURACION` before S2) required — today the login has VIEW DEFINITION + table SELECT but EXECUTE denied on all SPs. The route returns a user-safe 500 until granted; the UI surfaces it in the results panel.
2. `.env.local` has `DB_USER=sa` — the D1 guard refuses the `DB_*` fallback until `SIGLA_RO_*` (or a non-sa `DB_USER`) is configured; deployment must point to `explorar_datos`.
3. Registering `/api/valoraciones` also closed the previously-public `/api/valoraciones/generate` (now deleted — Q-R8). Deploy note: confirm no scripted consumers before merge (proposal OQ-6).
4. Stale `.next/dev/types/validator.ts` (from an old dev run) referenced the deleted route — removed locally; a fresh `pnpm dev` regenerates types.

## Remaining

- S1 (U1+U2) **complete** → PR 1 open (head `feature/valoraciones-sigla-s1` → base `feature/valoraciones-sigla-req03`). Do NOT merge until reviewed.
- [ ] U3 (S2, PR 2): tasks 2.0–2.6 — consolidado (checkbox enable + consolidado table mode), PDF/Excel exports, EdgePrinter overrides spike
- [ ] U4 (S3, PR 3): tasks 3.1–3.5 — email + plantillas integration
