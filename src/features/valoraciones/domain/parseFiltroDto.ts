import type { ValoracionesFilter } from './entities';

/**
 * Parse + validate a `ValoracionesFilter` JSON body (design D4: the PDF/
 * Excel/Send exports re-query from the posted filter DTO). Pure — returns
 * a Spanish, user-safe error string; routes wrap it in their own 400
 * responses.
 *
 * Rules mirror `GET /api/valoraciones/sigla`: `fecIni`/`fecFin` required
 * `YYYY-MM-DD` with `fecIni <= fecFin`; `codMon` 1|2; `indFac` tri-state
 * default 0 (No Facturados); `inFsta` boolean; optional integer ids absent
 * or `<= 0` become undefined (NULL binds downstream).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ParseFiltroResult {
  filtro?: ValoracionesFilter;
  error?: string;
}

const EMPRESA_MAX_LONGITUD = 200;

/**
 * U6 per-empresa export scoping: optional `empresa` field (the EmpresaList
 * group key — `NomCFa` falling back to `NomCli`). Absent/null means the
 * global export; present values must be a trimmed non-empty string of at
 * most 200 characters.
 */
export function parseEmpresaField(raw: unknown): { empresa?: string; error?: string } {
  if (raw === undefined || raw === null) return { empresa: undefined };
  if (typeof raw !== 'string') {
    return { error: '"empresa" debe ser una cadena de texto' };
  }
  const empresa = raw.trim();
  if (empresa === '') {
    return { error: '"empresa" no puede estar vacío' };
  }
  if (empresa.length > EMPRESA_MAX_LONGITUD) {
    return { error: `"empresa" no puede superar ${EMPRESA_MAX_LONGITUD} caracteres` };
  }
  return { empresa };
}

/**
 * Parse + validate an export body (U6): the `ValoracionesFilter` JSON plus
 * the optional `empresa` scoping field, validated with the same rules as
 * `parseFiltroDto`. The filter error (when present) wins so route 400s stay
 * consistent with the pre-U6 contract.
 */
export function parseExportFiltroDto(body: unknown): ParseFiltroResult & { empresa?: string } {
  const { filtro, error } = parseFiltroDto(body);
  if (error || !filtro) return { error };
  const scoped = parseEmpresaField((body as Record<string, unknown>).empresa);
  if (scoped.error) return { error: scoped.error };
  return { filtro, ...(scoped.empresa !== undefined ? { empresa: scoped.empresa } : {}) };
}

export function parseFiltroDto(body: unknown): ParseFiltroResult {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Cuerpo de la solicitud inválido' };
  }
  const raw = body as Record<string, unknown>;

  const fecIni = typeof raw.fecIni === 'string' ? raw.fecIni : '';
  const fecFin = typeof raw.fecFin === 'string' ? raw.fecFin : '';
  if (!DATE_PATTERN.test(fecIni) || !DATE_PATTERN.test(fecFin) || fecIni > fecFin) {
    return {
      error: '"fecIni" y "fecFin" son obligatorios (YYYY-MM-DD) y fecIni no puede ser posterior a fecFin',
    };
  }

  if (raw.codMon !== 1 && raw.codMon !== 2) {
    return { error: '"codMon" es obligatorio y debe ser 1 (SOLES) o 2 (DOLARES)' };
  }

  let indFac: 0 | 1 | null = 0;
  if (raw.indFac !== undefined) {
    if (raw.indFac === 0 || raw.indFac === 1 || raw.indFac === null) {
      indFac = raw.indFac;
    } else {
      return { error: '"indFac" debe ser 0, 1 o null' };
    }
  }

  if (raw.inFsta !== undefined && typeof raw.inFsta !== 'boolean') {
    return { error: '"inFsta" debe ser true o false' };
  }

  const idOpcional = (nombre: string): number | undefined => {
    const valor = raw[nombre];
    if (valor === undefined || valor === null) return undefined;
    return typeof valor === 'number' && Number.isInteger(valor) && valor > 0
      ? valor
      : undefined;
  };

  return {
    filtro: {
      fecIni,
      fecFin,
      codMon: raw.codMon,
      indFac,
      inFsta: raw.inFsta === true,
      codCli: idOpcional('codCli'),
      codCfa: idOpcional('codCfa'),
      codDes: idOpcional('codDes'),
      codPac: idOpcional('codPac'),
      codSed: idOpcional('codSed'),
      tipTra: idOpcional('tipTra'),
    },
  };
}
