import { COLUMNAS_IMPORT_CRM, type FilaImportCrm } from './columnas';
import { ImportacionExcedeLimiteError, MAXIMO_FILAS_IMPORTACION } from './limiteFilas';

/**
 * Pure mapper from client-parsed row objects to `FilaImportCrm` rows
 * (tasks pr8/WU3 — extracted from the pr6 infrastructure adapter so the
 * browser-side template parser and the server routes share ONE
 * normalization; importing it from the client must not drag `mssql`
 * into the bundle).
 *
 * Row keys are Excel headers as typed by the user, possibly asterisked
 * by the template, or the stable column claves — every lookup derives
 * from `COLUMNAS_IMPORT_CRM`, never a private list (G3 anti-drift).
 * Cells are coerced to raw text ('' = empty); the server re-validates
 * EVERYTHING downstream, so no cleanup happens here. Enforces the
 * 2000-row cap (typed Spanish error) BEFORE any mapping work.
 */
export function mapearFilasImportCrm(
  filasBrutas: ReadonlyArray<Record<string, unknown>>,
): FilaImportCrm[] {
  if (filasBrutas.length > MAXIMO_FILAS_IMPORTACION) {
    throw new ImportacionExcedeLimiteError();
  }

  // Asterisks become whitespace BEFORE collapsing, so 'Encargado *'
  // and 'Encargado*' resolve identically to the bare clave.
  const claveNormalizada = (clave: string): string =>
    clave.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const candidatos = new Map<string, string>();
  for (const columna of COLUMNAS_IMPORT_CRM) {
    candidatos.set(claveNormalizada(columna.clave), columna.clave);
    candidatos.set(claveNormalizada(columna.encabezado), columna.clave);
  }

  return filasBrutas.map((filaBruta) => {
    const porClave = new Map<string, unknown>();
    for (const [clave, valor] of Object.entries(filaBruta)) {
      const claveColumna = candidatos.get(claveNormalizada(clave));
      if (claveColumna !== undefined) porClave.set(claveColumna, valor);
    }

    const fila = {} as Record<keyof FilaImportCrm, string>;
    for (const columna of COLUMNAS_IMPORT_CRM) {
      fila[columna.clave as keyof FilaImportCrm] = aTexto(porClave.get(columna.clave));
    }
    return fila;
  });
}

/** Cell → raw text ('' for empty/unknown shapes; numbers via String). */
function aTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'bigint') return valor.toString();
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  return '';
}
