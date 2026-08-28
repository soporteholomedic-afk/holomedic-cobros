# Valoraciones Export Specification

## Purpose

Server-side report generation for valorizaciones: a membretado A4 LANDSCAPE PDF produced by the existing HTML→PDF EdgePrinter port (no sigla-cli) and a Formato 35 `.xlsx` export, both fed by the SIGLA query results. Both exports are PER-EMPRESA row actions (U6 user fix): the Enviar/Excel/PDF buttons live in each empresa row of the results table and act ONLY on that row's empresa.

## Requirements

### Requirement: HTML-to-PDF valorización report

`POST /api/valoraciones/pdf` MUST compile query results into an A4 HTML template and render it through the existing `PdfPrinter` port / `EdgePrinter` adapter (reused, not forked; no sigla-cli involvement), returning PDF bytes for download with no external network calls — all styles and images embedded in the HTML payload. The response MUST be a download (`attachment`) with a `Content-Disposition` filename of `[NombreEmpresa]_[fecIni].[pdf]` when empresa-scoped (ASCII fallback + `filename*` UTF-8 for accents), legacy `valoraciones_[fecIni]_[fecFin].pdf` for clientless exports. (Slice 2; filename/per-empresa per U6.)

#### Scenario: PDF download (Gherkin 2)

- GIVEN the operator has queried a company's valorizaciones
- WHEN they click the row's PDF button for one empresa
- THEN the API returns a valid A4 LANDSCAPE PDF rendered by EdgePrinter, scoped to that empresa's rows only, downloaded as `[NombreEmpresa]_[fecIni].pdf`

#### Scenario: Edge unavailable is user-safe

- GIVEN no Edge executable resolves on the host
- WHEN the PDF route is called
- THEN the API returns the established Edge-unavailable error (502) without stack leakage

### Requirement: PDF content, grouping, and pagination

The PDF template MUST render in **A4 landscape (horizontal)** (U6) and include: the official Holomedic membrete (embedded logo, RUC, address, phone); a header with client, RUC, valorized period, moneda, and emission date; a print-styled table with EXACTLY these 13 columns in this order (U6): `N°. Ficha | Doc. Iden | ¿Conv.? | N° Conv | Nombres | Ocupación | Fecha examen | Tipo examen | CR | Anexo 7D | Solicitado Por | Costos | Doc.Fac`; grouping by sede/destino with per-group SubTotal (Σ venta, round2), IGV at 18%, and Total, using the row's `Simbol` as currency symbol; and automatic footer page numbering. Multi-page output MUST be supported via `@page` CSS sizing. (Slice 2; landscape + 13 columns per U6.)

#### Scenario: Grouped totals with 18% IGV

- GIVEN rows spanning two destinos
- WHEN the PDF renders
- THEN each group shows SubTotal, IGV = SubTotal × 18%, and Total

#### Scenario: Multi-page pagination in landscape (U6)

- GIVEN results spanning more than one A4 landscape page
- WHEN the PDF renders
- THEN every page is 842×595pt (A4 landscape), page breaks follow `@page` CSS and the footer numbers every page

### Requirement: Per-empresa export actions and filename (U6)

The results table (`EmpresaList`) MUST render three icon-buttons in every empresa row — **Enviar**, **Excel**, **PDF** — each acting ONLY on that row's empresa. The export routes accept an optional `empresa` field (the empresa group key: `NomCFa` falling back to `NomCli`), re-query from the posted filter (D4 preserved — `empresa` never reaches the SP) and scope rows in memory by that group key. Both exports (`pdf`/`excel`) and the send route's attachments MUST be named `[NombreEmpresa]_[fecIni].[ext]`, with the empresa name sanitized for Windows-invalid filename characters (`\ / : * ? " < > |`); the date is the queried period's `fecIni` in ISO `YYYY-MM-DD` (documented assumption).

#### Scenario: Row-scoped export

- GIVEN a query whose results span two empresas
- WHEN the operator clicks the Excel (or PDF) button on one empresa's row
- THEN the downloaded file contains ONLY that empresa's rows, named `[NombreEmpresa]_[fecIni].[ext]`

#### Scenario: Enviar pre-scoped per row

- GIVEN the results table
- WHEN the operator clicks a row's Enviar button
- THEN the email modal opens pre-scoped to that empresa ({{empresa}}/{{total}}/{{tablaValoraciones}} from that group only) and the regenerated attachments are that empresa's, named `[NombreEmpresa]_[fecIni].[ext]`

### Requirement: Excel Formato 35 export

`POST /api/valoraciones/excel` MUST generate a `.xlsx` via the existing `xlsx` dependency containing the 30 standard Formato 35 columns (header equal to SIGLA's CSV export contract: `facturar a, contratades, …, nro_cob` — content UNCHANGED per U6), optionally scoped to the posted `empresa`, returned with a download `Content-Disposition` named per the U6 filename contract. (Slice 2; scope + filename per U6.)

#### Scenario: Excel download with 30 columns (Gherkin 3)

- GIVEN the operator is viewing the results list
- WHEN they click a row's Excel button
- THEN the API returns an `.xlsx` whose header row matches the 30 Formato 35 columns exactly, with only that row's empresa data
