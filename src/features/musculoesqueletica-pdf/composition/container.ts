import fs from 'fs';
import path from 'path';
import { buildGetAtencionDetalle } from '@/features/jjc-mapper/composition/container';
import { buildLoadEntrevistaOsteomuscular } from '@/features/entrevista-osteomuscular/composition/container';
import { buildLoadEvaluacionOsteomuscular } from '@/features/evaluacion-osteomuscular/composition/container';
import { PdfService } from '../application/pdfService';
import type { PageRenderer } from '../application/pdfService';
import { renderTemplate } from '../application/renderer';
import { ALL_PAGE_MANIFESTS } from '../infrastructure/templates';
import { EdgePrinter } from '../infrastructure/printer/edgePrinter';
import { PdfLibMerger } from '../infrastructure/merger';
import { inlineAssets, loadImageAsDataUri } from '../infrastructure/assets';
import { TemplateError } from '../domain/errors';
import type { PdfSourceData } from '../domain/entities';

const ASSET_ROOTS = ['musculoesqueletica-pdf', 'assets'] as const;
const CANONICAL_FIGURE_ROOT = path.join('assets', 'images', 'musculo', 'entrevista');
const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'] as const;

/**
 * Build a page renderer for a given page manifest. Each renderer reads
 * its template, inlines assets, and resolves tokens against the source data.
 */
function buildPageRenderer(
  manifest: (typeof ALL_PAGE_MANIFESTS)[number],
  publicRoot: string,
  assetsRoot: string,
  firmaHuellaRoots: string[],
): PageRenderer {
  return {
    render: async (source: PdfSourceData) => {
      const templateAbsPath = path.join(publicRoot, manifest.template);
      let templateHtml: string;
      try {
        templateHtml = fs.readFileSync(templateAbsPath, 'utf8');
      } catch (err) {
        throw new TemplateError(`Cannot read template ${manifest.template}`, { cause: err });
      }
      const offlineHtml = inlineAssets(templateHtml, path.dirname(templateAbsPath));

      // Resolve image tokens: figures from canonical/feature roots,
      // firma/huella from atencion.rutaFirma / rutaHuella.
      return renderTemplate(offlineHtml, manifest.tokens, source, (assetPath) => {
        // Special handling for firma/huella tokens (page 4).
        if (assetPath === 'firma_paciente' && source.atencion.rutaFirma) {
          return loadImageAsDataUri(source.atencion.rutaFirma, {
            baseDir: publicRoot,
            roots: firmaHuellaRoots,
            allowedExtensions: [...ALLOWED_IMAGE_EXTENSIONS],
            maxBytes: MAX_IMAGE_BYTES,
          });
        }
        if (assetPath === 'huella_paciente' && source.atencion.rutaHuella) {
          return loadImageAsDataUri(source.atencion.rutaHuella, {
            baseDir: publicRoot,
            roots: firmaHuellaRoots,
            allowedExtensions: [...ALLOWED_IMAGE_EXTENSIONS],
            maxBytes: MAX_IMAGE_BYTES,
          });
        }
        // Standard figure/image resolution.
        return loadImageAsDataUri(assetPath, {
          baseDir: publicRoot,
          roots: [assetsRoot, path.join(publicRoot, CANONICAL_FIGURE_ROOT)],
          allowedExtensions: [...ALLOWED_IMAGE_EXTENSIONS],
          maxBytes: MAX_IMAGE_BYTES,
        });
      });
    },
  };
}

/**
 * Composition root for the musculoesqueletica PDF pipeline. This is the only
 * place where concrete adapters (SQL Server loaders, Edge printer, pdf-lib
 * merger) are bound to the ports the application layer consumes.
 */
export function buildPdfService(): PdfService {
  const publicRoot = path.join(process.cwd(), 'public');
  const assetsRoot = path.join(publicRoot, ...ASSET_ROOTS);
  const firmaHuellaRoots = [
    path.join(publicRoot, 'musculoesqueletica-pdf', 'assets'),
    path.join(publicRoot, 'assets'),
  ];

  const atencionUseCase = buildGetAtencionDetalle();
  const entrevistaUseCase = buildLoadEntrevistaOsteomuscular();
  const evaluacionUseCase = buildLoadEvaluacionOsteomuscular();

  const pageRenderers = ALL_PAGE_MANIFESTS.map((manifest) =>
    buildPageRenderer(manifest, publicRoot, assetsRoot, firmaHuellaRoots),
  );

  return new PdfService({
    loaders: {
      loadAtencion: (idAten) => atencionUseCase.execute(idAten),
      loadEntrevista: async (idAten) => {
        const result = await entrevistaUseCase.execute(idAten);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      loadEvaluacion: async (idAten) => {
        const result = await evaluacionUseCase.execute(idAten);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
    },
    pageRenderers,
    printer: new EdgePrinter(),
    merger: new PdfLibMerger(),
  });
}