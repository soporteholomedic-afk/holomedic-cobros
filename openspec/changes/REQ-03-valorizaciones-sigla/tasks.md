# Tasks: REQ-03 — Valorizaciones Connected to SIGLA (PDF/Excel/Email)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | S1 ~1,600–2,200 · S2 ~900–1,300 · S3 ~700–1,000 · **Total ~3,200–4,500** |
| 400-line budget risk | High — project review budget is 800; total exceeds it ~4–5×. Chained PR slices are the approved mitigation (proposal risk table) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (S1) → PR 2 (S2) → PR 3 (S3). If ≤800/PR is strict, split S1: PR 1a backend (1.0–1.6) / PR 1b UI+retirement (1.7–1.8) |
| Delivery strategy | ask-on-risk — RESOLVED by user: auto-chain approved |
| Chain strategy | feature-branch-chain (tracker `feature/valoraciones-sigla-req03` from develop; work branches per PR; PR 1 = U1+U2; remote policy allows only master/develop) |

Decision needed before apply: Yes — RESOLVED (user approved 3 chained PRs S1/S2/S3, feature-branch-chain, U1=1.0–1.6 / U2=1.7–1.8)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain (resolved)
400-line budget risk: High

Slices ship independently: PR1 = realtime query + table with CSV retired; PR2 adds consolidado + exports; PR3 adds email. Per-slice revert on `develop` (proposal rollback plan).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| U1 | S1 backend: RO pool, domain, repository, sigla + lookups routes, auth | PR 1 (or 1a) | `pnpm vitest run src/lib/db.test.ts src/features/valoraciones src/app/api/valoraciones` | Dev server with `HOLOMEDIC_DB_USER=explorar_datos`: `GET /api/valoraciones/sigla?fecIni=2026-01-01&fecFin=2026-01-31&codMon=1&indFac=0` → rows; inverted period → 400 | Revert `db.ts` getter + `src/features/valoraciones/**` + 2 API routes; CSV flow untouched |
| U2 | S1 UI + CSV retirement | PR 1 (or 1b) | `pnpm vitest run src/features/valoraciones/presentation` | Browse `/valoraciones`: 11 filters, moneda switch, detail table; `/api/valoraciones/generate` → 404 | Revert restores CSV flow from git history |
| U3 | S2 consolidado + PDF/Excel | PR 2 | `pnpm vitest run src/features/valoraciones src/app/api/valoraciones src/features/musculoesqueletica-pdf/infrastructure/printer` | `POST /api/valoraciones/pdf` → open PDF (membrete, groups, page numbers); `POST /api/valoraciones/excel` → 30-column `.xlsx` | Revert consolidado/export additions; S1 intact |
| U4 | S3 email + plantillas | PR 3 | `pnpm vitest run src/features/plantillas-editor src/features/envio-resultados/presentation/helpers/tokenResolvers src/app/api/valoraciones src/features/valoraciones/presentation` | Modal: corporate client prefills RUC; particular degrades to manual; send to test inbox | Revert send/contactos/registry/resolvers/modal; exports intact |

Per unit, lint modified files only (`pnpm eslint <files>`). Global vitest/lint reserved for verify phase.

Legend: `[Q-Rn]` = valoraciones-sigla-query req n · `[E-Rn]` = valoraciones-export · `[M-Rn]` = valoraciones-email · `D#` = design decision.

## Slice 1 (PR 1): Query, Table & CSV Retirement

- [x] 1.0 SP smoke test (EXPLORADOR_DATOS profile only, one-time; gates bind freeze): execute `SP_RPT_REPFACTURACION` + lookup queries; record `@p…` param names, 38-column casing/nullability, empty-result shape, `Cliente.NroRuc` coverage, constants access; correct binds/design from findings `[Q-R2|D2]`
- [x] 1.1 `src/lib/db.ts` — RED first (`vi.stubEnv`: `sa` throws; fallback `DB_*`), then add `getSiglaReadOnlyPool()`: `SIGLA_RO_*` env fallback `DB_*`, DB `SIGLA_RO_NAME ?? DB_NAME ?? 'ICCGSA'`, lazy singleton, `SiglaRoSaError` pre-construction, `__setSiglaRoPoolForTests` seam; widen `DbEnvPrefix` `[Q-R1|D1]`
- [x] 1.2 Create `src/features/valoraciones/domain/`: `entities.ts` (`RepFacturacion` 38 cols exact casing, `ValoracionesFilter`, lookup item types, `EmpresaGrupo`), `ports.ts` (`ISiglaValoracionesRepository`), pure `agrupacion.ts` (CodMon→`*MN`/`*MO`, round2, IGV 18%) with fixtures `[Q-R3|Q-R6]`
- [x] 1.3 Create `infrastructure/getValoracionesDb.ts` (cached-promise factory + `__setForTests`) and `infrastructure/sqlserver/SiglaValoracionesRepository.ts`: exported `REPFACTURACION_BINDS` (smoke-test-verified names), typed `.input().execute(SP)`, `rowToRepFacturacion` (NULL `FecSTA`, `VImpMN/CodiEM` casing, ISO dates), lookups incl. constants query + hardcoded fallback (D7); RED: fake rows → entities `[Q-R3|Q-R4|D2|D7]`
- [x] 1.4 Create `src/app/api/valoraciones/sigla/route.ts`: periodo/moneda required, inverted period → 400 without SP call, indFac tri-state default `0`, absent/`<=0` → NULL, `00:00:00`/`23:59:59` bounds, user-safe 500 (no SP-name leak); RED: sedes-pattern mocked pool `[Q-R3]`
- [x] 1.5 Create `src/app/api/valoraciones/lookups/[tipo]/route.ts`: clientes, pacientes, destinos, tipos-trabajador, sedes; `q` ≥2 with `%_[` escaped; destinos without `codCli` → `{resultados: []}`; RED: wildcard-only `q`, `<=0` ids → NULL binds `[Q-R4|D3]`
- [x] 1.6 `src/features/auth/domain/routes.ts`: add `{path: '/api/valoraciones', permiso: 'valoraciones'}`; RED threat: unauthenticated 401 / no-permiso 403 with zero SP calls `[Q-R7]`
- [x] 1.7 Rewrite `src/app/valoraciones/page.tsx` (`"use client"`); create `presentation/hooks/` (`useValoracionesFilters` useReducer, `useValoraciones`, `useLookup`) and `presentation/components/` (`FiltersPanel`, `ClienteAutocomplete`, `PacienteAutocomplete`, `EmpresaList` adapted from CompanyList, `EmpresaDetailModal`); periodo defaults today; consolidado disabled (slice 1); client→destinos gating, clearing resets both `[Q-R5|Q-R6]`
- [x] 1.8 Delete `src/app/api/valoraciones/generate/**`, `src/utils/valoracionesCore.ts`, `src/utils/valoraciones.ts`, `src/components/CompanyList.tsx`, `src/components/CompanyDetailModal.tsx` + their tests (sole consumers removed by 1.7); RED: `/api/valoraciones/generate` → 404, no CSV code remains `[Q-R8]`

## Slice 2 (PR 2): Consolidado + PDF/Excel Exports

- [x] 2.0 SPIKE (first in slice): multi-page pagination on `EdgePrinter` — `displayHeaderFooter` + `footerTemplate` page numbering over `@page{size:A4}` breaks; validate or adopt D6 fallback (per-group in-flow footer); record outcome before 2.1 `[E-R2|D6]` — **ADOPTED** (`spike-2-0-pagination.md`)
- [x] 2.1 Additive optional `overrides` on `PdfPrinter.print(html, overrides?)` (`musculoesqueletica-pdf/domain/entities.ts`) and `EdgePrinter` (`edgePrinter.ts`: displayHeaderFooter, footerTemplate, margins); existing musculoesqueletica caller unchanged; extend `edgePrinter.test.ts` `[E-R1|E-R2|D6]`
- [x] 2.2 `valoraciones/domain/consolidado.ts`: consolidado types + pure `aplicarAjusteAdicionales` (preocupacional `VVtaMn -= ValVta`; adicionales replace; `VImpMn -= ValImp`) + per-destino SubTotal/IGV/Total; RED: fixtures + parity case vs SIGLA (`RptFacturacionForm.cs` 144–291) `[Q-R6]`
- [x] 2.3 `SiglaValoracionesRepository`: exported `CONSOLIDADO_BINDS` (drops `pCodCFa/pCodMon/pInFsta`), `SP_RPT_CONSOLIDADOFACTURACION` + Adicionales SP execution, mappers; RED: mocked pool typed-input assertions `[Q-R6|D2]`
- [x] 2.4 UI: enable Consolidado checkbox when client selected (clearing resets destinos + consolidado), consolidado table mode, moneda column switch; RED: client→destinos+consolidado flow `[Q-R5|Q-R6]`
- [x] 2.5 Create `valoraciones/infrastructure/pdf/template.ts` (pure `buildValoracionHtml`: membrete data-URI, client/RUC/period/moneda/emission header, per-group SubTotal Σ VVta round2, IGV 18%, Total, row `Simbol`, `@page A4`), `HtmlValoracionPdfPrinter` + printer factory seam, `POST /api/valoraciones/pdf` re-querying from posted filter DTO; RED: injected fake `PdfPrinter`; `EdgeUnavailableError` → 502 no stack `[E-R1|E-R2|D4]`
- [x] 2.6 Create `valoraciones/infrastructure/excel/formato35.ts` (exact 30-column header fixture) + `POST /api/valoraciones/excel` re-query → `.xlsx` with download `Content-Disposition`; RED: header-row equality `[E-R3]`

## Slice 3 (PR 3): Email & Plantillas

- [ ] 3.1 `plantillas-editor/infrastructure/areaConfigRegistry.ts`: add `VALORIZACIONES_CONFIG` — tokens (empresa, ruc, periodo, moneda, total, fecha, firma), table `tablaValoraciones`, mock data; RED: `areaRegistryConsistency` extended `[M-R2]`
- [ ] 3.2 `envio-resultados/presentation/helpers/tokenResolvers/`: widen `types.ts` optional fields, add valoraciones branch in `buildTokenResolverRegistry.ts`, create `tablaValoracionesResolver.ts` (cobranza D12 precedent); RED: consistency + unknown areas unchanged `[M-R2]`
- [ ] 3.3 Create `GET /api/valoraciones/contactos`: thin route → `getContactDb().getByRuc()`; RED: RUC passthrough, empty on miss `[M-R3|D5]`
- [ ] 3.4 Create `POST /api/valoraciones/send`: re-query from filter DTO → PDF/Excel attachments (no operator uploads), `sendEmail` purpose `facturacion`, user-safe errors (no credential/internal leakage), zero HOLOMEDIC writes; RED: mocked `sendEmail` success/failure mapping `[M-R1|M-R4|D4|D5]`
- [ ] 3.5 Create `valoraciones/presentation/components/EnviarValoracionesModal.tsx` + `hooks/useEnviarValoraciones.ts`: plantillas picker (area `valoraciones`) with token interpolation, RUC prefill via contactos, graceful manual entry when no RUC, attachment toggles; RED: prefill + manual-degrade scenarios `[M-R3|M-R4]`
