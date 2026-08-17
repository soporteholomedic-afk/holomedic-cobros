import {
  AtencionNotFoundError,
  DataSourceUnavailableError,
  DatasetNotFoundError,
} from '../domain/errors';
import type {
  PdfMerger,
  PdfPrinter,
  PdfSourceData,
} from '../domain/entities';
import type { AtencionDetalle } from '@/types/jjc';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';

export interface PdfServiceLoaders {
  loadAtencion: (idAten: string) => Promise<AtencionDetalle | null>;
  loadEntrevista: (idAten: string) => Promise<EntrevistaOsteomuscular | null>;
  loadEvaluacion: (idAten: string) => Promise<EvaluacionOsteomuscular | null>;
}

/** Renders one fully-offline page HTML from the assembled source data. */
export interface PageRenderer {
  render(source: PdfSourceData): Promise<string>;
}

export interface PdfServiceDeps {
  loaders: PdfServiceLoaders;
  /**
   * Ordered array of page renderers for the complete document (pages 1-9).
   * Each renderer produces one fully-offline HTML page from the source data.
   */
  pageRenderers: PageRenderer[];
  printer: PdfPrinter;
  merger: PdfMerger;
}

/**
 * Orchestrates the single-document PDF pipeline:
 * assemble source data → render all pages → print each with Edge → merge into one PDF.
 *
 * Failures are typed so the route can map them to 404/502/500 without ever
 * exposing clinical payloads.
 */
export class PdfService {
  constructor(private readonly deps: PdfServiceDeps) {}

  async generate(idAten: string): Promise<Uint8Array> {
    const source = await this.loadSource(idAten);

    // Render all pages in order.
    const htmlPages = await Promise.all(
      this.deps.pageRenderers.map((renderer) => renderer.render(source)),
    );

    // Print each page to a single-page PDF.
    const pagePdfs = await Promise.all(
      htmlPages.map((html) => this.deps.printer.print(html)),
    );

    // Merge all page PDFs into one document, preserving order.
    return this.deps.merger.merge(pagePdfs);
  }

  private async loadSource(idAten: string): Promise<PdfSourceData> {
    let atencion: AtencionDetalle | null;
    try {
      atencion = await this.deps.loaders.loadAtencion(idAten);
    } catch (err) {
      throw new DataSourceUnavailableError('Atencion loader failed', { cause: err });
    }
    if (!atencion) {
      throw new AtencionNotFoundError(`Atencion ${idAten} not found`);
    }

    let entrevista: EntrevistaOsteomuscular | null;
    let evaluacion: EvaluacionOsteomuscular | null;
    try {
      [entrevista, evaluacion] = await Promise.all([
        this.deps.loaders.loadEntrevista(idAten),
        this.deps.loaders.loadEvaluacion(idAten),
      ]);
    } catch (err) {
      throw new DataSourceUnavailableError('Dataset loader failed', { cause: err });
    }

    if (!entrevista || !evaluacion) {
      throw new DatasetNotFoundError(`Required datasets missing for ${idAten}`);
    }

    return { atencion, entrevista, evaluacion };
  }
}