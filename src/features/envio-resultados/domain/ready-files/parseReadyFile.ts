const READY_FILE_PATTERN = /^(\d+)(CERT|EXPED)\.pdf$/i;

/**
 * Domain union for ready-to-send file types.
 *
 * `'ADICIONAL'` is part of the union (ADICIONALES orders) but is NEVER
 * inferred from a file suffix here — `parseReadyFile` only maps the
 * `CERT`/`EXPED` suffix to CAMO/EMO. `'ADICIONAL'` arrives exclusively
 * through an explicit `tipoExamen` signal normalized at the boundary.
 */
export type ReadyFileTipo = 'CAMO' | 'EMO' | 'ADICIONAL';

export interface ParsedReadyFile {
  tipo: ReadyFileTipo;
  idAten: string;
}

export function parseReadyFile(name: string): ParsedReadyFile | null {
  const trimmed = name.trim();
  const match = trimmed.match(READY_FILE_PATTERN);
  if (!match) return null;
  const idAten = match[1]!;
  const suffix = match[2]!.toUpperCase();
  const tipo: ReadyFileTipo = suffix === 'CERT' ? 'CAMO' : 'EMO';
  return { tipo, idAten };
}
