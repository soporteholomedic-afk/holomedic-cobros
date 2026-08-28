import { describe, expect, it, vi } from 'vitest';

import type { PdfPrinter } from '@/features/musculoesqueletica-pdf/domain/entities';
import { EdgeUnavailableError } from '@/features/musculoesqueletica-pdf/domain/errors';
import {
  HtmlValoracionPdfPrinter,
  buildValoracionFooterOverrides,
} from '../HtmlValoracionPdfPrinter';

describe('buildValoracionFooterOverrides', () => {
  it('enables the header/footer layer with a page-number footer and A4 margins', () => {
    const overrides = buildValoracionFooterOverrides();

    expect(overrides.displayHeaderFooter).toBe(true);
    expect(overrides.footerTemplate).toContain('pageNumber');
    expect(overrides.footerTemplate).toContain('totalPages');
    // Spike 2.0: the footer layer needs explicit font-size + reserved margins.
    expect(overrides.footerTemplate).toContain('font-size');
    expect(overrides.margin?.bottom).not.toBe(0);
    expect(overrides.margin?.bottom).not.toBe('0mm');
  });
});

describe('HtmlValoracionPdfPrinter', () => {
  it('delegates to the wrapped printer applying the footer overrides by default', async () => {
    const inner: PdfPrinter = { print: vi.fn().mockResolvedValue(new Uint8Array([9])) };
    const printer = new HtmlValoracionPdfPrinter(inner);

    const bytes = await printer.print('<html></html>');

    expect(bytes).toEqual(new Uint8Array([9]));
    expect(inner.print).toHaveBeenCalledTimes(1);
    const [html, overrides] = (inner.print as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(html).toBe('<html></html>');
    expect(overrides).toEqual(buildValoracionFooterOverrides());
  });

  it('passes explicit overrides through untouched', async () => {
    const inner: PdfPrinter = { print: vi.fn().mockResolvedValue(new Uint8Array([1])) };
    const printer = new HtmlValoracionPdfPrinter(inner);
    const explicit = { margin: { top: '10mm' } };

    await printer.print('<html></html>', explicit);

    expect(inner.print).toHaveBeenCalledWith('<html></html>', explicit);
  });

  it('propagates EdgeUnavailableError unchanged (route maps it to 502)', async () => {
    const inner: PdfPrinter = {
      print: vi.fn().mockRejectedValue(new EdgeUnavailableError('no edge')),
    };
    const printer = new HtmlValoracionPdfPrinter(inner);

    await expect(printer.print('<html></html>')).rejects.toThrow(EdgeUnavailableError);
  });
});
