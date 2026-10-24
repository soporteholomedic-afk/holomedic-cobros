// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/**
 * Regression (prod 2026-10-23): in the alpine image pdf-parse/pdfjs-dist
 * threw `ReferenceError: DOMMatrix is not defined` while the module was
 * being LOADED. A static import of pdf-parse took the whole ingestas route
 * down (even GET listing). pdf-parse must only be loaded when a PDF is
 * actually extracted, and a load failure must surface as ExtraccionError.
 */
vi.mock('pdf-parse', () => {
  throw new ReferenceError('DOMMatrix is not defined');
});

describe('extraerTextoArchivo when pdf-parse cannot be loaded', () => {
  it('the module still loads and non-PDF types keep working', async () => {
    const { extraerTextoArchivo } = await import('../extraerTextoArchivo');
    await expect(extraerTextoArchivo(Buffer.from('hola\r\nmundo', 'utf8'), 'TXT')).resolves.toBe(
      'hola\nmundo',
    );
  });

  it('a PDF extraction fails with ExtraccionError carrying the load error', async () => {
    const { extraerTextoArchivo, ExtraccionError } = await import('../extraerTextoArchivo');
    const error = await extraerTextoArchivo(Buffer.from('%PDF-1.7', 'utf8'), 'PDF').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ExtraccionError);
    expect((error as InstanceType<typeof ExtraccionError>).message).toMatch(/PDF/);
    expect((error as InstanceType<typeof ExtraccionError>).cause).toBeDefined();
  });
});
