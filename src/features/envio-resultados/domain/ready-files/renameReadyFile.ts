import { sanitizeComponent } from '@/lib/sanitize-filename';
import { parseReadyFile } from './parseReadyFile';

export interface RenameReadyFileInput {
  rawName: string;
  nombreCompleto: string;
  destino: string;
  emptyDestinoFallback?: string;
}

const EMPTY_DESTINO = 'SIN_DESTINO';

export function renameReadyFile(input: RenameReadyFileInput): string {
  const { rawName, nombreCompleto, destino, emptyDestinoFallback = EMPTY_DESTINO } = input;

  const parsed = parseReadyFile(rawName);
  if (!parsed) return rawName;

  if (!nombreCompleto.trim()) return rawName;

  const effectiveDestino = destino.trim() || emptyDestinoFallback;
  const parts = [parsed.tipo, nombreCompleto.trim(), effectiveDestino]
    .map(sanitizeComponent)
    .filter((p) => p.length > 0);

  const base = parts.join('_');
  const ext = '.pdf';

  return base + ext;
}
