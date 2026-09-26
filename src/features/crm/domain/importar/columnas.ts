/**
 * Shared import-column definition for the CRM Excel import (spec G3
 * anti-drift requirement): the template builder (pr7), the importer and
 * the wizard ALL derive their columns from this ONE constant — order,
 * keys, required flags and enum options. No consumer keeps its own list.
 *
 * Column layout follows PRD rev 3: ONE ROW PER ENCARGADO — empresa-level
 * columns (empresa…notas) repeat across rows of the same empresa; the
 * importer groups rows by normalized RUC. Contact-level columns
 * (encargado…principal) describe one contacto each.
 */

/** Content kind of a column: free text or constrained dropdown list. */
export type TipoColumnaImport = 'texto' | 'lista';

/**
 * Name of the template's data worksheet (first sheet, pinned by the
 * pr7 drift test). The server builder creates it and the browser-side
 * parser looks it up by this name — ONE source of truth.
 */
export const HOJA_DATOS = 'Empresas';

export interface ColumnaImportCrm {
  /** Stable key — importer field name and template header source. */
  clave: string;
  /** Excel header text shown to the user (Spanish, app language). */
  encabezado: string;
  /** Missing value → row-level error (never blocks other rows). */
  requerido: boolean;
  tipo: TipoColumnaImport;
  /** Allowed values for `tipo: 'lista'` columns; undefined for texto. */
  opciones?: readonly string[];
}

/**
 * The 12 columns, in template/import order (PRD rev 3). Required: *
 * Empresa, RUC, Tipo, Encargado, Correos. `Principal` only accepts
 * "Sí" — empty means "not principal" (default: first listed contacto).
 */
export const COLUMNAS_IMPORT_CRM: readonly ColumnaImportCrm[] = [
  { clave: 'empresa', encabezado: 'Empresa', requerido: true, tipo: 'texto' },
  { clave: 'ruc', encabezado: 'RUC', requerido: true, tipo: 'texto' },
  {
    clave: 'tipo',
    encabezado: 'Tipo',
    requerido: true,
    tipo: 'lista',
    opciones: ['Cliente', 'Prospecto'],
  },
  {
    clave: 'origen',
    encabezado: 'Origen',
    requerido: false,
    tipo: 'lista',
    opciones: ['Inbound', 'Outbound'],
  },
  { clave: 'proyectoObra', encabezado: 'Proyecto/Obra', requerido: false, tipo: 'texto' },
  { clave: 'destinoComun', encabezado: 'Destino Común', requerido: false, tipo: 'texto' },
  { clave: 'responsable', encabezado: 'Responsable', requerido: false, tipo: 'texto' },
  { clave: 'notas', encabezado: 'Notas', requerido: false, tipo: 'texto' },
  { clave: 'encargado', encabezado: 'Encargado', requerido: true, tipo: 'texto' },
  { clave: 'correos', encabezado: 'Correos', requerido: true, tipo: 'texto' },
  { clave: 'telefono', encabezado: 'Teléfono', requerido: false, tipo: 'texto' },
  {
    clave: 'principal',
    encabezado: 'Principal',
    requerido: false,
    tipo: 'lista',
    opciones: ['Sí'],
  },
];

/**
 * One parsed Excel row — every cell as a raw string ('' = empty cell).
 * Keys mirror the `COLUMNAS_IMPORT_CRM` claves one-to-one (guarded by
 * `columnas.test.ts`); the pr8 xlsx adapter maps sheet headers to these
 * keys via the constant, never by a private list.
 */
export interface FilaImportCrm {
  empresa: string;
  ruc: string;
  tipo: string;
  origen: string;
  proyectoObra: string;
  destinoComun: string;
  responsable: string;
  notas: string;
  encargado: string;
  /** One or more addresses separated by ";". */
  correos: string;
  telefono: string;
  /** "Sí" marks the contacto as principal; empty = default (first listed). */
  principal: string;
}
