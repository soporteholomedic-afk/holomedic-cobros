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
 */
export interface PdfTokenSpec {
  kind: PdfTokenKind;
  path: string;
  /** Optional expected value for `check` tokens (string comparison). */
  match?: string;
}

export type PdfTokenManifest = Record<string, PdfTokenSpec>;

/** One printable page: which template file plus its token mapping. */
export interface PdfPageManifest {
  page: number;
  /** Public-relative template path, e.g. `musculoesqueletica-pdf/pages/page1.html`. */
  template: string;
  tokens: PdfTokenManifest;
}

/** Port: prints an HTML document to a single A4 page PDF. */
export interface PdfPrinter {
  print(html: string): Promise<Uint8Array>;
}

/** Port: merges single-page PDFs into one document, preserving order. */
export interface PdfMerger {
  merge(pdfs: readonly Uint8Array[]): Promise<Uint8Array>;
}