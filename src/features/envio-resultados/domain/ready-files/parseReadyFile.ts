const READY_FILE_PATTERN = /^(\d+)(CERT|EXPED)\.pdf$/i;

export type ReadyFileTipo = 'CAMO' | 'EMO';

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
