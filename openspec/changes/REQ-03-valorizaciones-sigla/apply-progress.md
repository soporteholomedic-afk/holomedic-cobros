# Apply Progress — REQ-03-valorizaciones-sigla

**Work unit**: U1 (S1 backend) · **Mode**: Standard (per-task RED-first as ordered by tasks.md) · **Date**: 2026-08-27
**Delivery**: 3 chained PRs (S1/S2/S3), feature-branch-chain — tracker `feature/valoraciones-sigla-req03` (from `develop`), work branch `feature/valoraciones-sigla-s1`. Nothing pushed; PR 1 opens after U2 (tasks 1.7–1.8) completes S1.

## Completed Tasks (U1: 1.0–1.6)

- [x] 1.0 SP smoke test → `smoke-test-findings.md` (bind freeze gate — findings corrected binds)
- [x] 1.1 `getSiglaReadOnlyPool()` + `SiglaRoSaError` + `__setSiglaRoPoolForTests` in `src/lib/db.ts`; `DbEnvPrefix` widened
- [x] 1.2 Domain: `entities.ts` (RepFacturacion 39 reader cols exact casing, `ValoracionesFilter`, lookup types, `EmpresaGrupo`, `MONEDAS`), `ports.ts`, pure `agrupacion.ts` (CodMon→*MN/*MO, round2, IGV 18%), `fixtures.ts`
- [x] 1.3 Infrastructure: `getValoracionesDb.ts` (cached promise + `__setValoracionesDbForTests`), `sqlserver/SiglaValoracionesRepository.ts` (frozen `REPFACTURACION_BINDS`, typed `.input().execute`, `rowToRepFacturacion` ISO boundary, lookups + D7 fallback) + barrel `sqlserver/index.ts`
- [x] 1.4 `src/app/api/valoraciones/sigla/route.ts` (validation, tri-state indFac, user-safe 500)
- [x] 1.5 `src/app/api/valoraciones/lookups/[tipo]/route.ts` (5 lookups, escaped `q`, destinos gating)
- [x] 1.6 `RUTAS_PROTEGIDAS` += `{path: '/api/valoraciones', permiso: 'valoraciones'}` + threat tests

## Bind Corrections from Smoke Test (1.0 → 1.3)

1. **No `p` prefix**: actual params are `@FecIni…@InFSTA` (design assumed `@p…`).
2. **`@IndFac` is `BIT`** (design said Int) → bound as `true/false/null`; `@InFSTA` BIT; exact casing `@InFSTA`, `@CodCFa`.
3. **Result is 45 columns** (`SELECT *` adds `Identi, CodEmp, CodSed, CodTCl, NumOrd, NumSSe` beyond the 39 reader columns) — mapper reads by name, extras ignored. Design's "38" was off by one; reader set is 39.
4. **`SP_SEL_SEDE` EXECUTE denied** → sedes read directly from `VW_SEDE` (typed static SQL, safer than the SP's dynamic WHERE).
5. **No `Paciente` table** → paciente lookup on `Persona WHERE IndPac = 1 AND IndReg = 1` (name = `ApePat ApeMat NomPer`, DNI = `NroDId`).
6. **Tipo trabajador** = `Constante WHERE CodTCo = 62` (OBRERO 620001 / EMPLEADO 620002 = hardcoded D7 fallback).
7. Adicionales are already applied inside the SP (relevant for S2 consolidado scope).

## Test Evidence (focused, modified files only)

| Command | Result |
|---|---|
| `pnpm vitest run src/lib/__tests__/db.test.ts` | 21/21 passed (13 pre-existing + 8 new; sa guard, fallback, singleton, seam) |
| `pnpm vitest run src/features/valoraciones` | 23/23 passed (agrupacion 10, repository 11, factory 2) |
| `pnpm vitest run src/app/api/valoraciones/sigla` | 11/11 passed (200 mapping, typed binds, 400 no-SP, user-safe 500) |
| `pnpm vitest run src/app/api/valoraciones/lookups` | 11/11 passed (wildcard escape, destinos gating, 404, user-safe 500) |
| `pnpm vitest run src/features/auth/domain/__tests__/valoraciones-route-protection.test.ts` | 5/5 passed (registration, 401/403 zero-pool, page entry intact) |
| `pnpm vitest run src/proxy.test.ts src/features/auth` | 67/67 passed (no regression on existing auth/proxy) |
| **U1 aggregate**: `pnpm vitest run src/lib/__tests__/db.test.ts src/features/valoraciones src/app/api/valoraciones` | **7 files, 77/77 passed** |
| `pnpm eslint <all modified files>` | clean (no output) |
| `pnpm tsc --noEmit` | clean (no output) |

### Work Unit Evidence (U1)

| Evidence | Value |
|---|---|
| Focused test command + result | `pnpm vitest run src/lib/__tests__/db.test.ts src/features/valoraciones src/app/api/valoraciones` → 7 files / 77 tests passed |
| Runtime harness | **N/A with reason**: live `/api/valoraciones/sigla` execution requires `GRANT EXECUTE ON dbo.SP_RPT_REPFACTURACION TO explorar_datos` (currently DENIED — smoke-test finding §3). All runtime SQL surfaces (tables, views, SP metadata/source) were exercised live by the smoke probes with the same read-only login; the route/repository contract is covered by the sedes-pattern mocked-pool tests. Ops grant tracked as the top risk. |
| Rollback boundary | `git revert` of commits `d04b03b..ed8fe48` (or delete `src/features/valoraciones/**`, the two API route folders, and the db.ts/routes.ts additions). No other feature touches these files; the CSV flow is untouched (retirement is U2). |

## Commits (work branch `feature/valoraciones-sigla-s1`, base: develop)

| Hash | Message |
|---|---|
| `d04b03b` | feat(valoraciones): add read-only SIGLA pool with sa guard |
| `b863d80` | feat(valoraciones): add domain entities, ports and moneda-aware grouping |
| `cee3b36` | feat(valoraciones): add SIGLA repository with smoke-verified SP binds and lookups |
| `b80338b` | feat(valoraciones): add sigla query route with validated 11-filter input |
| `9247f05` | feat(valoraciones): add protected lookup endpoints with escaped search |
| `ed8fe48` | feat(valoraciones): protect /api/valoraciones surface under valoraciones permiso |

Changed lines (code): ~1,740 insertions / 1 deletion across 17 files (incl. tests). vs U1 budget ≤1400 authored lines — see note: insertions include ~700 lines of test files (RED suites travel with the units per work-unit-commits); production code is ~1,040 lines. No deletions.

## Deviations from Design

- Binds use no-prefix names + BIT types (smoke-verified — design D2's `@p…`/Int assumption corrected, per spec Q-R2 "Verified names drive binds").
- `buscarSedes` queries `VW_SEDE` instead of executing `SP_SEL_SEDE` (EXECUTE denied for the RO login; the SP is only a dynamic-SQL wrapper over that view).
- Paciente lookup targets `Persona` (no `Paciente` table exists in SIGLA).
- `RepFacturacion` maps the 39 reader columns (design said 38; count corrected by SP source verification).

## Issues / Risks

1. **OPS BLOCKER (runtime)**: `GRANT EXECUTE ON dbo.SP_RPT_REPFACTURACION TO explorar_datos` (+ `SP_RPT_CONSOLIDADOFACTURACION` before S2) required — today the login has VIEW DEFINITION + table SELECT but EXECUTE denied on all SPs. The route returns a user-safe 500 until granted.
2. `.env.local` has `DB_USER=sa` — the D1 guard will refuse the `DB_*` fallback until `SIGLA_RO_USER` (or a non-sa `DB_USER`) is configured; deployment must set `SIGLA_RO_*` (or repoint `DB_*`) to `explorar_datos`.
3. Registering `/api/valoraciones` also closes the currently-public `/api/valoraciones/generate` (deploy note: confirm no scripted consumers before merge — proposal OQ-6).

## Remaining (U2 — tasks 1.7, 1.8)

- [ ] 1.7 UI rewrite: `src/app/valoraciones/page.tsx` + presentation hooks/components
- [ ] 1.8 CSV retirement: delete `generate/**`, `valoracionesCore.ts`, `valoraciones.ts`, `CompanyList.tsx`, `CompanyDetailModal.tsx` + tests; RED `/api/valoraciones/generate` → 404
