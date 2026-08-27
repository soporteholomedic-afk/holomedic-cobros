# Proposal: REQ-03 — Valorizaciones Connected to SIGLA in Real Time (PDF/Excel/Email)

Change `REQ-03-valorizaciones-sigla` · 2026-08-27 · openspec mode

## Intent

Replace the manual SIGLA CSV export → web re-upload flow with a real-time, strictly read-only query (11 filters mirroring `RptFacturacionForm`, `SP_RPT_REPFACTURACION`), a grouped results table, membretado A4 PDF via HTML→PDF (EdgePrinter), Formato 35 `.xlsx` export, and integrated email with dynamic templates plus REQ-01 RUC prefill.

## Scope

### In Scope
- New feature slice `src/features/valoraciones/**` (domain / application / infrastructure / presentation).
- `GET /api/valoraciones/sigla`: 11-filter typed SP query → `RepFacturacion` entity (38 columns, exact casing).
- Lookup endpoints: cliente & facturar-a autocomplete (returning `NroRuc`), paciente, destino-by-client, tipo trabajador, sedes.
- Filter panel + results table (adapt `CompanyList`/`CompanyDetailModal`); moneda-aware amounts; detail and consolidado modes.
- Consolidado parity: `SP_RPT_CONSOLIDADOFACTURACION` + Adicionales ajuste + per-destino subtotals/IGV.
- `POST /api/valoraciones/pdf` (A4 multi-page HTML template via the existing EdgePrinter port) and `/api/valoraciones/excel` (30-column Formato 35 via `xlsx`).
- `POST /api/valoraciones/send` under permiso `valoraciones`: plantillas selection (`valoraciones` area), REQ-01 prefill, PDF/Excel attachments.
- Register `/api/valoraciones` in `RUTAS_PROTEGIDAS`; retire the CSV upload view, `/api/valoraciones/generate`, and CSV utils.

### Out of Scope
- Demographic-matrix special formats (e.g. Diagnóstica S.A.C.); any write to SIGLA; send auditing (v1); sigla-cli / envio-resultados changes.

## Open Question Resolutions

| OQ | Resolution (recommendation · assumption) |
|---|---|
| OQ-1 Pool | Add `getSiglaReadOnlyPool()` in `src/lib/db.ts` reading `SIGLA_RO_*` (fallback `DB_*`), deployed as `explorar_datos`; a guard rejects `sa`. Never the generic app pool. |
| OQ-2 SP verify | Slice-1 task 0: one-time EXPLORADOR_DATOS smoke test — confirm `@p…` param names, casing, nullability, empty-result shape — before repository binds freeze. |
| OQ-3 RUC | Client lookup returns `Cliente.NroRuc` (searched by name/RUC, keyed by `CodCli`). Assumption: populated for corporate clients; DNI-keyed particulares degrade gracefully (manual entry). |
| OQ-4 Send | Dedicated `/api/valoraciones/send` (permiso `valoraciones`); SMTP `purpose: 'facturacion'` (existing creds, cobranza fallback precedent). No audit table in v1 — assumption to confirm. |
| OQ-5 Consolidado | In scope (REQ-03 §2 filter + §4 PDF grouping require subtotals/IGV). Detail ships in slice 1 (checkbox enabled in slice 2); consolidado parity ships in slice 2 sharing the grouping engine. |
| OQ-6 Legacy CSV | Retire in slice 1 with the page rewrite; delete `/api/valoraciones/generate`. Assumption: no scripted consumers of the public route (confirm pre-merge). |
| OQ-7 Tipo trabajador | Runtime constants-table lookup via the read-only pool (SIGLA parity); fallback: hardcoded list if the smoke test denies access. |

## Capabilities

### New Capabilities
- `valoraciones-sigla-query`: read-only 11-filter SIGLA query, lookups, filters UI, results table (detail + consolidado), auth registration.
- `valoraciones-export`: HTML→PDF (A4, grouping, subtotals, 18% IGV, page numbering) + Formato 35 Excel generation.
- `valoraciones-email`: dedicated send route, plantillas `valoraciones` area + tokens, REQ-01 RUC prefill, attachments.

### Modified Capabilities
None — `openspec/specs/` is empty; cross-cutting touchpoints (auth routes, area registry, sendEmail purpose) are requirements inside the new capabilities.

## Approach

Feature-sliced module (exploration Approach 1) delivered as 3 chained PR slices (Approach 3 — respects the 800-line review budget):
1. **Query/table**: pool getter, SP smoke test, lookups, `sigla` route, 11-filter panel, detail table, auth registration, CSV retirement.
2. **Consolidado + PDF/Excel**: consolidado SP + ajuste + grouped table mode; HTML→PDF template; 30-column Excel.
3. **Email/templates**: send route, `valoraciones` area config + token resolvers, RUC-prefill modal.

Conventions: typed `request.input()` binds (never interpolated `EXEC`), user-safe 500s (no SP-name leakage), ISO dates at the boundary, `dd/MM/yyyy` display.

## Affected Areas

| Area | Impact |
|---|---|
| `src/features/valoraciones/**`, `src/app/api/valoraciones/{sigla,pdf,excel,lookups,send}/`, `src/types/` (RepFacturacionRow) | New |
| `src/app/valoraciones/page.tsx` | Rewritten — filters + results replace CSV upload |
| `src/lib/db.ts`, `src/features/auth/domain/routes.ts`, `src/features/plantillas-editor/infrastructure/areaConfigRegistry.ts`, token resolvers + `InterpolationContext`, `src/utils/sendEmail.ts` | Modified |
| `src/app/api/valoraciones/generate/route.ts`, `src/utils/valoracionesCore.ts`, `src/utils/valoraciones.ts` | Removed |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| SP contract known only from the C# reader | Med | OQ-2 smoke test before freezing binds |
| Edge multi-page pagination unproven (printer documented single-page) | Med | Slice-2 spike: `@page` CSS + counters; injected test seams |
| Consolidado totals drift vs SIGLA | Med | Port ajuste exactly (`RptFacturacionForm.cs` 144–291); parity fixture |
| Closing the public `/generate` route breaks scripts | Low | Confirm no consumers pre-merge; deploy note |
| Total size exceeds review budget | High | 3 chained PR slices |

## Rollback Plan

Additive code only — no schema migrations on either DB (template area is code-level config). Per-slice `git revert` on `develop`; the slice-1 revert restores the CSV upload flow from git history.

## Dependencies

- `explorar_datos` grants: EXECUTE on `SP_RPT_REPFACTURACION` and `SP_RPT_CONSOLIDADOFACTURACION` (+ Adicionales), SELECT on `Cliente`/`Paciente`/`Destino`/constants — verified by the smoke test.
- Microsoft Edge on the Windows SDK deployment box; existing `xlsx@0.18.5`, `puppeteer-core`, `SMTP_USER_FACTURACION` creds.

## Success Criteria

- [ ] S1 (Gherkin 1): `/valoraciones` 11-filter query executes via the read-only pool (login ≠ `sa`, asserted in route tests); grouped table with importes/cantidades/estado renders.
- [ ] S2 (Gherkin 2): "Descargar PDF" returns an A4 membretado multi-page PDF (grouping, subtotals, 18% IGV, page numbers) rendered by EdgePrinter — no sigla-cli involvement.
- [ ] S3 (Gherkin 3): "Descargar Excel" returns `.xlsx` with the 30 standard Formato 35 columns.
- [ ] S4 (Gherkin 4): "Enviar Documentos" opens a modal with RUC-prefilled recipient (REQ-01), plantillas selection, auto-attached PDF/Excel, successful SMTP delivery.
- [ ] Legacy CSV flow removed; zero SIGLA write statements in the module.
