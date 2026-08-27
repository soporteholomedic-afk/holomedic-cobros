# Apply Progress — REQ-03-valorizaciones-sigla

**Work units**: U1 (S1 backend, tasks 1.0–1.6) + U2 (S1 UI + CSV retirement, tasks 1.7–1.8) — **S1 complete** · U3 (S2 consolidado + exports, tasks 2.0–2.6) — **S2 complete** · U4 (S3 email + plantillas, tasks 3.1–3.5) — **S3 complete, ALL 21 TASKS DONE** · **Mode**: Standard (per-task RED-first as ordered by tasks.md) · **Date**: 2026-08-27
**Delivery**: 3 chained PRs (S1/S2/S3), feature-branch-chain — tracker `feature/valoraciones-sigla-req03` (from `develop`), work branches `feature/valoraciones-sigla-s1` (PR 1 = U1+U2), `feature/valoraciones-sigla-s2` (PR 2 = U3, base = s1) and `feature/valoraciones-sigla-s3` (PR 3 = U4, base = s2 @ `79023a3`).

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

### U3 (S2 consolidado + PDF/Excel exports) — tasks 2.0–2.6

- [x] 2.0 SPIKE — **footerTemplate ADOPTED** (outcome recorded durably in `spike-2-0-pagination.md`, committed with 2.1): real-Edge render of a 4-page `@page{size:A4}` document proved `displayHeaderFooter` + `footerTemplate` paint on EVERY page (page-number glyph increments 1→4; last-page number == totalPages glyph) with exact A4 sizes. Requirements learned: non-zero pdf() bottom margin (14mm) + explicit `font-size` in templates. D6 fallback NOT needed.
- [x] 2.1 `PdfPrintOverrides` (`displayHeaderFooter/headerTemplate/footerTemplate/margin`) added additively to `PdfPrinter.print(html, overrides?)` + `EdgePrinter`; musculoesqueletica callers unchanged (`edgePrinter.test.ts` 13/13; whole musculoesqueletica feature 88/88)
- [x] 2.2 `domain/consolidado.ts`: `ConsolidadoRow`/`ConsolidadoAdicional` (exact SP casing), `IDE_TCH_PREOCUPACIONAL = 510001` / `IDE_TCH_ADICIONALES = 510011` (verified in `Entidad/Constante.cs`), pure `aplicarAjusteAdicionales` (start round2 → preocupacional subtracts / adicionales REPLACES from original / importe always subtracts → round2; adicionales appended unconditionally, C# 186–207) + `consolidarPorDestino` (round2 Σ, IGV 18%, null-destino excluded — C# 242–262). 8/8 tests incl. hand-computed parity case vs `RptFacturacionForm.cs` 144–291
- [x] 2.3 `CONSOLIDADO_BINDS` (8 binds — drops CodCFa/CodMon/InFSTA) + `buscarConsolidado` executing BOTH SPs with identical binds + `rowToConsolidado`/`rowToConsolidadoAdicional`; **live-DB probe found the SPs DO NOT EXIST** (see SP access findings); 14/14 repository tests on fake pools
- [x] 2.4 UI: `SET_CONSOLIDADO` reducer action (client-gated; clearing client resets consolidado+destino, switching keeps it — spec Q-R5 letter), FiltersPanel checkbox enabled-with-client, `useConsolidado` hook + `ConsolidadoTable` (SIGLA-style per-destino SubTotal/IGV/Total rows), sigla route `?consolidado=true` branch (client gate BEFORE pool work; ajuste applied server-side so table and exports share one truth), page mode-switch via `modoConsulta`
- [x] 2.5 PDF: `pdf/template.ts` (pure `buildValoracionHtml`: membrete logo data-URI + HOLOMEDIC SERVICIOS INTEGRALES S.A.C. / RUC 20556200328 from `paymentInfo.ts`, client/RUC header via new `buscarClientePorCodigo`, period/moneda/emission, destino-grouped tables w/ SubTotal·IGV·Total + row `Simbol`, `@page A4`, HTML-escaped), `HtmlValoracionPdfPrinter` (footer overrides by default) + `getValoracionesPdfPrinter` seam, `POST /api/valoraciones/pdf` (D4 re-query; `EdgeUnavailableError`→502 no-stack; user-safe 500); UI "Descargar PDF" via `useExportarValoraciones('pdf')`
- [x] 2.6 Excel: `excel/formato35.ts` (`FORMATO_35_HEADER` exact 30 columns; moneda-aware total `round2(ventaPorMoneda)`; nulls→''; hyphens preserved — documented improvement over SIGLA's CSV hyphen-strip), shared `domain/parseFiltroDto.ts` (extracted from pdf route), `POST /api/valoraciones/excel` (.xlsx attachment); UI "Descargar Excel" button

### U4 (S3 email + plantillas) — tasks 3.1–3.5

- [x] 3.1 `VALORIZACIONES_CONFIG` registered in `areaConfigRegistry.ts` (was reserved-but-unregistered — product decision #5 lifted by REQ-03): tokens empresa/ruc/periodo/moneda/total/fecha/firma + `tablaValoraciones` table (empresa/registros/subtotal/igv/total, fed from `EmpresaGrupo[]`), realistic mock preview data; `MockPreviewData` widened with optional `periodo` + `tablaValoraciones` (REQ-01 D12 back-compat pattern); absence pins in `areaConfigRegistry.test.ts` flipped to registration assertions `[M-R2]`
- [x] 3.2 Token resolvers: `InterpolationContext` widened (`periodo?`, `tablaValoraciones?: TablaValoracionesRow[]`; `ruc`/`moneda`/`montoTotal` reused from cobranza widening — `montoTotal` backs the `total` token), `valoraciones` branch in `buildTokenResolverRegistry` (all 7 tokens + table), new `tablaValoracionesResolver.ts` (D9 width renormalization + Outlook-safe inline styling, tabla-cobranza precedent); `areaRegistryConsistency` extended (superset ctx + full-interpolation scenario + absent-fields-degrade-empty test; unknown-area mechanism test moved from `'valoraciones'` to `'area-fantasma'`) `[M-R2]`
- [x] 3.3 `GET /api/valoraciones/contactos?codCli=` thin route: `buscarClientePorCodigo` (SIGLA RO pool) → `NroRuc` validated against `RUC_PATTERN` → `getContactDb().getByRuc()` (HOLOMEDIC REQ-01 directory); unknown client / no-RUC / junk-RUC → 200 `{nroRuc: null, contacto: null}` WITHOUT a directory call (manual-entry degrade, not an error); 400 VALIDATION_ERROR on bad codCli; user-safe 500 `[M-R3|D5]`
- [x] 3.4 `POST /api/valoraciones/send`: FormData (filtro JSON, to/cc comma lists ≤10, subject, html, adjuntarPdf/adjuntarExcel flags) → validation-first 400s → attachments REGENERATED server-side via new shared `infrastructure/pdf/renderValoracionesPdf.ts` (extracted from the pdf route — single truth so download and attachment bytes are identical per D4) + `generarFormato35Workbook` → `sendEmail` purpose `'facturacion'`; SMTP result mapping (TIMEOUT→503, AUTH/ERROR→500), `EdgeUnavailableError`→502, user-safe 500, ZERO HOLOMEDIC writes (v1); pdf route refactored to consume the shared renderer (behavior-identical, 17/17 route+pdf tests green) `[M-R1|M-R4|D4|D5]`
- [x] 3.5 `EnviarValoracionesModal` + `useEnviarValoraciones`: prefill state machine (loading/populated/empty/error/skipped — skipped when no client selected) seeding editable to/cc from the contactos route; `SpitchSelector` reuse (area `valoraciones`, target `company`) with event-driven interpolation (empresa/ruc/periodo/moneda/total/tablaValoraciones from filtro+grupos; `CobranzaEmailComposer` precedent); sanitized body preview via `sanitizeEmailHtml`; PDF/Excel attachment toggles (default both on); send action posting FormData with user-safe error surface; wired into the page header ("Enviar Documentos" when hayResultados; consolidado mode passes empty grupos → tokens degrade to block removal) `[M-R3|M-R4]`

## SP Access Findings — Consolidado Probe (task 2.3 preflight, 2026-08-27)

Probe script `%LOCALAPPDATA%\Temp\opencode\probe-2-3-consolidado.js` (explorar_datos via `HOLOMEDIC_DB_*`, read-only):

1. **`SP_RPT_CONSOLIDADOFACTURACION` and `SP_RPT_CONSOLIDADOFACTURACION_ADICIONALES` DO NOT EXIST in the live SIGLA DB** (172.16.10.14): `sys.parameters` returns zero rows for both; `EXEC` fails with **"Could not find stored procedure"** (an absence error, NOT a permission denial — distinct from S1's `EXECUTE permission denied` on `SP_RPT_REPFACTURACION`). `sys.objects` search for `%ConsolidadoFact%` → 0 matches (1,666 procedures total).
2. Response per orchestrator authority: repository implemented to the **C#-reader-verified contract** (`InformesD.ConsolidadoFacturacionD`/`...AdicionalesD`: param names follow the sibling SP's verified no-prefix convention; result columns `CodCli, NomCom, CodDes?, DesDes, IdeTCh?, DesTCh, CanEva, VImpMN/MO, VVtaMN/MO` + adicionales `NomSer, ValImp, ValVta`), unit tests on fake rows. **No live findings were fabricated.**
3. **OPS ACTION (blocks consolidado at runtime)**: deploy both SPs to SIGLA (or provide equivalents) AND grant EXECUTE on all three SPs (`SP_RPT_REPFACTURACION`, both consolidado SPs) to `explorar_datos`. Until then `GET /api/valoraciones/sigla?consolidado=true` returns the user-safe 500 (route test covers exactly this shape).
4. Detail-mode SP (`SP_RPT_REPFACTURACION`) grant from S1 remains pending too — the whole `/sigla` surface is grant-gated at runtime.

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

### U3

| Command | Result |
|---|---|
| Spike (temp scripts, real Edge) | 4-page `@page{size:A4}` render: all pages A4 (595.3×841.9pt), footer painted on every page (+363 content chars/page), pageNumber glyphs `0014→0017`, page-4 number == totalPages glyph → **footerTemplate ADOPTED** |
| `pnpm vitest run src/features/musculoesqueletica-pdf` (2.1 blast radius) | 12 files, **88/88 passed** (edgePrinter 13 incl. 3 new overrides tests) |
| `pnpm vitest run src/features/valoraciones/domain/__tests__/consolidado.test.ts` | 8/8 passed (SIGLA parity case, replace-vs-subtract, null-destino match, rounding) |
| `pnpm vitest run src/features/valoraciones/infrastructure/sqlserver/__tests__/SiglaValoracionesRepository.test.ts` | 14/14 passed (CONSOLIDADO_BINDS freeze, dual-SP typed binds, dropped CodMon/CodCFa/InFSTA, NULL mapping) |
| `pnpm vitest run src/features/valoraciones src/app/api/valoraciones/sigla src/app/valoraciones` (2.4) | 10 files, **68/68 passed** (route consolidado branch incl. ajuste+totales end-to-end on fake rows; page client→destinos+consolidado flow) |
| `pnpm vitest run src/app/api/valoraciones/pdf src/features/valoraciones/infrastructure/pdf` (2.5) | 3 files, 16/16 passed (template membrete/groups/A4/escaping, printer overrides delegation, route 200/400/502/500) |
| `pnpm vitest run src/features/valoraciones/infrastructure/pdf/__tests__/realEdgeHarness.test.ts` | **1/1 passed with REAL Edge** — production template through `HtmlValoracionPdfPrinter(new EdgePrinter())`: >1 page, all A4, distinct page numbers 1..N, last == total |
| `pnpm vitest run src/features/valoraciones/infrastructure/excel` (2.6) | 6/6 passed (exact 30-column header equality, row mapping, moneda-aware total, NULL→'', xlsx round-trip) |
| `pnpm vitest run src/app/api/valoraciones src/features/valoraciones src/app/valoraciones` (U3 aggregate) | **22 files, 146/146 passed** |
| `pnpm eslint <all U3 modified files>` / `pnpm tsc --noEmit` | clean |

### Work Unit Evidence — U3

| Evidence | Value |
|---|---|
| Focused test command + result | `pnpm vitest run src/app/api/valoraciones src/features/valoraciones src/app/valoraciones` → 22 files / 146 tests passed |
| Runtime harness | TWO live harnesses: (a) spike-2.0 temp scripts rendered a real 4-page Edge PDF proving footerTemplate pagination (adopted); (b) committed `realEdgeHarness.test.ts` (skipIf-no-Edge, musculoesqueletica pdfProof precedent) renders the PRODUCTION template through the real EdgePrinter: multi-page A4 + live footer numbering proven. Live `/api/valoraciones/pdf`-route SP re-query requires the same EXECUTE grant as `/sigla` (pending); route contract covered by seam-injected fakes. |
| Rollback boundary | `git revert 904d63c..a10c4aa` (or delete `valoraciones/domain/consolidado.ts` + `parseFiltroDto.ts`, `valoraciones/infrastructure/{pdf,excel}/**`, the consolidado additions in repository/ports/sigla-route/filters/UI, and the `PdfPrintOverrides` additions). S1 detail flow + musculoesqueletica PDF work with or without this slice. |

### U4

| Command | Result |
|---|---|
| `pnpm vitest run src/features/plantillas-editor/infrastructure/__tests__/areaConfigRegistry.test.ts src/features/envio-resultados/presentation/helpers/tokenResolvers src/features/plantillas-editor/presentation` (3.1+3.2 blast radius) | **24 files, 312/312 passed** (registry + resolvers + full plantillas-editor presentation suite — TokenPalette/TemplateEditor/BlockNote unaffected by the new area) |
| `pnpm vitest run src/app/api/valoraciones/contactos` (3.3) | 10/10 passed (RUC passthrough, empty-on-miss, DNI degrade no-directory-call, junk-RUC skip, 4×400, user-safe 500) |
| `pnpm vitest run src/app/api/valoraciones/send src/app/api/valoraciones/pdf src/app/api/valoraciones/excel` (3.4 incl. pdf-route refactor regression) | 3 files, **29/29 passed** (dual-attachment regeneration incl. PK-magic xlsx check, D4 printer HTML assertions, SMTP 503/500 mapping, Edge 502, user-safe 500 no-SP-leak, 11×400) |
| `pnpm vitest run src/features/valoraciones/presentation/hooks/__tests__/useEnviarValoraciones.test.ts src/features/valoraciones/presentation/components/__tests__/EnviarValoracionesModal.test.tsx` (3.5) | 13/13 passed (prefill populated/empty/skipped/error+retry, FormData field mapping, M-R3 corporate prefill + manual degrade, M-R2 interpolation, M-R4 toggles→flags, send error surface, close) |
| `pnpm vitest run src/features/valoraciones src/app/valoraciones src/app/api/valoraciones` (U4 aggregate) | **26 files, 189/189 passed** |
| `pnpm eslint <all U4 modified files>` / `pnpm tsc --noEmit` | clean |

### Work Unit Evidence — U4

| Evidence | Value |
|---|---|
| Focused test command + result | `pnpm vitest run src/features/valoraciones src/app/valoraciones src/app/api/valoraciones` → 26 files / 189 tests passed (plus 312/312 on the plantillas-editor/envio-resultados blast radius) |
| Runtime harness | **N/A with reason**: live end-to-end send requires the same pending `SP_RPT_REPFACTURACION` EXECUTE grant as S1 (attachments re-query the SP) plus a real SMTP relay — both are ops-gated. The send route contract is covered by seam-injected fakes (repo + printer) with `sendEmail` mocked at the module boundary; the modal/hook prefill+dispatch flows are driven by network-boundary fetch mocks. A post-grant manual check: open `/valoraciones`, query, "Enviar Documentos" → corporate client prefills, send to a test inbox. |
| Rollback boundary | `git revert 9d3a2a2..fb934f2` (or delete the send/contactos route folders, `EnviarValoracionesModal` + `useEnviarValoraciones`, `renderValoracionesPdf.ts` + the valoraciones additions in the registry/resolvers/page). S1+S2 exports work with or without this slice; the pdf-route refactor reverts with the slice. |

## Commits (work branch `feature/valoraciones-sigla-s3`, base: `feature/valoraciones-sigla-s2` @ `79023a3`)

### U4 (email + plantillas)

| Hash | Message |
|---|---|
| `9d3a2a2` | feat(valoraciones): register plantillas area with token resolvers |
| `8cf472f` | feat(valoraciones): add RUC contact prefill endpoint |
| `1a31eb1` | feat(valoraciones): add email dispatch route with regenerated attachments |
| `fb934f2` | feat(valoraciones): add email modal with plantillas and RUC prefill |

## Changed Lines — U4 / S3

| Scope | Diff | Files |
|---|---|---|
| U4 code (`79023a3..fb934f2`, src only) | **+2,352 / −91 = 2,443 churn** (≤2,500 native-attempt budget ✓, 98%; ~1,000 test lines traveling with the units) | 18 |
| U4 wrap-up docs (tasks.md checkoffs + this progress merge) | ~+60 (openspec artifacts — not code review load) | 2 |
| **PR 3 code total** (`79023a3..fb934f2`) | **+2,352 / −91 = 2,443 churn** | 18 |

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

## Commits (work branch `feature/valoraciones-sigla-s2`, base: `feature/valoraciones-sigla-s1` @ `f83674c`)

### U3 (consolidado + exports)

| Hash | Message |
|---|---|
| `904d63c` | feat(valoraciones): add header/footer overrides to EdgePrinter port (+ spike outcome doc) |
| `c54c6f3` | feat(valoraciones): add consolidado ajuste domain with SIGLA parity tests |
| `7ffb64f` | feat(valoraciones): add consolidado SP repository with C#-verified binds |
| `cc6df7e` | feat(valoraciones): enable client-gated consolidado mode in results view |
| `0780994` | feat(valoraciones): add membretado A4 PDF export with footer page numbering |
| `a10c4aa` | feat(valoraciones): add Formato 35 xlsx export with 30-column header |

## Changed Lines

| Unit | Diff (combined, vs previous unit) | Files |
|---|---|---|
| U1 code (`a35eb83..ed8fe48`) | **+2,137 / −1** (insertions include ~700 test lines traveling with the units) | 18 |
| U1 docs (`5a04f46`) | +844 (openspec artifacts only — not code review load) | 9 |
| U2 (`5a04f46..7fc888f`) | **+2,155 / −2,538** (~1,050 test lines; deletions are the CSV flow + legacy upload page) | 25 |
| **PR 1 total** (`a35eb83..7fc888f`) | **+5,136 / −2,539** | 52 |
| U3 code (`f83674c..a10c4aa`, src only) | **+3,268 / −55** (~1,300 test lines traveling with the units) | 36 |
| U3 docs (spike outcome doc) | +53 (openspec artifact — not code review load) | 1 |
| **PR 2 code total** (`f83674c..a10c4aa`) | **+3,268 / −55 = 3,323 churn** (≤3,500 attempt budget ✓, 95%) | 36 |
| U4 code (`79023a3..fb934f2`, src only) | **+2,352 / −91** (~1,000 test lines traveling with the units) | 18 |
| **PR 3 code total** (`79023a3..fb934f2`) | **+2,352 / −91 = 2,443 churn** (≤2,500 attempt budget ✓, 98%) | 18 |

> U3 churn vs the ≤3,500 native-attempt budget: 3,323 code churn + 53 spike-doc lines = 3,376 before wrap-up docs (tasks.md checkoffs + this progress merge add ~140 doc lines — openspec artifacts, not review load; total incl. docs ≈ 3,516, flagged for transparency).

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

U3:
- **Consolidado SPs absent from the live DB** (probe finding) — binds frozen from the C# reader + sibling-SP naming convention instead of `sys.parameters`; re-verify once ops deploys (comment on `CONSOLIDADO_BINDS`).
- Consolidado amounts are MN-only (soles), matching SIGLA's consolidado report tables (which drop `@CodMon`); the consolidado UI table hardcodes `s/.`.
- Consolidado ajuste rounds each fila to 2 decimals at creation (SIGLA keeps full precision until the DataTable write, then rounds again for display while totals sum the unrounded list — sub-cent identical for 2-decimal currency data; documented on `aplicarAjusteAdicionales`).
- Consolidado checkbox keeps its checked state when SWITCHING clients (spec Q-R5 letter: "clearing resets both"); SIGLA only disables on clear.
- PDF groups by DESTINO (`agruparPorDestino`) per E-R2 scenario wording ("rows spanning two destinos"); SIGLA's own print branch is a flat table — the grouped layout is the spec's explicit requirement.
- Excel `total` column is moneda-aware (`ventaPorMoneda` + round2) instead of SIGLA's raw `VVtaMo`; hyphens preserved in DNIs (SIGLA's CSV stripped ALL hyphens — destructive); NULL dates → '' (SIGLA's '-' placeholder was itself stripped to '' by its global hyphen-removal, so '' is the faithful contract).
- Membrete address/phone are optional and currently empty (no system of record in the repo carries them — name+RUC sourced from `paymentInfo.ts`); template renders them only when provided.
- Consolidado route branch lives on `GET /api/valoraciones/sigla?consolidado=true` (single protected surface; Q-R6's "call SP_RPT_CONSOLIDADOFACTURACION" honored via `buscarConsolidado`) rather than a new route.

U4:
- The `total` token is backed by the EXISTING `montoTotal` context field (cobranza widening — same "pre-formatted grand total" semantics) instead of a duplicate `total` field; only `periodo` + `tablaValoraciones` are new context fields.
- `tablaValoraciones` columns are empresa-level (empresa/registros/subtotal/igv/total, fed from `EmpresaGrupo[]`) — a per-empresa summary matches the on-screen table and the attachments' scope (the whole filter), vs. the PDF's per-destino grouping.
- The pdf route was refactored to consume the new shared `renderValoracionesPdf.ts` (single truth for download + attachment bytes per D4 "attachments regenerate identically") — behavior-identical, covered by the pre-existing pdf route tests.
- Contactos route validates `NroRuc` against `RUC_PATTERN` server-side and skips the directory call for junk/DNI keys (cobranza's junk-key skip is client-side in `useCompanyContact`; here the key comes from the DB, so the guard lives server-side).
- `firma` interpolation context is `''` — templates using `{{firma}}` render the visible `[Falta configurar firma]` placeholder (both existing areas' behavior); template authors omit the token unless they want it.
- Send route has NO operator file-upload path at all (M-R4 "without requiring file uploads") — attachments exist only as server-regenerated buffers; FormData carries only text fields + flags.
- v1 sends write NO audit rows and NO contact upsert (the modal does not PUT back to the directory — read-only prefill; memorization can ride a future REQ-01-style change).

## Issues / Risks

1. **OPS BLOCKER (runtime, WORSENED by U3 probe)**: S1 needs `GRANT EXECUTE ON dbo.SP_RPT_REPFACTURACION TO explorar_datos`; U3 additionally found that **`SP_RPT_CONSOLIDADOFACTURACION` + `_ADICIONALES` are NOT DEPLOYED** on 172.16.10.14 — ops must deploy both SPs (source exists only in the SIGLA C# workspace's caller; ask the SIGLA DBA for the production SP script) and grant EXECUTE on all three. Detail queries, consolidado queries AND both export routes (which re-query) all surface user-safe 500s until then.
2. `.env.local` has `DB_USER=sa` — the D1 guard refuses the `DB_*` fallback until `SIGLA_RO_*` (or a non-sa `DB_USER`) is configured; deployment must point to `explorar_datos`.
3. Registering `/api/valoraciones` also closed the previously-public `/api/valoraciones/generate` (now deleted — Q-R8). Deploy note: confirm no scripted consumers before merge (proposal OQ-6).
4. Stale `.next/dev/types/validator.ts` (from an old dev run) referenced the deleted route — removed locally; a fresh `pnpm dev` regenerates types.
5. **Consolidado bind names are convention-derived** (sibling-SP no-prefix pattern), not `sys.parameters`-verified — the SPs don't exist to verify against. First live consolidado run after deployment should confirm; a mismatch surfaces as a clear mssql parameter error (user-safe 500), and the fix is a one-line `CONSOLIDADO_BINDS` edit.
6. `realEdgeHarness.test.ts` silently skips on hosts without Edge (CI) — pagination is proven only on Edge-bearing machines (deployment target has Edge; musculoesqueletica precedent).
7. PDF/Excel exports re-query with the CURRENT filter (D4) — exporting in consolidado mode still exports the DETAIL dataset (exports are detail-format per E-R1/E-R3; consolidado-specific export is not specified).
8. U4 runtime adds the SMTP dependency for `/api/valoraciones/send` — `SMTP_USER_FACTURACION`/`SMTP_PASS_FACTURACION` must exist in the deployment env (already required by the legacy facturacion flow; `MissingSmtpCredsError` surfaces as the user-safe 500).
9. The email modal in consolidado mode passes empty `grupos` — `{{total}}`/`{{tablaValoraciones}}` blocks are removed by the empty-token path (by design); the PDF/Excel attachments still regenerate from the full filter.
10. Live end-to-end email was NOT exercised (apply mode; SP grant pending + no test relay configured) — contract covered by module-boundary mocks; post-grant manual check documented in the U4 runtime-harness evidence.

## Remaining

**ALL 21 TASKS COMPLETE (1.0–1.8, 2.0–2.6, 3.1–3.5) — implementation phase finished.**

- [x] S1 (U1+U2) complete → PR 1 prepared (head `feature/valoraciones-sigla-s1` → base `feature/valoraciones-sigla-req03`). Body saved at `C:\Users\soporte\AppData\Local\Temp\opencode\req03-pr1-body.md` (gh unauthenticated at S1 wrap-up).
- [x] S2 (U3) complete → PR 2 prepared (head `feature/valoraciones-sigla-s2` → base `feature/valoraciones-sigla-s1`). Body saved at `C:\Users\soporte\AppData\Local\Temp\opencode\req03-pr2-body.md` (gh unauthenticated at S2 wrap-up). Note: the root `.pr-1-body.md` / `.pr-2-body.md` dotfiles belong to an older change (worker-table-aptitud-archivos, commit 007a487) — do not reuse them for REQ-03.
- [x] S3 (U4) complete → PR 3 (head `feature/valoraciones-sigla-s3` → base `feature/valoraciones-sigla-s2`). See "PR 3 note" below.
- Pending (ops): SIGLA grants + SP deployments (risk 1) and deployment env (`SIGLA_RO_*` or non-sa `DB_USER`, SMTP facturacion pair).
- Pending (process): open the three chained PRs once `gh` authenticates, then the **verify phase** (`sdd-verify`) — global vitest/lint run + spec-scenario audit across all 21 tasks.

### PR 3 note (filled at S3 wrap-up)

- Branch `feature/valoraciones-sigla-s3` pushed to origin; PR 3 head `feature/valoraciones-sigla-s3` → base `feature/valoraciones-sigla-s2` per the feature-branch-chain strategy (child PR targets the immediate parent branch, never `main`/`develop` directly).
- Status of the `gh` attempt and the saved body path (if unauthenticated): recorded in the session result contract — mirror here on success: __PR_URL_PLACEHOLDER__
