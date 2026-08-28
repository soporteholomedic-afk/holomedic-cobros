import type { AtencionDetalle } from '@/types/jjc';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';

/**
 * All clinical data a PDF page can render from.
 *
 * `entrevista`/`evaluacion` are nullable because a page template must still
 * render blank/default controls when a dataset has not been saved yet; the
 * route decides whether missing datasets are acceptable for the document.
 */
export interface PdfSourceData {
  atencion: AtencionDetalle;
  entrevista: EntrevistaOsteomuscular | null;
  evaluacion: EvaluacionOsteomuscular | null;
}

export type PdfTokenKind = 'text' | 'check' | 'figure' | 'image';

/**
 * Declarative mapping from a template token name to a dot path inside
 * `PdfSourceData` (for `text`/`check`) or to an asset path resolved through
 * the injected image resolver (for `figure`/`image`).
 *
 * Dot paths resolve only OWN properties (prototype-safe). `match` compares
 * the resolved value for `check` tokens (radio/select semantics); without it
 * a `check` token renders checked when the resolved value is exactly `true`.
 *
 * `figure` tokens may carry an optional marks overlay: `marks` is a dot path
 * resolving to an array of `{x,y}` points (normalized 0..1) drawn as red X
 * marks over the figure, with `imageWidth`/`imageHeight` the asset's intrinsic
 * dimensions used as the SVG viewBox. This mirrors the selectable figures in
 * the entrevista form (`FigureAreaMarking`).
 */
export interface PdfTokenSpec {
  kind: PdfTokenKind;
  path: string;
  /** Optional expected value for `check` tokens (string comparison). */
  match?: string;
  /** Optional dot path into source data resolving to `{x,y}[]` marks. */
  marks?: string;
  /** Intrinsic width of the figure asset (px), for the marks SVG viewBox. */
  imageWidth?: number;
  /** Intrinsic height of the figure asset (px), for the marks SVG viewBox. */
  imageHeight?: number;
}

export type PdfTokenManifest = Record<string, PdfTokenSpec>;

/** One printable page: which template file plus its token mapping. */
export interface PdfPageManifest {
  page: number;
  /** Public-relative template path, e.g. `musculoesqueletica-pdf/pages/page1.html`. */
  template: string;
  tokens: PdfTokenManifest;
}

/**
 * Page-level print overrides for multi-page documents (REQ-03 D6).
 *
 * Additive and optional: callers that omit them keep the established
 * single-page zero-margin behavior. Validated by the REQ-03 spike
 * (`spike-2-0-pagination.md`): `displayHeaderFooter` + `footerTemplate`
 * page numbering works over `@page { size: A4 }` CSS breaks as long as
 * the pdf margins reserve room for the footer layer.
 */
export interface PdfPrintOverrides {
  /** Enable Chromium's header/footer layer (requires non-zero margins). */
  displayHeaderFooter?: boolean;
  /** HTML template painted in the top margin (needs explicit font-size). */
  headerTemplate?: string;
  /** HTML template painted in the bottom margin (needs explicit font-size). */
  footerTemplate?: string;
  /** Page margins for the pdf call, e.g. `{ bottom: '14mm' }` (CSS units). */
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

/** Port: prints an HTML document to a single A4 page PDF. */
export interface PdfPrinter {
  print(html: string, overrides?: PdfPrintOverrides): Promise<Uint8Array>;
}

/** Port: merges single-page PDFs into one document, preserving order. */
export interface PdfMerger {
  merge(pdfs: readonly Uint8Array[]): Promise<Uint8Array>;
}