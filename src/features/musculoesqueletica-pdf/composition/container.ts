import fs from 'fs';
import path from 'path';
import { buildGetAtencionDetalle } from '@/features/jjc-mapper/composition/container';
import { buildLoadEntrevistaOsteomuscular } from '@/features/entrevista-osteomuscular/composition/container';
import { buildLoadEvaluacionOsteomuscular } from '@/features/evaluacion-osteomuscular/composition/container';
import { PdfService } from '../application/pdfService';
import { renderTemplate } from '../application/renderer';
import { PAGE_1_MANIFEST } from '../infrastructure/templates/page1';
import { EdgePrinter } from '../infrastructure/printer/edgePrinter';
import { PdfLibMerger } from '../infrastructure/merger';
import { inlineAssets, loadImageAsDataUri } from '../infrastructure/assets';
import { TemplateError } from '../domain/errors';

const ASSET_ROOTS = ['musculoesqueletica-pdf', 'assets'] as const;
const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'] as const;

/**
 * Composition root for the musculoesqueletica PDF pipeline. This is the only
 * place where concrete adapters (SQL Server loaders, Edge printer, pdf-lib
 * merger) are bound to the ports the application layer consumes.
 */
export function buildPdfService(): PdfService {
  const publicRoot = path.join(process.cwd(), 'public');
  const assetsRoot = path.join(publicRoot, ...ASSET_ROOTS);

  const atencionUseCase = buildGetAtencionDetalle();
  const entrevistaUseCase = buildLoadEntrevistaOsteomuscular();
  const evaluacionUseCase = buildLoadEvaluacionOsteomuscular();

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
    renderPage1: {
      render: async (source) => {
        const templateAbsPath = path.join(publicRoot, PAGE_1_MANIFEST.template);
        let templateHtml: string;
        try {
          templateHtml = fs.readFileSync(templateAbsPath, 'utf8');
        } catch (err) {
          throw new TemplateError(
            `Cannot read template ${PAGE_1_MANIFEST.template}`,
            { cause: err },
          );
        }
        const offlineHtml = inlineAssets(templateHtml, path.dirname(templateAbsPath));
        return renderTemplate(offlineHtml, PAGE_1_MANIFEST.tokens, source, (assetPath) =>
          loadImageAsDataUri(assetPath, {
            baseDir: publicRoot,
            roots: [assetsRoot],
            allowedExtensions: [...ALLOWED_IMAGE_EXTENSIONS],
            maxBytes: MAX_IMAGE_BYTES,
          }),
        );
      },
    },
    printer: new EdgePrinter(),
    merger: new PdfLibMerger(),
  });
}