# Design: REQ-03 — Valorizaciones Connected to SIGLA (PDF/Excel/Email)

## Technical Approach

Feature-sliced `src/features/valoraciones/**` on the cobranza precedent: domain ports/entities, typed-bind SQL adapter over the standard SIGLA app pool (D1 amended U5), cached-promise factory with test seams, user-safe routes, client page from hooks. PDF reuses `PdfPrinter`/`EdgePrinter` additively; Excel `xlsx`; email `sendEmail` + plantillas registry. 3 chained PR slices.

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|---|---|---|
| D1 | **AMENDED (U5, requirement-author clarification)**: valoraciones connects via the standard `getPool()` (`DB_*` env — same pool as every SIGLA query); read-only is enforced at the QUERY level (SELECT + report-SP EXECUTE only, no writes anywhere in the module). The original D1 — a dedicated read-only pool with its own env prefix and a pre-construction `sa` rejection — was implemented in U1 and REMOVED in U5: REQ-03 §3's credential clause restricts AI-agent interactive exploration (EXPLORADOR_DATOS per AGENTS.md), not the runtime app pool, where `DB_USER=sa` is the platform's legitimate choice | original dedicated-pool plan — withdrawn by the author | OQ-1 resolution reversed by author clarification; `DbEnvPrefix` reverted to `DB_` \| `HOLOMEDIC_DB_` |
| D2 | Binds in exported `REPFACTURACION_BINDS`/`CONSOLIDADO_BINDS` tables (name → mssql type) feeding `.input().execute(SP)` | interpolated `EXEC` | OQ-2: smoke test corrects one table, then freeze |
| D3 | One route `GET /api/valoraciones/lookups/[tipo]`: clientes, pacientes, destinos, tipos-trabajador, sedes; `clientes?q=` serves cliente + facturar-a (same `Cliente` table) | per-lookup routes | destinos without `codCli` → `{resultados: []}` (spec); items `{codCli,nomCom,nroRuc}` `{codPac,nombre}` `{codDes,desDes}` `{codTip,desTip}` `{codSed,nomSed}` |
| D4 | `POST /pdf`, `/excel`, `/send` re-execute the query from the posted filter DTO | client posts rows | tamper-proof; attachments regenerate identically |
| D5 | `purpose:'facturacion'`; REQ-01 prefill via thin `GET /api/valoraciones/contactos` → `getContactDb().getByRuc()` | new SMTP env; widening `/api/cobranza/contactos` | proxy allows one permiso per route |
| D6 | Numbering via additive optional `overrides` on `PdfPrinter.print(html, overrides?)` → puppeteer `displayHeaderFooter`+`footerTemplate`; `@page{size:A4}` drives breaks (`preferCSSPageSize` already true) | CSS margin boxes (Chromium-unsupported); forking EdgePrinter | musculoesqueletica caller unchanged; slice-2 spike validates; fallback: per-group in-flow footer |
| D7 | Tipo trabajador: runtime constants query, hardcoded domain fallback | hardcode-only | OQ-7: combo never 500s |

## Data Flow

    FiltersPanel → GET /sigla → Repository → SP (app pool) → rowToRepFacturacion (ISO)
      → agruparPorEmpresa (CodMon→*MN/*MO, round2, IGV 18%) → EmpresaList/Modal
    POST /pdf|/excel → re-query → template|formato35 → EdgePrinter|xlsx
    POST /send → attachments → sendEmail('facturacion') ← plantillas + contactos(RUC)

## File Changes (S1/S2/S3 = slice)

| File | Action | Slice |
|---|---|---|
| `src/lib/db.ts` | Modify — D1 (AMENDED U5: db.ts ships UNCHANGED from develop — `getPool()` reused as-is; the U1 pool additions were reverted) | S1 |
| `valoraciones/domain/{entities,ports,agrupacion}.ts` | Create — `RepFacturacion` (38 cols, exact casing), `ValoracionesFilter`, lookup types, `EmpresaGrupo`, grouping/IGV; `ISiglaValoracionesRepository`; S2 consolidado types + `aplicarAjusteAdicionales` | S1/S2 |
| `…/infrastructure/{getValoracionesDb.ts, sqlserver/SiglaValoracionesRepository.ts}` | Create — cached factory + `__setForTests`; binds, mappers, lookups (D7), consolidado + Adicionales SP | S1 (consolidado S2) |
| `app/api/valoraciones/sigla/route.ts`; `…/lookups/[tipo]/route.ts` | Create — periodo/moneda required, inverted period 400, ≤0 → NULL; `q` ≥2, `%_[` escaped | S1 |
| `app/valoraciones/page.tsx` (rewrite, `"use client"`); `…/presentation/hooks/` (`useValoracionesFilters` useReducer, `useValoraciones`, `useLookup`); `…/components/` (`FiltersPanel`, `ClienteAutocomplete`, `PacienteAutocomplete`, `EmpresaList` adapted from CompanyList, `EmpresaDetailModal`) | Create | S1 |
| `auth/domain/routes.ts` | Modify — add `{path:'/api/valoraciones', permiso:'valoraciones'}` | S1 |
| Delete: `app/api/valoraciones/generate/**`, `utils/valoracionesCore.ts`, `utils/valoraciones.ts`, `components/{CompanyList,CompanyDetailModal}.tsx` + tests (sole consumers verified) | Delete | S1 |
| `…/infrastructure/pdf/` (`template.ts` pure `buildValoracionHtml`, `HtmlValoracionPdfPrinter`, printer factory seam); `…/excel/formato35.ts`; `app/api/valoraciones/{pdf,excel}/route.ts`; `musculoesqueletica-pdf` port + `edgePrinter.ts` additive overrides (D6) | Create; Modify | S2 |
| `app/api/valoraciones/{send,contactos}/route.ts`; `…/components/EnviarValoracionesModal.tsx` + `useEnviarValoraciones` | Create | S3 |
| `plantillas-editor/infrastructure/areaConfigRegistry.ts` | Modify — `VALORIZACIONES_CONFIG` (tokens empresa, ruc, periodo, moneda, total, fecha, firma; table `tablaValoraciones`; mock data) | S3 |
| `envio-resultados/.../tokenResolvers/` (`types.ts` optional-field widening, registry valoraciones branch, `tablaValoracionesResolver.ts`) | Modify/Create — cobranza D12 precedent | S3 |

## Interfaces / Contracts

- `ValoracionesFilter`: `{ fecIni, fecFin: 'YYYY-MM-DD' (required), codMon: 1|2, indFac: null|1|0 (default 0), inFsta: boolean, codCli?, codCfa?, codDes?, codPac?, codSed?, tipTra? }`; repository derives `00:00:00`/`23:59:59` bounds.
- Binds: dates `DateTime`, `indFac Int` nullable, `inFsta Bit`, ids `Int`; consolidado drops `pCodCFa/pCodMon/pInFsta`; ajuste: preocupacional `VVtaMn -= ValVta`, adicionales replace, `VImpMn -= ValImp`.
- Excel header (exact, 30): `facturar a, contratades, proyectodes, cr_proy, dociden, nombre, edad, Fecha de Nacimiento, ocupacion, tipotrab, feorden, fesoliciTramAdm, tipo_examen, perfil, resultado, anexo7d, total, solicitado, administrador, ficha, item, tcompro, nrodoc, nrovalor, ordpedi, cod_em, fec_rec, cancela, sede_cob, nro_cob`.
- PDF: membrete data-URI; client/RUC/period/moneda/emission header; per-group SubTotal (Σ VVta round2), IGV 18%, Total, row `Simbol`.

## Testing Strategy (vitest, strict TDD — RED first)

| Target | Approach |
|---|---|
| Pool + Repository | fake pools mocked at the `@/lib/db` `getPool` boundary (D1 amended U5); fake rows (NULL `FecSTA`, `VImpMN/CodiEM` casing) → ISO entities |
| sigla route | sedes pattern: mocked pool asserts typed `.input` + `.execute('SP_RPT_REPFACTURACION')`; inverted period 400 without SP call; 500 leaks no SP name |
| agrupacion/ajuste | pure fixtures; consolidado parity vs SIGLA |
| template/formato35 | membrete, groups, `@page`, 30-column header fixture |
| PDF printer/routes | injected fake `PdfPrinter`; `EdgeUnavailableError` → 502 no-stack |
| send route | mocked `sendEmail`: success/failure mapping; no HOLOMEDIC writes; attachments from filtros |
| hooks/components | client→destinos+consolidado (disabled S1, enabled S2), tri-state default 0, moneda column switch, RUC prefill + manual degrade |
| registry/resolvers | `areaRegistryConsistency` extended; unknown areas unchanged |

Slice-1 task 0: EXPLORADOR_DATOS smoke test verifies `@p…` names, casing/nullability, empty-result shape, RUC coverage, constants access — gate before binds freeze.

## Threat Matrix

| Boundary | Applicability | Response / RED test |
|---|---|---|
| Docs-like paths; git/commit/push/PR commands | N/A — no executable docs, no VCS automation | — |
| Subprocess exec (Edge) | Applicable | Fixed paths + env override, never shell; browser closed `finally`; RED: null resolver → 502, no stack |
| Route auth change (closes public `/generate`) | Applicable | RED: unauthenticated 401 / no-permiso 403, zero SP calls; deleted route 404 |
| SQL injection (lookups, filters) | Applicable | Typed binds; `%_[` escaped; RED: wildcard-only `q`, `<=0` ids → NULL binds |

## Migration / Rollout

No DB migration. Ops (AMENDED U5): standard `DB_*` env for the runtime pool — any legitimate app login (including `sa`) is the platform's choice; AI-agent exploration stays on EXPLORADOR_DATOS per AGENTS.md; verify grants for the report SPs. Per-slice revert on `develop`.

## Open Questions

- [ ] `@p…` names, constants active-flag column, `Cliente.NroRuc` coverage — smoke-test residuals (OQ-2/3/7)
- [ ] Footer-template numbering unproven until slice-2 spike; D6 fallback applies
