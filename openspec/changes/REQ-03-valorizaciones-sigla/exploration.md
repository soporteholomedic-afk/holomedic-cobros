# Exploration: REQ-03 — Valorizaciones connected to SIGLA in real time (PDF/Excel/email)

Change: `REQ-03-valorizaciones-sigla` · Project: `holomedic_cobros` · Date: 2026-08-27
Mode: READ-ONLY codebase exploration (no files modified except this artifact).

---

## Current State

### 1. Existing valoraciones flow (CSV upload — to be replaced)

There is **no `src/features/valoraciones/` feature folder today**. The module is scattered across:

| File | Role |
|---|---|
| `src/app/valoraciones/page.tsx` (303 lines, client component) | Two views: `upload` (drag & drop `.csv`) → `list`. Parses the CSV **client-side** via `parseValoracionesCsvContent`, groups by company, renders `CompanyList` + `CompanyDetailModal`. `downloadValoraciones()` (line 16) POSTs the *original CSV file* to `/api/valoraciones/generate` with an optional `company` filter and triggers a blob download. |
| `src/utils/valoracionesCore.ts` | Pure logic: `ValoracionRow` (15 string fields, lines 5–21), `CompanyGroup { company, rows, subtotal, igv, total }`, `GroupedData` (lines 23–33); `parseValoracionesCsvContent` (line 48, XLSX.read on the CSV text, filters rows with numeric `total`, groups by `facturar a`, subtotal/IGV 18%/total via `round2`); `generateValoracionesWorkbook` (line 125, one sheet per company, 6 columns `Item/Nombre/Documento/Examen/Perfil/Costo`, summary rows Subtotal/IGV/Total). |
| `src/utils/valoraciones.ts` | I/O wrapper `parseAndGroupValoraciones`; **stale default path** `src/features/valorizaciones/archivos-crudos.csv` (line 16–19) — that folder does not exist. |
| `src/app/api/valoraciones/generate/route.ts` (59 lines) | POST FormData (`file`, `company?`) → re-parses the CSV server-side → optional company filter → `generateValoracionesWorkbook` → `.xlsx` response with `Content-Disposition`. |
| `src/components/CompanyList.tsx` (261 lines) | Search + recent-search history (`useSearchHistory`), paginated table (Empresa / Registros / Subtotal / IGV / Total), "Descargar todo" button. **Reusable** for the new results view (props are just `CompanyGroup[]`). |
| `src/components/CompanyDetailModal.tsx` | Per-company detail modal with download. Reusable. |

**Excel library**: `xlsx@0.18.5` (SheetJS) — `package.json` line 33. No `exceljs` in the project. Used by `valoracionesCore.ts` and `src/utils/excelParser.ts` (cobranza).

**Existing tests**: only `src/utils/__tests__/valoraciones.test.ts` (parser + workbook). No tests for the page, `CompanyList`, or the generate route.

**What can be reused vs replaced**
- Reuse: `CompanyList`/`CompanyDetailModal` presentation, `round2`/IGV math concept, `xlsx` dependency, filename/date conventions, the empresa-selection UX pattern.
- Replace: CSV upload view + client-side parse + re-upload on download (the whole `file` round-trip), `ValoracionRow` (CSV-shaped, mangled data — SIGLA's CSV export strips *all* hyphens, `RptFacturacionForm.cs` line 434), `/api/valoraciones/generate` (CSV-in → xlsx-out).

### 2. MSSQL repository patterns (established)

**Pool** — `src/lib/db.ts`:
- `getPool()` (line 58): lazy singleton `mssql.ConnectionPool` for **SIGLA/ICCGSA**; env prefix `DB_*` (`DB_NAME` default `ICCGSA`); `encrypt:false, trustServerCertificate:true`. 17 callers.
- `getHolomedicPool()` (line 81): singleton for the **HOLOMEDIC** template/contact store; env `HOLOMEDIC_DB_*` with fallback to `DB_*` when no Holomedic-specific connection var is set (`hasHolomedicConnectionEnv`, line 97).
- ⚠️ **Env mismatch to resolve**: REQ-03 says "use EXPLORADOR_DATOS (`HOLOMEDIC_DB_USER=explorar_datos`) via `getPool()`" — but `getPool()` reads `DB_*`, not `HOLOMEDIC_DB_*`. `.env.local` defines BOTH prefixes (key names verified, values not read). Either the deployment `DB_USER` is already the read-only login, or the new repository needs a dedicated read-only pool getter. **Open question for proposal.**

**SP-call route pattern** (canonical: `src/app/api/consolidados/results_by_companies/route.ts`):
1. Parse + validate query params at the top of `GET` (missing required → 400 with Spanish message).
2. Build sanitized SQL fragments where the SP demands text (e.g. `buildWhere` line 58: quote-escaping, `CONVERT(datetime,'…',120)` style-120 literals to dodge session-language dmy/mdy ambiguity — lines 18–24 comment).
3. `const pool = await getPool(); await pool.connect();`
4. `pool.request().input('WHERE', mssql.VarChar, where).execute('SP_SEL_ORDEN')` (lines 123–128) — typed `.input()` binds, never string interpolation of user data.
5. `result.recordset as OrderRow[]` → `NextResponse.json(rows)` (typed row interfaces in `src/types/sp-result.ts` with `[key: string]: unknown` forward-compat index signature).
6. Errors: domain errors (`InvalidDateError`) → 400; everything else → log to console + **user-safe 500 message that never leaks SP names** (lines 139–148; tested in `__tests__/route.test.ts` lines 323–339).

**Feature-sliced repository pattern** (canonical: `src/features/cobranza/infrastructure/sqlserver/*`):
- `domain/ports.ts` interface (e.g. `ICompanyContactRepository`) + `domain/entities.ts` string-based entities.
- Adapter class with `constructor(private readonly pool: mssql.ConnectionPool)`, private `runQuery(sql, typedInputs)` using `request.input(name, type, value)` with **explicit mssql types** (`VarChar(11)`, `Decimal(18,2)`, `NVarChar(MAX)`… — `sqlServerCobranzaHistorialRepository.ts` lines 104–115, 126–148), row→entity mappers converting `Date` → ISO string at the boundary (`rowToContact`, `rowToEnvio`).
- Singleton factory + test seam: `getTemplateDb()` / `getFileRepository()` / `getContactDb()` with `__set…ForTests(null)` reset.
- Typed API responses: `type GetResponse = Success | ErrorResponse` unions, `buildError(code, error, status)` with codes `VALIDATION_ERROR | INTERNAL_ERROR | CONFLICT_ERROR` (`src/app/api/plantillas/route.ts` lines 22–37).

**SP inventory already used by the repo**: `SP_SEL_ORDEN`, `SP_RPT_MATRIZICCGSA`, `SP_SEL_SEDE` (sedes combo — `src/app/api/consolidados/sedes/route.ts` line 23, WHERE `IndReg = 1`, ORDER `CodSed`), `SP_SEL_INFORMESNOCERRADOS`, `SP_SEL_PLANTILLAMEDICAXCLIENTE`. No client-search / destino / paciente-search SP is used anywhere in `src/` yet.

### 3. PDF generation

**EdgePrinter** — `src/features/musculoesqueletica-pdf/infrastructure/printer/edgePrinter.ts`:
- Port: `PdfPrinter { print(html: string): Promise<Uint8Array> }` (`domain/entities.ts` lines 58–61).
- `resolveEdgeExecutablePath()` (line 27): `EDGE_EXECUTABLE_PATH` env override → known Windows Edge paths (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, …) → Linux Chromium paths → `null` (caller maps to 502/`EdgeUnavailableError`).
- `print()` (line 63): `puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] })` → `page.setContent(html, { waitUntil: 'load' })` → waits `document.fonts.ready` + decodes all images → `emulateMediaType('print')` → `page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true, margin:0 })` → `Uint8Array`. Browser always closed in `finally`. Non-Edge errors wrapped in `PrintError`.
- Injectable seams: `EdgePrinterOptions { launch?, resolveExecutable? }` — unit-tested without a real browser (`edgePrinter.test.ts`).
- Template approach in that feature: HTML page templates in `public/musculoesqueletica-pdf/pages/*.html` + `PdfPageManifest` token specs (`PdfTokenSpec`, `entities.ts` lines 35–56); `buildPdfService` (composition/container.ts) wires `EdgePrinter` + `PdfLibMerger`; assets travel as data URIs (no network).
- **One-page constraint**: current `print()` is documented "single A4 page PDF" but `preferCSSPageSize:true` + `@page` CSS in the payload supports multi-page documents (valorizaciones tables will need `@page { size: A4 … }` + printed footer pagination via CSS `@page` counters — verify during design).

**sigla-cli (stays for envio-resultados only)** — `src/features/envio-resultados/infrastructure/informes/constants.ts`:
- `CLI_EXE_PATH = process.env.PDFCLI_EXE_PATH ?? path.resolve(process.cwd(), 'sigla-cli', 'SIGLA.PdfCli.exe')` (lines 52–54); `CLI_TIMEOUT_MS = 120_000`; retry policy for transient domain-controller auth errors (`PDFCLI_RETRY_MAX_ATTEMPTS = 3`); hard-coded CLI creds `soporte/soporte` (lines 21–22). Used by `/api/informes/[idAten]/generar`. REQ-03 must NOT touch this path — valorizaciones PDFs go the HTML→PDF route exclusively.

### 4. Email sending & templates

**Transport** — `src/utils/sendEmail.ts`:
- `nodemailer`; `Purpose = 'consolidados' | 'facturacion' | 'cobranza'` (line 11). Per-purpose creds `SMTP_USER_<PURPOSE>` / `SMTP_PASS_<PURPOSE>` + shared `SMTP_HOST`/`SMTP_PORT` (`resolveCreds`, line 58). Cobranza falls back to facturacion creds (line 92). Transport cache per purpose (`getTransport`, line 113). Result union `{success:true,messageId} | {success:false,code:'SMTP_AUTH_ERROR'|'SMTP_TIMEOUT'|'SMTP_ERROR',error}`.
- `.env.local` currently has `SMTP_USER_FACTURACION` and `SMTP_USER_CONSOLIDADOS` (no cobranza/valoraciones pair — cobranza rides facturacion).
- **A `valoraciones` purpose does not exist** — either add `SMTP_USER_VALORIZACIONES` or reuse `facturacion` (cobranza fallback precedent, design D6).

**Send routes**:
- `POST /api/send-email` — generic FormData route (`to`, `cc`, `subject`, `html`, repeated `attachments` File parts, `purpose`, REQ-02 audit meta). Consumed by `useSendCobranzaEmail` (`src/features/cobranza/presentation/hooks/useSendCobranzaEmail.ts` — persist-before-dispatch via injected directory port, line 73). ⚠️ **Protected by permiso `cobranza`** (`routes.ts` line 17) — valoraciones operators without `cobranza` would get 401. A dedicated `/api/valoraciones/send` route (registered under `valoraciones`) avoids widening `/api/send-email`'s audience.
- `POST /api/consolidados/send-results` — server-side file resolution via `fileRefs` JSON + `IFileRepository.read()` (UNC share), audit rows on `dbo.envios_consolidados`; hook `useSendResults` (`src/features/envio-resultados/presentation/hooks/useSendResults.ts`).

**Template store** — `src/features/plantillas-editor/`:
- Templates live in the **HOLOMEDIC DB** (`SqlServerTemplateRepository` via `getTemplateDb()` → `getHolomedicPool()` + idempotent `migrate()`), versioned + soft-deleted, `isDefault` per area+type.
- Send flow boundary: `GET /api/plantillas?area=&type=` → `SpitchDTO { id, area, type, name, subject, bodyHtml }` (`projectToSpitchDTO.ts`). Client hook `useSpitches(area, type)` (`useSpitches.ts` line 54) with status machine loading/empty/error/populated + retry.
- Interpolation: `interpolateSpitch` → `buildTokenResolverRegistry(area)` + `InterpolationContext` (`tokenResolvers/types.ts` lines 63–102). The context was already **widened once for cobranza** (optional `ruc`, `montoTotal`, `moneda`, `tablaCobranza`… — "REQ-01 D12 widening" precedent) — the same pattern applies for valoraciones tokens.
- ⚠️ **`valoraciones` area is reserved but NOT registered**: `src/features/plantillas-editor/infrastructure/areaConfigRegistry.ts` lines 6–8 and 297–305 state "`valoraciones` remains reserved (product decision #5) but NOT populated — `getAreaConfig` returns `undefined`". REQ-03 must add a `VALORIZACIONES_CONFIG` (token palette, predefined tables, mock preview data) or the template selector/editor will 400/404 for the new area.

**REQ-01 integration (contact prefill)** — `useCompanyContact(ruc, razonSocial)` (`src/features/cobranza/presentation/hooks/useCompanyContact.ts` line 75): GET `/api/cobranza/contactos?ruc=` → prefill `to`/`cc`; PUT upsert after send; junk-key skip via `esClaveDirectorioValida` (RUC 8–11 digits, `src/features/cobranza/domain/entities.ts` line 134). ⚠️ **The directory is keyed by RUC, but `SP_RPT_REPFACTURACION` returns NO RUC column** (names only — `NomCli`/`NomCFa`). Valorizaciones needs a RUC source (e.g. look up `Cliente.NroRuc` by `CodCli` when the client filter is selected) to drive the REQ-01 prefill. **Open question.**

### 5. SIGLA reference implementation (external, read-only)

**`C:\Users\soporte\Desktop\SIGLA\SIGLA\rptwin\RptFacturacionForm.cs`** (499 lines):

- **Load defaults** (lines 33–41): `dtpFecIni/dtpFecFin = today`; `chkConsolidado.Enabled = false` until a client is chosen; sedes via `MetodosGenerales.LstSede(cboCodSed, true)`; tipo trabajador via `LstComboConstante(cboTipTra, ConstanteB.CTipTrb, …)`; moneda via `LstMoneda(cboCodMon, …)`.
- **Cliente / Facturar-a lookups** (lines 43–88): `BuscarForm.ConsTablaCliente` search grid; on pick → `_iCodCli = int.Parse(asVariables[0])`, name normalized, destinos loaded via `MetodosGenerales.LstDestinoCliente(cboCodDes, codCli, CInsert, true)` and `chkConsolidado.Enabled = true`; clearing the field resets `_iCodCli = 0`, clears destinos, disables Consolidado (lines 59–65).
- **Paciente lookup** (lines 90–112): `BuscarForm.ConsTablaPaciente`; result array `[0]=CodPac, [1]=nombres, [2]=ap. paterno, [3]=ap. materno` (name formatting lines 100–103). Search by DNI or apellidos/nombres.
- **Fact./No Fact. tri-state** (lines 129–142): `cboIndFac.SelectedIndex` 0 → `null` (Todos), 1 → `true` (Facturados), 2 → `false` (No Facturados). Note: SIGLA defaults to *Todos*; REQ-03 wants *No Facturados* as the valorizaciones default.
- **`Reportar`** (lines 466–497): `FecIni = date 00:00:00`, `FecFin = date 23:59:59`; numeric filters `<= 0 → null`; `iCodMon` required int; `bInFsta = chkFecSTA.Checked`; **consolidado branch drops `pCodCFa`, `pCodMon` and `pInFsta` entirely**; **detail (non-Excel) branch REQUIRES a client** — line 297–298: `if (!pVerExcel && !pCodCli.HasValue) throw "Debe seleccionar al cliente."` (the CSV export is the only clientless mode in SIGLA).
- **CSV export contract** (lines 301–323 + 428–437): header `facturar a,contratades,proyectodes,cr_proy,dociden,nombre,edad,Fecha de Nacimiento,ocupacion,tipotrab,feorden,fesoliciTramAdm,tipo_examen,perfil,resultado,anexo7d,total,solicitado,administrador,ficha,item,tcompro,nrodoc,nrovalor,ordpedi,cod_em,fec_rec,cancela,sede_cob,nro_cob` — **30 columns** (this is exactly the CSV the current web flow ingests; the REQ-03 "30 columnas estándar del Formato 35" Excel should mirror it). Every value is comma-stripped, CR/LF/tab → `/`, and **all hyphens stripped** (line 434) — direct SP data will be *cleaner* (DNIs keep hyphens), a deliberate improvement over the legacy CSV.
- **PDF/print branch** (lines 326–391): table columns `NomCli, NomCom, IdAten ("{IdAten} - {ItemEx}"), IndCon(S/N), IdConv, NroDId, Pacien, DesPue, FecAte, DesTCh, Result, CenCos, Anex7D, Solici, VVtaMO, NumDov, EstCob`; SubTotal = Σ VVtaMo (round2), IGV = SubTotal × `ParametrosGen.ImpIgv`/100, Total = SubTotal + IGV; currency symbol from row `Simbol` — the HTML template must reproduce this layout/totals.
- **Consolidado branch** (lines 144–291): calls `ConsolidadoFacturacionB` (main + "adicionales" lists), then *client-side adjustment*: for `IdeTCh = preocupacional` subtract adicionales `ValVta` from `VVtaMn`; for `adicionales` replace; `VImpMn -= ValImp` (lines 161–173); per-destino SubTotal/IGV/Total rows built from the client's `ListaDestinoB` (lines 242–262). **The web consolidado mode must replicate this adjustment** (or accept a parity delta) — see risks.

**`C:\Users\soporte\Desktop\SIGLA\Datos\InformesD.cs` lines 1632–1713** — `RepFacturacionD`:

```sql
EXEC SP_RPT_REPFACTURACION '<FecIni hh:mm:ss>','<FecFin hh:mm:ss>',<CodCli|NULL>,<CodCFa|NULL>,
  <CodDes|NULL>,<CodPac|NULL>,<CodSed|NULL>,<IndFac|NULL|1|0>,<TipTra|NULL>,<CodMon>,<InFsta 1|0>
```

(11 positional args; NULL literal string-substitution in the C# — the web port MUST use typed `request.input` binds instead, param names matching the SP's `@p…` definition.)

**Result set — 38 columns (name → C# type/nullability, exact casing from the reader):**

| Column | Type | Column | Type |
|---|---|---|---|
| `NomCFa` | string | `CodMon` | int |
| `NomCom` | string | `DesMon` | string |
| `DesDes` | string | `Simbol` | string |
| `CenCos` | string | `VImpMN` | decimal |
| `NroDId` | string | `VImpMO` | decimal |
| `Pacien` | string | `VVtaMN` | decimal |
| `EdaPac` | int | `VVtaMO` | decimal |
| `FecNac` | DateTime? | `Solici` | string |
| `DesPue` | string | `Admini` | string |
| `DsTiTr` | string | `IdAten` | string |
| `FecAte` | DateTime | `ItemEx` | int |
| `FecSTA` | DateTime? | `TipDov` | string |
| `DesTCh` | string | `NumDov` | int? |
| `NomPro` | string | `EstCob` | string |
| `Result` | string | `NomCli` | string |
| `Anex7D` | string | `IndCon` | bool |
| | | `IdConv` | string |
| | | `CodSeC` | int? |
| | | `NumCob` | int? |
| | | `NroVal` | string |
| | | `NroOPe` | string |
| | | `CodiEM` | string |
| | | `FecRec` | DateTime? |

⚠️ Casing traps: `FecSTA`, `VImpMN/VImpMO/VVtaMN/VVtaMO`, `CodiEM` (reader uses `drDatos["CodiEM"]`). The mssql driver preserves SP result casing.

**Consolidado SPs**: `SP_RPT_CONSOLIDADOFACTURACION '<FecIni>','<FecFin>',<CodCli>,<CodDes>,<CodPac>,<CodSed>,<IndFac>,<TipTra>` (InformesD.cs line 1748) → `CodCli, NomCom, CodDes?, DesDes, IdeTCh?, DesTCh, CanEva, VImpMN, VImpMO, VVtaMN, VVtaMO`; plus a sibling *Adicionales* method (`ConsolidadoFacturacionAdicionalesD`, line 1799) feeding the adjustment above. **The SP SQL source is NOT in the SIGLA workspace** (only the C# caller) — contract is known solely from the reader mapping.

**Lookup sources (SIGLA side)**: all combos go through the business layer's generic WHERE-builder (`ClsOperador` lists → `Listar…D`), i.e. plain table access, not dedicated search SPs:
- Destinos by client: `ClienteB.ListaComboDestino` (Negocio/ClienteB.cs line 1037) → `Destino WHERE CodCli = @x AND IndReg = 1 ORDER BY DesDes`.
- Cliente/paciente search: `BuscarForm` grids over the `Cliente` / `Paciente` tables (active-rows filter `Constante.CRegActivos`).
- Moneda: `Moneda` table (1=Soles, 2=Dólares — safe to hardcode per REQ-03); Tipo trabajador: constants table (`ConstanteB.CTipTrb`); Sede: repo already has `SP_SEL_SEDE`.

### 6. Lookup endpoints needed (gap analysis)

| Lookup | Repo today | Needed |
|---|---|---|
| Sede | ✅ `GET /api/consolidados/sedes` → `SP_SEL_SEDE` (returns `{codSed,nomSed}[]`) | Reuse endpoint (public today — see auth note) or re-expose under `/api/valoraciones/lookups/sedes` |
| Moneda | ❌ | Static constant (1 SOLES / 2 DOLARES) |
| Cliente + Facturar a autocomplete | ❌ (only `companyName` LIKE into `SP_SEL_ORDEN`'s WHERE) | New: search `Cliente` (active) by name/RUC → `{codCli, nomCom, nroRuc?}[]` |
| Paciente autocomplete | ❌ | New: search `Paciente` by DNI or apellidos/nombres → `{codPac, nombre}[]` |
| Destino by client | ❌ | New: `Destino WHERE CodCli AND IndReg=1 ORDER BY DesDes` |
| Tipo trabajador | ❌ | New (constants table query) or hardcoded list — decide in proposal |

All new lookups must use typed parameterized queries (never interpolated LIKE fragments) through the read-only pool.

### 7. Auth / permissions

- `src/features/auth/domain/routes.ts` line 21: `{ path: '/valoraciones', permiso: 'valoraciones', label: 'Valoraciones' }` — the page is already protected. `PERMISOS` already contains `'valoraciones'` (`entities.ts` line 5), so the admin usuarios CRUD checkbox exists — **no new permiso needed**.
- Matching is longest-first `startsWith` (`buscarRutaProtegida`, line 31–34). Registering `{ path: '/api/valoraciones', permiso: 'valoraciones' }` would cover `sigla`, `pdf`, `excel`, `lookups/*` **and incidentally the currently-unprotected `/api/valoraciones/generate`** (today any unauthenticated caller can POST CSVs to it — closing it is a side benefit; verify no scripted consumers first).
- ⚠️ `/api/consolidados/sedes` and the other consolidados SP routes are **not** in `RUTAS_PROTEGIDAS` (public API surface). If valorizaciones reuses `/api/consolidados/sedes`, that's consistent-but-public; a dedicated protected lookups route is cleaner.
- ⚠️ `/api/send-email` requires `cobranza` (line 17) — see §4 for the send-route fork.
- Proxy behavior (`src/proxy.ts` per AGENTS.md): logged+permission → next; not logged → `/auth/login?redirect=`; logged without permission → `/auth/denegado`.

### 8. Testing capabilities (vitest)

- `pnpm test` = `vitest run` (vitest 4 + @testing-library/react 16 + jsdom + @vitejs/plugin-react). Tests live in `__tests__/` folders beside sources.
- **Canonical SP-route test**: `src/app/api/consolidados/sedes/__tests__/route.test.ts` — `vi.mock('@/lib/db', () => ({ getPool: mockGetPool }))` with `vi.hoisted` mocks; fake pool `{ request: () => ({ input: mockRequestInput.mockReturnThis(), execute: mockRequestExecute }), connect }`; asserts `.input('WHERE', …)`/`.execute('SP_RPT_REPFACTURACION')` calls, row mapping, NULL tolerance, and **user-safe 500 messages** (no SP-name leakage). Same pattern at `results_by_companies/__tests__/route.test.ts` (375–403).
- Repository adapters tested with fake pools (`sqlServerContactRepository.test.ts`); EdgePrinter tested with injected `launch`/`resolveExecutable` (`edgePrinter.test.ts`); hooks tested with fetch mocks + status machines (`useSpitches.test.ts`, `useCompanyContact.test.ts`).
- No existing tests cover the valoraciones page/route — only `src/utils/__tests__/valoraciones.test.ts`.

---

## Affected Areas

- `src/app/valoraciones/page.tsx` — full rewrite: 11-filter panel + results table replace CSV upload.
- `src/utils/valoracionesCore.ts`, `src/utils/valoraciones.ts` — superseded for new flow (keep during transition for `/api/valoraciones/generate` back-compat or remove).
- `src/app/api/valoraciones/**` — new routes: `sigla` (query), `pdf`, `excel`, `lookups/*` (+ optional `send`); `generate` either retired or kept.
- `src/features/valoraciones/**` — NEW feature folder (domain: `RepFacturacion` entity, `ValoracionesFilter` DTO, ports; application: query/PDF/Excel use cases; infrastructure: `SiglaValoracionesRepository` (SP calls), `HtmlValoracionPdfPrinter` (template + EdgePrinter), Excel builder; presentation: filters + table hooks/components).
- `src/features/musculoesqueletica-pdf/infrastructure/printer/edgePrinter.ts` — **reused as-is** (import or re-expose the `PdfPrinter` port; do not fork).
- `src/features/plantillas-editor/infrastructure/areaConfigRegistry.ts` — register new `valoraciones` area config (currently reserved-absent).
- `src/features/envio-resultados/presentation/helpers/tokenResolvers/*` + `InterpolationContext` — add valoraciones tokens (widening precedent: cobranza D12).
- `src/utils/sendEmail.ts` — possibly new `Purpose` value (`'valoraciones'`) or reuse `facturacion`.
- `src/features/auth/domain/routes.ts` — register `/api/valoraciones*` under permiso `valoraciones`.
- `src/lib/db.ts` — possibly a read-only pool getter (open question).
- `src/types/` — new `RepFacturacionRow` type (follow `sp-result.ts` conventions).
- External reference (read-only): `C:\Users\soporte\Desktop\SIGLA\SIGLA\rptwin\RptFacturacionForm.cs`, `C:\Users\soporte\Desktop\SIGLA\Datos\InformesD.cs` (lines 1615–1810).

---

## Approaches

1. **Feature-sliced module + typed SP repository + EdgePrinter port reuse** (REQ-03's own file plan, aligned with cobranza/plantillas-editor precedent)
   - Pros: matches repo conventions (AGENTS.md React/rules + existing architecture); testable at every seam (port, repository, route); EdgePrinter reused verbatim; template/email integrations follow existing registries; cleanest permission story.
   - Cons: most new files of the options; needs the area-registry/InterpolationContext widening; review budget pressure (see Risks).
   - Effort: High (but mostly mechanical — patterns are all established).

2. **Extend the current utils/route structure** (keep `valoracionesCore` shape, add an SP-backed route, keep page as-is with a "load from SIGLA" button)
   - Pros: smallest diff; keeps existing tests green.
   - Cons: violates the repo's feature-sliced architecture; CSV-mangled types (`ValoracionRow`) don't fit the 38-column SP result; blocks clean PDF/email integration; accumulates debt. Not recommended.

3. **Phased delivery of Approach 1** (slice 1: SIGLA query + filters + table; slice 2: Excel + PDF; slice 3: email + template area)
   - Pros: each slice is independently verifiable and under the review budget; SIGLA contract risk is burned down first (slice 1 proves the SP + pool + permissions end-to-end).
   - Cons: two/three PR rounds; the page gets touched twice.
   - Effort: same total, better distributed.

**Key sub-decisions (forks the proposal must settle)**
- **SP invocation**: typed `request.input('@pFecIni'…).execute('SP_RPT_REPFACTURACION')` (recommended — mssql binds by SP param name) vs raw `EXEC` string (SIGLA's own style — rejected: injection-prone).
- **Pool/env**: verify `DB_USER` is the read-only login vs add `getSiglaReadOnlyPool()` (open question OQ-1).
- **Excel**: keep `xlsx` (already used; `generateValoracionesWorkbook` precedent; 30-column Formato 35 layout) vs introduce `exceljs` (new dependency — not recommended without a stated need).
- **Email route**: new `/api/valoraciones/send` under permiso `valoraciones` + new/`facturacion` purpose (recommended) vs widening `/api/send-email` permissions (touches cobranza's route — riskier).
- **Consolidado mode**: call `SP_RPT_CONSOLIDADOFACTURACION` (+ Adicionales SP) and port the ajuste logic (full parity, more work) vs detail-only in v1 (REQ lists Consolidado as one of the 11 filters — parity expected; flag the Adicionales complexity).

## Recommendation

**Approach 1 delivered as Approach 3's slices.** All enabling patterns already exist in the repo (SP route + typed rows + user-safe errors; port-injected EdgePrinter; xlsx generation; plantillas area registry + SpitchDTO send flow; useCompanyContact REQ-01 prefill). The SIGLA side is fully documented (form behavior, SP contract, 38 columns, 30-column CSV layout, consolidado ajuste). The only genuinely unknown artifact is the SP's internal SQL — mitigate with one EXPLORADOR_DATOS smoke test during design/apply, not by guessing.

## Risks

- **SP contract unverified against the live DB**: the 38-column contract comes from the C# reader only; SP source is absent from the SIGLA workspace. Nullability on edge rows, empty-result shape, and the exact `@p…` parameter names for `request.input` binding need a one-shot live check (EXPLORADOR_DATOS only). 
- **Pool/env mismatch**: REQ-03's "EXPLORADOR_DATOS via getPool()" conflates `DB_*` and `HOLOMEDIC_DB_*` (OQ-1). Wrong choice = either writes denied (fine — read-only) or the wrong database queried.
- **Edge availability**: `resolveEdgeExecutablePath()` → `null` on hosts without Edge → `EdgeUnavailableError` (502). Deployment is the Windows SDK box (Edge present per musculoesqueletica precedent), but CI/tests must use the injected seam. Multi-page CSS pagination must be proven (current printer is documented single-page).
- **Permission gaps**: `/api/send-email` is cobranza-only; valoraciones operators would 401 → dedicated send route needed. `/api/valoraciones/generate` is currently public — closing it under `/api/valoraciones` changes behavior for any scripted caller.
- **RUC missing from SP result** → REQ-01 prefill needs a `Cliente.NroRuc` lookup keyed by `CodCli` (OQ-3).
- **Template area registration**: forgetting `areaConfigRegistry` + token-resolver widening makes the email modal unusable for the new area (route 400s "Unknown area").
- **Consolidado parity**: the Negocio-side adicionales adjustment (preocupacional/adicionales arithmetic) must be ported exactly or consolidated totals will differ from SIGLA's report.
- **Date/time handling**: `FecAte`/`FecSTA`/`FecNac` return as JS `Date` via mssql; the repo convention is ISO-at-the-boundary, but the UI shows `dd/MM/yyyy` — normalization must be explicit (style-120 lesson from `results_by_companies` applies to the *input* dates too).
- **Filter edge cases**: tri-state IndFac (default *No Facturados* per REQ vs SIGLA's *Todos*), Consolidado enabled-only-with-client, FecSTA toggle, moneda-driven amount columns (`VVtaMN` vs `VVtaMO` — display must follow `CodMon`), client-required rule for PDF (SIGLA enforces it only for print, not Excel).
- **Review budget**: full change (3 API routes + feature folder + page rewrite + registry/permission edits + tests) will exceed 800 lines — chained PRs by slice are effectively mandatory.
- **`xlsx` (SheetJS 0.18.5)**: last npm-community release; known advisory history. Already a dependency and used in production here — keep, but no new reliance beyond generation.

## Ready for Proposal

**Yes.** The proposal should resolve OQ-1..OQ-6 (below), confirm the 3-slice delivery (query/table → PDF/Excel → email/templates) against the 800-line budget, and pin the Excel column set (30-col Formato 35 vs the current 6-col summary) before spec.

### Open questions for sdd-propose

- **OQ-1 — Read-only pool wiring**: is the deployment `DB_USER` the `explorar_datos` login, or should we add a dedicated `getSiglaReadOnlyPool()` (new env prefix, e.g. `SIGLA_RO_*`) so the requirement's "EXPLORADOR_DATOS strictly" is enforced by construction?
- **OQ-2 — SP param names for `.execute()` binding**: confirm the actual `@pFecIni…@pInFsta` names (and positions) against the live DB once, via EXPLORADOR_DATOS, before freezing the repository spec.
- **OQ-3 — RUC source for REQ-01 prefill**: add `NroRuc` to the client lookup (query `Cliente` by `CodCli`) — is `Cliente.NroRuc` reliably populated for all companies (incl. DNI-keyed particulares)?
- **OQ-4 — Send route & SMTP purpose**: new `/api/valoraciones/send` with `purpose: 'facturacion'` (existing creds) vs adding `SMTP_USER_VALORIZACIONES`? And should sends write audit rows (cobranza REQ-02 precedent) or skip auditing in v1?
- **OQ-5 — Consolidado parity scope**: port the full Adicionales adjustment now, or ship detail-mode first with Consolidado behind it in slice 2/3?
- **OQ-6 — Legacy CSV flow retirement**: delete `/api/valoraciones/generate` + upload view immediately, or keep temporarily as fallback during a parallel-run period? (Closing the public route has deploy-note implications.)
- **OQ-7 — Tipo trabajador values**: query SIGLA's constants table at runtime vs hardcode the CTipTrb list in the frontend (source of truth question).
