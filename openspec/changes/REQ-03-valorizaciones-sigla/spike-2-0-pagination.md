# Spike 2.0 Outcome — Edge Multi-Page Pagination (REQ-03 D6)

**Date**: 2026-08-27 · **Status**: RESOLVED — **footerTemplate ADOPTED** (no D6 fallback needed)

## Question

Does puppeteer `displayHeaderFooter` + `footerTemplate` page numbering work over
`@page { size: A4 }` CSS-driven page breaks (`preferCSSPageSize: true`)?

## Method

Temp script (not committed): `%LOCALAPPDATA%\Temp\opencode\spike-2-0-pagination.js`
(+ `spike-2-0-followup.js`). Local Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
puppeteer-core, 120-row table → 4-page document, two renders:

- (A) control — current EdgePrinter options (margin 0, no footer)
- (B) override — `displayHeaderFooter: true`, empty `headerTemplate`,
  `footerTemplate` with a red marker div + `Pagina <span class="pageNumber"></span> de
  <span class="totalPages"></span>`, `margin: { top: 8mm, right: 8mm, bottom: 14mm, left: 8mm }`

Analysis via pdf-lib (page count, per-page sizes, inflated content streams).

## Findings

| Check | Control (A) | Footered (B) |
|---|---|---|
| Page count | 4 | 4 (`@page` breaks preserved) |
| Page size | all 595.3×841.9 pt (A4) | all 595.3×841.9 pt (A4) |
| Footer painted | — | every page (+363 content chars/page) |
| Footer text runs | — | 4 runs = "Pagina " + N + " de " + M |
| `pageNumber` live | — | glyph increments `0014→0015→0016→0017` (1,2,3,4) |
| `totalPages` live | — | constant `0017` ("4"); equals page-4's N glyph |

Evidence detail (page-1 content-stream tail): footer layer after a
`3.125 0 0 3.125 0 0 cm` transform — marker rect `377 1090 40 4 re f`, `/F5 8 Tf`
(the template's 8px font), text-draw ops for the four runs. Marker fill color is
set via an `/G3 gs` ExtGState (not an inline `rg` op) — naive `1 0 0 rg` regex
checks give false negatives; the glyph-run diff is the reliable probe.

## Adoption requirements

1. `page.pdf()` MUST reserve a non-zero bottom margin (14mm used) — the header/footer
   layer paints in the pdf-margin zone; margin 0 clips it away.
2. `footerTemplate`/`headerTemplate` need explicit `font-size` (and color) inline
   styles — Chromium's default template styling is invisible at 0.
3. CSS `@page { size: A4; margin: … }` continues to drive breaks and page size;
   `preferCSSPageSize: true` stays.

## Decision

Implement numbering via additive `PdfPrintOverrides` on `PdfPrinter.print(html, overrides?)`
(task 2.1) and use them in the valoraciones PDF template (task 2.5). The D6
fallback (per-group in-flow footer) is NOT needed; keep it documented as plan B.
