import { createHash } from 'crypto';

import type { Dispositivo } from '../domain/entities';
import type { IDispositivoRepository } from '../domain/ports';

/**
 * Device authentication use case (REQ-F1-14/15) — shared by the three
 * `/api/asistencia/*` endpoints. The Bearer token never touches the
 * database in plaintext: it is hashed with SHA-256 (ADR-7, exactly 32
 * bytes) and matched by byte equality against `dispositivos.apiTokenHash`
 * via the `IDispositivoRepository` port.
 *
 * Result mapping for the routes:
 *  - `ok: true`                    → proceed with the device
 *  - `ok: false, error: NO_AUTH`   → HTTP 401 (absent/malformed header or unknown token)
 *  - `ok: false, error: INACTIVO`  → HTTP 403 (device exists but is disabled)
 */

export type ResultadoAutenticacion =
  | { ok: true; dispositivo: Dispositivo }
  | { ok: false; error: 'NO_AUTH' | 'INACTIVO' };

/** SHA-256 of the raw token as the 32-byte key the adapter stores/compares (ADR-7). */
export function sha256Buffer(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

const BEARER_PREFIX = 'Bearer ';

export class AutenticarDispositivoUseCase {
  constructor(private readonly dispositivos: IDispositivoRepository) {}

  async execute(authHeader: string | null | undefined): Promise<ResultadoAutenticacion> {
    if (typeof authHeader !== 'string' || !authHeader.startsWith(BEARER_PREFIX)) {
      return { ok: false, error: 'NO_AUTH' };
    }
    const token = authHeader.slice(BEARER_PREFIX.length).trim();
    if (token.length === 0) {
      return { ok: false, error: 'NO_AUTH' };
    }

    const dispositivo = await this.dispositivos.porTokenHash(sha256Buffer(token));
    if (!dispositivo) {
      return { ok: false, error: 'NO_AUTH' };
    }
    if (!dispositivo.activo) {
      return { ok: false, error: 'INACTIVO' };
    }
    return { ok: true, dispositivo };
  }
}
