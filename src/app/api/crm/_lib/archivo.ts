import { ArchivoImportacionInvalidoError } from '@/features/crm/domain/errors';

/** Largest file the import accepts (5 MB, as in the approved design). */
export const MAX_BYTES_IMPORTACION = 5 * 1024 * 1024;

/**
 * Take the uploaded Excel out of a multipart request (field `archivo`) and
 * check what can be checked without opening it: it is a file, an .xlsx, not
 * empty and not over 5 MB. Throws `ArchivoImportacionInvalidoError` with a
 * user-facing message. The bytes are opened later by `leerExcelEmpresas`.
 */
export async function leerArchivoSubido(request: Request): Promise<Buffer> {
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    throw new ArchivoImportacionInvalidoError('No se pudo leer el formulario enviado.');
  }

  const subido = formulario.get('archivo');
  if (!(subido instanceof File)) throw new ArchivoImportacionInvalidoError('Selecciona un archivo Excel.');

  const nombre = subido.name.toLowerCase();
  if (nombre.endsWith('.xls')) {
    throw new ArchivoImportacionInvalidoError(
      'Los archivos .xls no se pueden leer. Ábrelo en Excel, guárdalo como .xlsx y vuelve a subirlo.',
    );
  }
  if (!nombre.endsWith('.xlsx')) throw new ArchivoImportacionInvalidoError('El archivo debe ser un Excel (.xlsx).');
  if (subido.size === 0) throw new ArchivoImportacionInvalidoError('El archivo está vacío.');
  if (subido.size > MAX_BYTES_IMPORTACION) {
    throw new ArchivoImportacionInvalidoError('El archivo pesa más de 5 MB. Divídelo en partes más pequeñas.');
  }
  return Buffer.from(await subido.arrayBuffer());
}
