import { PDFDocument } from 'pdf-lib';
import { MergeError } from '../domain/errors';
import type { PdfMerger } from '../domain/entities';

/**
 * Merges single-page PDFs into one document with `pdf-lib`, preserving the
 * input order. Failures surface as `MergeError` (route → 500).
 */
export class PdfLibMerger implements PdfMerger {
  async merge(pdfs: readonly Uint8Array[]): Promise<Uint8Array> {
    try {
      const out = await PDFDocument.create();
      for (const bytes of pdfs) {
        const src = await PDFDocument.load(bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const page of pages) {
          out.addPage(page);
        }
      }
      return out.save();
    } catch (err) {
      throw new MergeError('Failed to merge page PDFs', { cause: err });
    }
  }
}