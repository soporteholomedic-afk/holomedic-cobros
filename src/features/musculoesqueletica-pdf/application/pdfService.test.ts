import { describe, it, expect, vi } from 'vitest';
import { PdfService } from './pdfService';
import {
  AtencionNotFoundError,
  DataSourceUnavailableError,
  DatasetNotFoundError,
  MergeError,
  PrintError,
  TemplateError,
} from '../domain/errors';
import { sampleSource, sampleEvaluacionFull } from '../testing/sampleSource';
import type { PdfMerger, PdfPrinter } from '../domain/entities';

const PDF_BYTES = new Uint8Array([37, 80, 68, 70]);

function makeFakes(overrides: Partial<{
  atencion: unknown;
  entrevista: unknown;
  evaluacion: unknown;
  renderError: Error;
  printError: Error;
  mergeError: Error;
}> = {}) {
  const loadAtencion = vi.fn().mockResolvedValue(
    overrides.atencion === undefined ? sampleSource.atencion : overrides.atencion,
  );
  const loadEntrevista = vi.fn().mockResolvedValue(
    overrides.entrevista === undefined ? sampleSource.entrevista : overrides.entrevista,
  );
  const loadEvaluacion = vi.fn().mockResolvedValue(
    overrides.evaluacion === undefined ? sampleEvaluacionFull : overrides.evaluacion,
  );
  const renderPage1 = { render: vi.fn().mockResolvedValue('<html>rendered</html>') };
  const printer: PdfPrinter = { print: vi.fn().mockResolvedValue(PDF_BYTES) };
  const merger: PdfMerger = { merge: vi.fn().mockResolvedValue(PDF_BYTES) };
  const service = new PdfService({
    loaders: { loadAtencion, loadEntrevista, loadEvaluacion },
    renderPage1,
    printer,
    merger,
  });
  return { service, loadAtencion, loadEntrevista, loadEvaluacion, renderPage1, printer, merger };
}

describe('PdfService', () => {
  it('loads data, renders page 1, prints and merges in order', async () => {
    const { service, loadAtencion, loadEntrevista, loadEvaluacion, renderPage1, printer, merger } =
      makeFakes();

    const result = await service.generate('2024-MS-089');

    expect(result).toEqual(PDF_BYTES);
    expect(loadAtencion).toHaveBeenCalledWith('2024-MS-089');
    expect(loadEntrevista).toHaveBeenCalledWith('2024-MS-089');
    expect(loadEvaluacion).toHaveBeenCalledWith('2024-MS-089');
    expect(renderPage1.render).toHaveBeenCalledWith(
      expect.objectContaining({
        atencion: sampleSource.atencion,
        entrevista: sampleSource.entrevista,
        evaluacion: sampleEvaluacionFull,
      }),
    );
    expect(printer.print).toHaveBeenCalledWith('<html>rendered</html>');
    expect(merger.merge).toHaveBeenCalledWith([PDF_BYTES]);
  });

  it('throws AtencionNotFoundError when the atencion is missing and never prints', async () => {
    const { service, printer, merger } = makeFakes({ atencion: null });
    await expect(service.generate('X')).rejects.toThrow(AtencionNotFoundError);
    expect(printer.print).not.toHaveBeenCalled();
    expect(merger.merge).not.toHaveBeenCalled();
  });

  it('throws DatasetNotFoundError when the entrevista is missing', async () => {
    const { service, printer } = makeFakes({ entrevista: null });
    await expect(service.generate('X')).rejects.toThrow(DatasetNotFoundError);
    expect(printer.print).not.toHaveBeenCalled();
  });

  it('throws DatasetNotFoundError when the evaluacion is missing', async () => {
    const { service } = makeFakes({ evaluacion: null });
    await expect(service.generate('X')).rejects.toThrow(DatasetNotFoundError);
  });

  it('throws DataSourceUnavailableError when the atencion loader fails', async () => {
    const { service, loadAtencion } = makeFakes();
    loadAtencion.mockRejectedValue(new Error('db down'));
    await expect(service.generate('X')).rejects.toThrow(DataSourceUnavailableError);
  });

  it('throws DataSourceUnavailableError when a dataset loader fails', async () => {
    const { service, loadEntrevista } = makeFakes();
    loadEntrevista.mockRejectedValue(new Error('db down'));
    await expect(service.generate('X')).rejects.toThrow(DataSourceUnavailableError);
  });

  it('propagates TemplateError from the page renderer', async () => {
    const { service, renderPage1 } = makeFakes();
    renderPage1.render.mockRejectedValue(new TemplateError('bad token'));
    await expect(service.generate('X')).rejects.toThrow(TemplateError);
  });

  it('propagates PrintError from the printer', async () => {
    const { service, printer } = makeFakes();
    (printer.print as ReturnType<typeof vi.fn>).mockRejectedValue(new PrintError('nope'));
    await expect(service.generate('X')).rejects.toThrow(PrintError);
  });

  it('propagates MergeError from the merger', async () => {
    const { service, merger } = makeFakes();
    (merger.merge as ReturnType<typeof vi.fn>).mockRejectedValue(new MergeError('nope'));
    await expect(service.generate('X')).rejects.toThrow(MergeError);
  });
});