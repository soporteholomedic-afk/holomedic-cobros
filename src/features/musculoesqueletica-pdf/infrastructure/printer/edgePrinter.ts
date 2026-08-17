import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { EdgeUnavailableError, PrintError } from '../../domain/errors';
import type { PdfPrinter } from '../../domain/entities';

/** Known installation paths of Microsoft Edge on Windows. */
const KNOWN_WINDOWS_EDGE_PATHS: readonly string[] = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/**
 * Resolve the Edge executable: `EDGE_EXECUTABLE_PATH` env override first,
 * then the known Windows installation paths. Returns `null` when no usable
 * browser exists — the caller maps that to a 502.
 */
export function resolveEdgeExecutablePath(
  env: Readonly<Record<string, string | undefined>> = process.env,
  exists: (filePath: string) => boolean = fs.existsSync,
): string | null {
  const override = env.EDGE_EXECUTABLE_PATH?.trim();
  if (override) return override;
  return KNOWN_WINDOWS_EDGE_PATHS.find(exists) ?? null;
}

interface EdgePrinterOptions {
  /** Launch override (defaults to `puppeteer.launch`) — injected in tests. */
  launch?: (options: Parameters<typeof puppeteer.launch>[0]) => Promise<Awaited<ReturnType<typeof puppeteer.launch>>>;
  /** Executable resolver override (defaults to `resolveEdgeExecutablePath`). */
  resolveExecutable?: () => string | null;
}

/**
 * Prints an offline HTML document to a single A4 page PDF with system Edge.
 *
 * The executable path is a fixed string (never shell-expanded), assets are
 * data URIs (no network), the page waits for fonts and image decoding, and
 * the browser is always closed in `finally`.
 */
export class EdgePrinter implements PdfPrinter {
  private readonly launch: NonNullable<EdgePrinterOptions['launch']>;
  private readonly resolveExecutable: () => string | null;

  constructor(options: EdgePrinterOptions = {}) {
    this.launch = options.launch ?? ((launchOptions) => puppeteer.launch(launchOptions));
    this.resolveExecutable = options.resolveExecutable ?? (() => resolveEdgeExecutablePath());
  }

  async print(html: string): Promise<Uint8Array> {
    const executablePath = this.resolveExecutable();
    if (!executablePath) {
      throw new EdgeUnavailableError(
        'No Edge executable available; set EDGE_EXECUTABLE_PATH or install Edge',
      );
    }

    let browser: Awaited<ReturnType<NonNullable<EdgePrinterOptions['launch']>>> | undefined;
    try {
      browser = await this.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      // Wait for self-hosted fonts and decoded images before painting to PDF.
      await page.evaluateHandle('document.fonts.ready');
      await page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.decode().catch(() => undefined),
          ),
        );
      });
      await page.emulateMediaType('print');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      return new Uint8Array(pdf);
    } catch (err) {
      if (err instanceof EdgeUnavailableError) throw err;
      throw new PrintError('Edge could not print the page', { cause: err });
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }
}