# Valoraciones Export Specification

## Purpose

Server-side report generation for valorizaciones: a membretado A4 PDF produced by the existing HTML→PDF EdgePrinter port (no sigla-cli) and a Formato 35 `.xlsx` export, both fed by the SIGLA query results.

## Requirements

### Requirement: HTML-to-PDF valorización report

`POST /api/valoraciones/pdf` MUST compile query results into an A4 HTML template and render it through the existing `PdfPrinter` port / `EdgePrinter` adapter (reused, not forked; no sigla-cli involvement), returning PDF bytes for preview or download with no external network calls — all styles and images embedded in the HTML payload. (Slice 2)

#### Scenario: PDF download (Gherkin 2)

- GIVEN the operator has queried a company's valorizaciones
- WHEN they click "Descargar PDF"
- THEN the API returns a valid A4 PDF rendered by EdgePrinter

#### Scenario: Edge unavailable is user-safe

- GIVEN no Edge executable resolves on the host
- WHEN the PDF route is called
- THEN the API returns the established Edge-unavailable error (502) without stack leakage

### Requirement: PDF content, grouping, and pagination

The PDF template MUST include: the official Holomedic membrete (embedded logo, RUC, address, phone); a header with client, RUC, valorized period, moneda, and emission date; a print-styled table; grouping by sede/destino or tipo de chequeo with per-group SubTotal (Σ venta, round2), IGV at 18%, and Total, using the row's `Simbol` as currency symbol; and automatic footer page numbering. Multi-page output MUST be supported via `@page` CSS sizing. (Slice 2)

#### Scenario: Grouped totals with 18% IGV

- GIVEN rows spanning two destinos
- WHEN the PDF renders
- THEN each group shows SubTotal, IGV = SubTotal × 18%, and Total

#### Scenario: Multi-page pagination

- GIVEN results spanning more than one A4 page
- WHEN the PDF renders
- THEN page breaks follow `@page` CSS and the footer numbers every page

### Requirement: Excel Formato 35 export

`POST /api/valoraciones/excel` MUST generate a `.xlsx` via the existing `xlsx` dependency containing the 30 standard Formato 35 columns (header equal to SIGLA's CSV export contract: `facturar a, contratades, …, nro_cob`), returned with a download `Content-Disposition`. (Slice 2)

#### Scenario: Excel download with 30 columns (Gherkin 3)

- GIVEN the operator is viewing the results list
- WHEN they click "Descargar Excel"
- THEN the API returns an `.xlsx` whose header row matches the 30 Formato 35 columns exactly
