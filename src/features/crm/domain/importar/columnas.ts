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
 *
 * Crm-ux redesign: user-facing option values speak the intuitive
 * vocabulary ("Nos contactaron" / "Los buscamos"); the DOMAIN keeps the
 * machine values ('Inbound'/'Outbound') — `ORIGEN_POR_ETIQUETA` is the
 * single translation point.
 */

import type { Origen, TipoEmpresa } from '../entities';
import { SECTORES_CRM } from '../entities';

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
 * The 15 columns, in template/import order (PRD rev 3 + rediseno-crm-panel
 * task 2.1). Required: * Empresa, RUC, Tipo, Encargado, Correos.
 * `Principal` only accepts "Sí" — empty means "not principal" (default:
 * first listed contacto). The three panel fields round-trip the alta
 * form: Rubro (empresa), Cantidad de Trabajadores (empresa) and Cargo
 * (contacto).
 */
export const COLUMNAS_IMPORT_CRM: readonly ColumnaImportCrm[] = [
  { clave: 'empresa', encabezado: 'Empresa', requerido: true, tipo: 'texto' },
  { clave: 'ruc', encabezado: 'RUC', requerido: true, tipo: 'texto' },
  {
    clave: 'tipo',
    encabezado: 'Tipo',
    requerido: true,
    tipo: 'lista',
    opciones: ['Cliente Nuevo', 'Posible Cliente'],
  },
  {
    clave: 'origen',
    encabezado: 'Origen',
    requerido: false,
    tipo: 'lista',
    opciones: ['Nos contactaron', 'Los buscamos'],
  },
  { clave: 'proyectoObra', encabezado: 'Proyecto/Obra', requerido: false, tipo: 'texto' },
  { clave: 'destinoComun', encabezado: 'Destino Común', requerido: false, tipo: 'texto' },
  { clave: 'responsable', encabezado: 'Responsable', requerido: false, tipo: 'texto' },
  { clave: 'notas', encabezado: 'Notas', requerido: false, tipo: 'texto' },
  {
    clave: 'rubro',
    encabezado: 'Rubro',
    requerido: false,
    tipo: 'lista',
    opciones: SECTORES_CRM,
  },
  { clave: 'cantidadTrabajadores', encabezado: 'Cantidad de Trabajadores', requerido: false, tipo: 'texto' },
  { clave: 'encargado', encabezado: 'Encargado', requerido: true, tipo: 'texto' },
  { clave: 'correos', encabezado: 'Correos', requerido: true, tipo: 'texto' },
  { clave: 'telefono', encabezado: 'Teléfono', requerido: false, tipo: 'texto' },
  { clave: 'cargo', encabezado: 'Cargo', requerido: false, tipo: 'texto' },
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
  /** SECTORES_CRM label (display form = storage form); '' = empty cell. */
  rubro: string;
  /** Raw cell — validated as a positive integer downstream. */
  cantidadTrabajadores: string;
  encargado: string;
  /** One or more addresses separated by ";". */
  correos: string;
  telefono: string;
  /** Operational role of the contacto; '' = empty cell. */
  cargo: string;
  /** "Sí" marks the contacto as principal; empty = default (first listed). */
  principal: string;
}

/**
 * Excel-facing Origen label → domain value (crm-ux redesign). The
 * spreadsheet speaks the intuitive vocabulary; the domain/DB keeps the
 * machine values. LEGACY English cells ('Inbound'/'Outbound' from
 * templates downloaded before the rename) still resolve, so previously
 * filled files import unchanged.
 */
export const ORIGEN_POR_ETIQUETA: ReadonlyMap<string, Origen> = new Map([
  ['Nos contactaron', 'Inbound'],
  ['Los buscamos', 'Outbound'],
  ['Inbound', 'Inbound'],
  ['Outbound', 'Outbound'],
]);

/**
 * Excel-facing Tipo label → domain value (rediseno-crm-panel task 2.1).
 * The sheet speaks the panel vocabulary ("Cliente Nuevo" / "Posible
 * Cliente"); the domain keeps 'Cliente'/'Prospecto'. LEGACY cells with
 * the bare domain words still resolve, so previously filled files import
 * unchanged (ORIGEN_POR_ETIQUETA precedent).
 */
export const TIPO_POR_ETIQUETA: ReadonlyMap<string, TipoEmpresa> = new Map([
  ['Cliente Nuevo', 'Cliente'],
  ['Posible Cliente', 'Prospecto'],
  ['Cliente', 'Cliente'],
  ['Prospecto', 'Prospecto'],
]);
