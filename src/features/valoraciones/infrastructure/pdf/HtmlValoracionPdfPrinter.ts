import { EdgePrinter } from '@/features/musculoesqueletica-pdf/infrastructure/printer/edgePrinter';
import type { PdfPrinter, PdfPrintOverrides } from '@/features/musculoesqueletica-pdf/domain/entities';

/**
 * `HtmlValoracionPdfPrinter` (REQ-03 E-R1/E-R2, slice 2) — decorates the
 * shared `EdgePrinter` port with the valoraciones footer numbering
 * validated by spike 2.0: `displayHeaderFooter` + a `footerTemplate` with
 * live `pageNumber`/`totalPages` spans, over `@page { size: A4 }` CSS
 * breaks. The musculoesqueletica caller stays untouched (additive D6).
 */

/**
 * Print overrides proven by the spike: the footer layer needs explicit
 * font-size (Chromium's default styling is invisible) and non-zero pdf
 * margins to paint in (margin 0 clips it away).
 */
export function buildValoracionFooterOverrides(): PdfPrintOverrides {
  return {
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%; font-size:9px; text-align:center; color:#334155;">' +
      'P&aacute;gina <span class="pageNumber"></span> de <span class="totalPages"></span>' +
      '</div>',
    margin: { top: '8mm', right: '8mm', bottom: '14mm', left: '8mm' },
  };
}

/** Port-adapter: prints valoraciones HTML with footer numbering by default. */
export class HtmlValoracionPdfPrinter implements PdfPrinter {
  constructor(private readonly printer: PdfPrinter = new EdgePrinter()) {}

  async print(html: string, overrides?: PdfPrintOverrides): Promise<Uint8Array> {
    return this.printer.print(html, overrides ?? buildValoracionFooterOverrides());
  }
}

let cached: PdfPrinter | null = null;

/** Process-wide printer (lazy singleton; injectable via the test seam). */
export function getValoracionesPdfPrinter(): PdfPrinter {
  if (!cached) cached = new HtmlValoracionPdfPrinter();
  return cached;
}

/** Test seam — inject a fake printer or restore the real one with `null`. */
export function __setValoracionesPdfPrinterForTests(printer: PdfPrinter | null): void {
  cached = printer;
}
