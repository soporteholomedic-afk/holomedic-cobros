import { describe, it, expect, vi } from 'vitest';
import { EdgePrinter, resolveEdgeExecutablePath } from './edgePrinter';
import { EdgeUnavailableError, PrintError } from '../../domain/errors';

describe('resolveEdgeExecutablePath', () => {
  it('prefers the EDGE_EXECUTABLE_PATH env override', () => {
    const env: Record<string, string | undefined> = { EDGE_EXECUTABLE_PATH: '/opt/edge/msedge' };
    expect(resolveEdgeExecutablePath(env, () => false)).toBe('/opt/edge/msedge');
  });

  it('returns the first known Windows Edge path that exists', () => {
    const exists = (p: string) => p.includes('Program Files (x86)');
    expect(resolveEdgeExecutablePath({}, exists)).toBe(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    );
  });

  it('falls back to known Linux browser paths when Windows Edge is absent', () => {
    const exists = (p: string) => p === '/usr/bin/chromium';
    expect(resolveEdgeExecutablePath({}, exists)).toBe('/usr/bin/chromium');
  });

  it('returns null when no env override and no known path exists', () => {
    expect(resolveEdgeExecutablePath({}, () => false)).toBeNull();
  });
});

interface FakePage {
  setContent: ReturnType<typeof vi.fn>;
  evaluateHandle: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  emulateMediaType: ReturnType<typeof vi.fn>;
  pdf: ReturnType<typeof vi.fn>;
}

interface FakeBrowser {
  newPage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makeFakes(pdfResult: Uint8Array | Error) {
  const page: FakePage = {
    setContent: vi.fn().mockResolvedValue(undefined),
    evaluateHandle: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    emulateMediaType: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockImplementation(() =>
      pdfResult instanceof Error ? Promise.reject(pdfResult) : Promise.resolve(pdfResult),
    ),
  };
  const browser: FakeBrowser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const launch = vi.fn().mockResolvedValue(browser);
  return { page, browser, launch };
}

const HTML = '<html><body>hola</body></html>';
const FAKE_PDF = new Uint8Array([1, 2, 3, 4]);

describe('EdgePrinter', () => {
  it('prints A4 with print background and zero margins, then closes the browser', async () => {
    const { page, browser, launch } = makeFakes(FAKE_PDF);
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    const result = await printer.print(HTML);

    expect(result).toEqual(FAKE_PDF);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath: '/fake/edge',
        headless: true,
      }),
    );
    expect(browser.newPage).toHaveBeenCalledTimes(1);
    expect(page.setContent).toHaveBeenCalledWith(HTML, expect.anything());
    expect(page.emulateMediaType).toHaveBeenCalledWith('print');
    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    );
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser in finally when printing fails and surfaces PrintError', async () => {
    const { browser, launch } = makeFakes(new Error('pdf boom'));
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    await expect(printer.print(HTML)).rejects.toThrow(PrintError);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser in finally when setContent fails', async () => {
    const { page, browser, launch } = makeFakes(FAKE_PDF);
    page.setContent.mockRejectedValue(new Error('content boom'));
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    await expect(printer.print(HTML)).rejects.toThrow(PrintError);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('surfaces EdgeUnavailableError and never launches when no executable resolves', async () => {
    const { launch } = makeFakes(FAKE_PDF);
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => null,
    });

    await expect(printer.print(HTML)).rejects.toThrow(EdgeUnavailableError);
    expect(launch).not.toHaveBeenCalled();
  });

  it('surfaces PrintError when the browser launch fails', async () => {
    const launch = vi.fn().mockRejectedValue(new Error('launch boom'));
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    await expect(printer.print(HTML)).rejects.toThrow(PrintError);
  });

  it('waits for fonts and image decoding before printing', async () => {
    const { page, launch } = makeFakes(FAKE_PDF);
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    await printer.print(HTML);

    expect(page.evaluateHandle).toHaveBeenCalledWith('document.fonts.ready');
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
    // evaluate must run before pdf
    const evaluateIndex = page.evaluate.mock.invocationCallOrder[0];
    const pdfIndex = page.pdf.mock.invocationCallOrder[0];
    expect(evaluateIndex).toBeLessThan(pdfIndex);
  });

  // ---- REQ-03 D6: additive overrides (spike 2.0 validated footerTemplate) ----

  it('forwards header/footer overrides to page.pdf for multi-page documents', async () => {
    const { page, launch } = makeFakes(FAKE_PDF);
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    const footer = '<div style="font-size:8px">P&aacute;gina <span class="pageNumber"></span></div>';
    await printer.print(HTML, {
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footer,
      margin: { top: '8mm', right: '8mm', bottom: '14mm', left: '8mm' },
    });

    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: footer,
        margin: { top: '8mm', right: '8mm', bottom: '14mm', left: '8mm' },
      }),
    );
  });

  it('applies a margin override without enabling header/footer', async () => {
    const { page, launch } = makeFakes(FAKE_PDF);
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    await printer.print(HTML, { margin: { top: '10mm' } });

    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        margin: { top: '10mm' },
      }),
    );
    // displayHeaderFooter must NOT be forced on by a margins-only override.
    const options = page.pdf.mock.calls[0][0] as Record<string, unknown>;
    expect('displayHeaderFooter' in options).toBe(false);
  });

  it('keeps the default zero-margin single-page options when no overrides are passed', async () => {
    const { page, launch } = makeFakes(FAKE_PDF);
    const printer = new EdgePrinter({
      launch: launch as never,
      resolveExecutable: () => '/fake/edge',
    });

    await printer.print(HTML);

    const options = page.pdf.mock.calls[0][0] as Record<string, unknown>;
    expect(options.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect('displayHeaderFooter' in options).toBe(false);
    expect('footerTemplate' in options).toBe(false);
  });
});