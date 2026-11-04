// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { ArchivoImportacionInvalidoError } from '@/features/crm/domain/errors';
import { MAX_BYTES_IMPORTACION, leerArchivoSubido } from '../archivo';
import { archivo, multipart, multipartRoto } from './importacion';

async function fallo(request: Request): Promise<Error> {
  try {
    await leerArchivoSubido(request);
  } catch (e) {
    return e as Error;
  }
  throw new Error('se esperaba un error y no hubo');
}

describe('leerArchivoSubido', () => {
  it('returns the exact bytes of the .xlsx sent in the "archivo" field', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 9, 8, 7]);
    const leido = await leerArchivoSubido(multipart({ archivo: archivo(bytes) }));
    expect(Buffer.isBuffer(leido)).toBe(true);
    expect([...leido]).toEqual([...bytes]);
  });

  it('accepts the extension in any case', async () => {
    const leido = await leerArchivoSubido(multipart({ archivo: archivo(new Uint8Array([1]), 'EMPRESAS.XLSX') }));
    expect(leido).toHaveLength(1);
  });

  it.each([
    ['there is no "archivo" field', {}],
    ['"archivo" is plain text and not a file', { archivo: 'hola' }],
  ])('asks for a file when %s', async (_n, campos) => {
    const e = await fallo(multipart(campos));
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe('Selecciona un archivo Excel.');
  });

  it('rejects an .xls saying why and how to fix it (exceljs cannot read the old format)', async () => {
    const e = await fallo(multipart({ archivo: archivo(new Uint8Array([1]), 'viejo.xls') }));
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe('Los archivos .xls no se pueden leer. Ábrelo en Excel, guárdalo como .xlsx y vuelve a subirlo.');
  });

  it.each(['datos.csv', 'informe.pdf', 'sin_extension', 'engañoso.xlsx.exe'])('rejects %s as not an Excel file', async (nombre) => {
    const e = await fallo(multipart({ archivo: archivo(new Uint8Array([1]), nombre) }));
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe('El archivo debe ser un Excel (.xlsx).');
  });

  it('rejects an empty file', async () => {
    const e = await fallo(multipart({ archivo: archivo(new Uint8Array(0)) }));
    expect(e.message).toBe('El archivo está vacío.');
  });

  it('accepts a file of exactly 5 MB and rejects one byte more', async () => {
    const justo = await leerArchivoSubido(multipart({ archivo: archivo(new Uint8Array(MAX_BYTES_IMPORTACION)) }));
    expect(justo).toHaveLength(MAX_BYTES_IMPORTACION);
    const e = await fallo(multipart({ archivo: archivo(new Uint8Array(MAX_BYTES_IMPORTACION + 1)) }));
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe('El archivo pesa más de 5 MB. Divídelo en partes más pequeñas.');
  });

  it('answers with a user message when the body cannot be read as a form', async () => {
    const e = await fallo(multipartRoto());
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe('No se pudo leer el formulario enviado.');
  });
});
