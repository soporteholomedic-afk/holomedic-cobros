/**
 * Pure core of the CRM Excel import validation (spec G2): row-level
 * validation, grouping by normalized RUC, repeated-empresa-field
 * conflict detection and in-file contacto collapse. NO I/O, no
 * framework imports — the pr6 executor and the pr8 preview route both
 * consume this function so the server re-validates EVERYTHING it is
 * shown (never trusts client-parsed rows).
 *
 * Semantics (spec G2 + design D1):
 * - `fila` numbers assume the template layout: header occupies sheet
 *   row 1, so the first input row is fila 2.
 * - A row with ANY row-level error is excluded (reported as
 *   {fila, columna, mensaje} in Spanish) without blocking other rows.
 * - REPEATED-EMPRESA-FIELD CONFLICT RULE: within one RUC group the
 *   empresa-level cells must be consistent. The group's reference is
 *   its most frequent value-set (plurality); divergent rows are
 *   reported as conflicts and excluded. On a TIE there is no
 *   trustworthy reference: EVERY row of the group is reported as a
 *   conflict and the whole group is skipped — other RUC groups are
 *   never affected.
 * - Rows of the same RUC whose encargado share a normalized name
 *   collapse into ONE contacto with their correos unioned (dedup,
 *   first-seen order) — design D1 in-file collapse.
 * - Principal: a row with Principal "Sí" marks its contacto; the FIRST
 *   marked contacto wins (pr3 `resolverContactos` semantics); with no
 *   mark at all, the FIRST listed contacto is principal.
 */
import type { Origen, TipoEmpresa } from '../entities';
import { normalizarCorreo, normalizarNombre, normalizarRuc } from '../normalizar';

import { COLUMNAS_IMPORT_CRM, type FilaImportCrm } from './columnas';

/** Row-level error as surfaced to the admin (Spanish, app language). */
export interface ErrorFilaImport {
  fila: number;
  /** Excel header of the offending column (e.g. "Tipo"). */
  columna: string;
  mensaje: string;
}

/** A validated contacto ready for the pr6 upsert. */
export interface ContactoImportado {
  /** First-seen spelling, trimmed. */
  nombre: string;
  telefono: string | null;
  /** Normalized (trim + lowercase), deduped, first-seen order. */
  correos: string[];
  esPrincipal: boolean;
}

/** A validated, conflict-free empresa group ready for the pr6 upsert. */
export interface GrupoEmpresaImportado {
  /** Normalized RUC (the registry dedup key). */
  ruc: string;
  razonSocial: string;
  tipo: TipoEmpresa;
  origen: Origen | null;
  proyectoObra: string | null;
  destinoComun: string | null;
  responsable: string | null;
  notas: string | null;
  contactos: ContactoImportado[];
  /** Sheet fila numbers of the rows this group was built from. */
  filas: number[];
}

export interface ResultadoValidacionImport {
  grupos: GrupoEmpresaImportado[];
  errores: ErrorFilaImport[];
  totalFilas: number;
  /** Rows that feed an upserted group: totalFilas − rows named in `errores`. */
  filasValidas: number;
}

/** 8–11 digits after normalization (cobranza RUC_PATTERN precedent: 11-digit RUC or 8-digit DNI). */
const PATRON_RUC = /^\d{8,11}$/;

/** The template header occupies sheet row 1; data starts at fila 2. */
const PRIMERA_FILA_EXCEL = 2;

/** empresa-level claves — the columns the conflict rule compares. */
const CLAVES_EMPRESA = [
  'empresa',
  'tipo',
  'origen',
  'proyectoObra',
  'destinoComun',
  'responsable',
  'notas',
] as const satisfies readonly (keyof FilaImportCrm)[];

/** clave → Excel header, derived from the ONE shared column constant. */
const ENCABEZADOS = new Map(COLUMNAS_IMPORT_CRM.map((c) => [c.clave, c.encabezado]));

/** RUC/DNI values use literal option strings shared with the CHECK constraints. */
const VALORES_TIPO: readonly string[] = ['Cliente', 'Prospecto'];
const VALORES_ORIGEN: readonly string[] = ['Inbound', 'Outbound'];

interface FilaValida {
  fila: number;
  raw: FilaImportCrm;
}

function errorFila(fila: number, clave: string, mensaje: string): ErrorFilaImport {
  return { fila, columna: ENCABEZADOS.get(clave) ?? clave, mensaje };
}

const opcional = (valor: string): string | null => {
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
};

/** Split the ";"-separated cell into normalized deduped correos (order-preserving). */
function partirCorreos(crudo: string): string[] {
  const vistos = new Set<string>();
  for (const parte of crudo.split(';')) {
    const correo = normalizarCorreo(parte);
    if (correo !== '') vistos.add(correo);
  }
  return [...vistos];
}

/** Per-row rules, collected in column order — one bad cell never hides the rest. */
function validarFila(fila: number, f: FilaImportCrm): ErrorFilaImport[] {
  const errores: ErrorFilaImport[] = [];

  if (f.empresa.trim() === '') {
    errores.push(errorFila(fila, 'empresa', '"Empresa" es obligatorio'));
  }

  if (f.ruc.trim() === '') {
    errores.push(errorFila(fila, 'ruc', '"RUC" es obligatorio'));
  } else if (!PATRON_RUC.test(normalizarRuc(f.ruc))) {
    errores.push(
      errorFila(fila, 'ruc', '"RUC" inválido: debe tener entre 8 y 11 dígitos (solo números)'),
    );
  }

  if (f.tipo.trim() === '') {
    errores.push(errorFila(fila, 'tipo', '"Tipo" es obligatorio'));
  } else if (!VALORES_TIPO.includes(f.tipo.trim())) {
    errores.push(errorFila(fila, 'tipo', '"Tipo" debe ser "Cliente" o "Prospecto"'));
  }

  if (f.origen.trim() !== '' && !VALORES_ORIGEN.includes(f.origen.trim())) {
    errores.push(errorFila(fila, 'origen', '"Origen" debe ser "Inbound" o "Outbound"'));
  }

  if (f.encargado.trim() === '') {
    errores.push(errorFila(fila, 'encargado', '"Encargado" es obligatorio'));
  }

  if (partirCorreos(f.correos).length === 0) {
    errores.push(
      errorFila(
        fila,
        'correos',
        '"Correos" es obligatorio: indique al menos un correo (separe varios con ";")',
      ),
    );
  }

  if (f.principal.trim() !== '' && f.principal.trim() !== 'Sí') {
    errores.push(errorFila(fila, 'principal', '"Principal" solo admite el valor "Sí" (vacío = sin marcar)'));
  }

  return errores;
}

/** Comparison key of the empresa-level cells of a row (trimmed values). */
function claveValoresEmpresa(f: FilaImportCrm): string {
  return JSON.stringify(CLAVES_EMPRESA.map((clave) => f[clave].trim()));
}

/** First empresa-level column holding more than one distinct value in the group. */
function primeraColumnaConDesacuerdo(
  filas: readonly FilaValida[],
): { clave: keyof FilaImportCrm; valores: [string, string] } | null {
  for (const clave of CLAVES_EMPRESA) {
    const valores = new Set<string>();
    for (const fv of filas) valores.add(fv.raw[clave].trim());
    if (valores.size > 1) {
      const [a, b] = valores;
      return { clave, valores: [a ?? '', b ?? ''] };
    }
  }
  return null;
}

function mensajeConflicto(clave: string, valorA: string, valorB: string): string {
  const columna = ENCABEZADOS.get(clave) ?? clave;
  return `"${columna}" tiene valores distintos para el mismo RUC ("${valorA}" y "${valorB}")`;
}

/** Collapse rows sharing a normalized encargado into one contacto (design D1). */
function colapsarContactos(filas: readonly FilaValida[]): ContactoImportado[] {
  interface Parcial {
    nombre: string;
    telefono: string | null;
    correos: string[];
    marcadaPrincipal: boolean;
  }

  const porNombre = new Map<string, Parcial>();
  for (const fv of filas) {
    const llave = normalizarNombre(fv.raw.encargado);
    const correosFila = partirCorreos(fv.raw.correos);
    const telefonoFila = opcional(fv.raw.telefono);
    const marcada = fv.raw.principal.trim() === 'Sí';
    const existente = porNombre.get(llave);
    if (!existente) {
      porNombre.set(llave, {
        nombre: fv.raw.encargado.trim().replace(/\s+/g, ' '),
        telefono: telefonoFila,
        correos: [...correosFila],
        marcadaPrincipal: marcada,
      });
      continue;
    }
    for (const correo of correosFila) {
      if (!existente.correos.includes(correo)) existente.correos.push(correo);
    }
    if (existente.telefono === null && telefonoFila !== null) existente.telefono = telefonoFila;
    if (marcada) existente.marcadaPrincipal = true;
  }

  const parciales = [...porNombre.values()];
  const indiceMarcada = parciales.findIndex((p) => p.marcadaPrincipal);
  const indicePrincipal = indiceMarcada >= 0 ? indiceMarcada : 0;
  return parciales.map((p, indice) => ({
    nombre: p.nombre,
    telefono: p.telefono,
    correos: p.correos,
    esPrincipal: indice === indicePrincipal,
  }));
}

/**
 * Validate, group and resolve conflicts for a whole parsed file.
 * See the module JSDoc for the full contract.
 */
export function validarImportacion(
  filas: readonly FilaImportCrm[],
): ResultadoValidacionImport {
  const errores: ErrorFilaImport[] = [];
  let filasValidas = 0;
  let totalFilas = 0;

  // RUC (normalized) → its valid rows, in first-appearance order.
  const gruposPorRuc = new Map<string, FilaValida[]>();

  for (const [indice, raw] of filas.entries()) {
    totalFilas += 1;
    const fila = indice + PRIMERA_FILA_EXCEL;
    const erroresFila = validarFila(fila, raw);
    if (erroresFila.length > 0) {
      errores.push(...erroresFila);
      continue;
    }
    const ruc = normalizarRuc(raw.ruc);
    const grupo = gruposPorRuc.get(ruc);
    if (grupo) grupo.push({ fila, raw });
    else gruposPorRuc.set(ruc, [{ fila, raw }]);
  }

  const grupos: GrupoEmpresaImportado[] = [];

  for (const [ruc, filasDelGrupo] of gruposPorRuc) {
    const conteos = new Map<string, number>();
    for (const fv of filasDelGrupo) {
      const clave = claveValoresEmpresa(fv.raw);
      conteos.set(clave, (conteos.get(clave) ?? 0) + 1);
    }
    const maximo = Math.max(...conteos.values());
    const clavesGanadoras = [...conteos.entries()]
      .filter(([, n]) => n === maximo)
      .map(([clave]) => clave);

    if (clavesGanadoras.length > 1) {
      // Tie: no trustworthy reference — the WHOLE group is skipped.
      const desacuerdo = primeraColumnaConDesacuerdo(filasDelGrupo);
      if (desacuerdo) {
        const mensaje = mensajeConflicto(desacuerdo.clave, desacuerdo.valores[0]!, desacuerdo.valores[1]!);
        for (const fv of filasDelGrupo) errores.push({ fila: fv.fila, columna: ENCABEZADOS.get(desacuerdo.clave) ?? desacuerdo.clave, mensaje });
      }
      continue;
    }

    const claveGanadora = clavesGanadoras[0] ?? '';
    const ganador = filasDelGrupo.find((fv) => claveValoresEmpresa(fv.raw) === claveGanadora);
    if (!ganador) continue; // unreachable: the winning key comes from these rows

    const consistentes = filasDelGrupo.filter((fv) => {
      if (claveValoresEmpresa(fv.raw) === claveGanadora) return true;
      const claveDifi = CLAVES_EMPRESA.find(
        (clave) => fv.raw[clave].trim() !== ganador.raw[clave].trim(),
      );
      if (claveDifi) {
        errores.push({
          fila: fv.fila,
          columna: ENCABEZADOS.get(claveDifi) ?? claveDifi,
          mensaje: mensajeConflicto(claveDifi, fv.raw[claveDifi].trim(), ganador.raw[claveDifi].trim()),
        });
      }
      return false;
    });
    if (consistentes.length === 0) continue; // unreachable: the winner is consistent by definition

    const g = ganador.raw;
    grupos.push({
      ruc,
      razonSocial: g.empresa.trim(),
      tipo: g.tipo.trim() as TipoEmpresa,
      origen: opcional(g.origen) as Origen | null,
      proyectoObra: opcional(g.proyectoObra),
      destinoComun: opcional(g.destinoComun),
      responsable: opcional(g.responsable),
      notas: opcional(g.notas),
      contactos: colapsarContactos(consistentes),
      filas: consistentes.map((fv) => fv.fila),
    });
    filasValidas += consistentes.length;
  }

  errores.sort((a, b) => a.fila - b.fila);

  return { grupos, errores, totalFilas, filasValidas };
}
