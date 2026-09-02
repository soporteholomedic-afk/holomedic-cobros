import { describe, expect, it, vi } from 'vitest';

/**
 * Device authentication use case (REQ-F1-14/15): the `Authorization:
 * Bearer <token>` header is hashed with SHA-256 (ADR-7 — exactly 32
 * bytes) and compared by byte equality against dispositivos.apiTokenHash.
 * Outcomes: ok with the device, NO_AUTH (missing/malformed header or
 * unknown token → HTTP 401) or INACTIVO (device disabled → HTTP 403).
 * The raw token is never persisted and never leaves this use case.
 */
import { AutenticarDispositivoUseCase, sha256Buffer } from '../autenticarDispositivo';
import type { IDispositivoRepository } from '../../domain/ports';
import type { Dispositivo } from '../../domain/entities';

const TOKEN_VALIDO = 'device-token-4f7b21';

function makeDispositivo(overrides: Partial<Dispositivo> = {}): Dispositivo {
  return {
    id: 3,
    codigo: 'K20-SEDE-01',
    sede: 'Sede Central',
    ip: '192.168.10.44',
    activo: true,
    ultimaSincronizacion: null,
    createdAt: new Date('2026-09-01T08:00:00'),
    updatedAt: new Date('2026-09-01T08:00:00'),
    ...overrides,
  };
}

/**
 * Fake repository modeling the DB: it knows the hash of the valid
 * device's token and resolves only on byte equality (the adapter's
 * VARBINARY(32) equality contract).
 */
function makeRepo(dispositivo: Dispositivo | null) {
  const hashesConsultados: Buffer[] = [];
  const hashValido = sha256Buffer(TOKEN_VALIDO);
  const repo: IDispositivoRepository = {
    porTokenHash: async (hash: Buffer) => {
      hashesConsultados.push(hash);
      return hash.equals(hashValido) ? dispositivo : null;
    },
    registrarHeartbeat: vi.fn(),
    estados: vi.fn(),
  };
  return { repo, hashesConsultados, hashValido };
}

describe('AutenticarDispositivoUseCase', () => {
  it('NO_AUTH when the header is absent — the repository is never queried', async () => {
    const { repo, hashesConsultados } = makeRepo(makeDispositivo());
    const resultado = await new AutenticarDispositivoUseCase(repo).execute(null);
    expect(resultado).toEqual({ ok: false, error: 'NO_AUTH' });
    expect(hashesConsultados).toHaveLength(0);
  });

  it('NO_AUTH when the header lacks the Bearer scheme', async () => {
    const { repo } = makeRepo(makeDispositivo());
    const resultado = await new AutenticarDispositivoUseCase(repo).execute(`Basic ${TOKEN_VALIDO}`);
    expect(resultado).toEqual({ ok: false, error: 'NO_AUTH' });
  });

  it('NO_AUTH when the Bearer credentials are empty', async () => {
    const { repo, hashesConsultados } = makeRepo(makeDispositivo());
    const resultado = await new AutenticarDispositivoUseCase(repo).execute('Bearer ');
    expect(resultado).toEqual({ ok: false, error: 'NO_AUTH' });
    expect(hashesConsultados).toHaveLength(0);
  });

  it('hashes the token with SHA-256 (ADR-7: exactly 32 bytes) before the lookup', async () => {
    const { repo, hashesConsultados, hashValido } = makeRepo(null);
    await new AutenticarDispositivoUseCase(repo).execute(`Bearer ${TOKEN_VALIDO}`);
    expect(hashesConsultados).toHaveLength(1);
    const consultado = hashesConsultados[0] ?? Buffer.alloc(0);
    expect(consultado).toHaveLength(32);
    expect(consultado.equals(hashValido)).toBe(true);
    expect(consultado.equals(Buffer.from(TOKEN_VALIDO))).toBe(false);
  });

  it('NO_AUTH when no device owns the token (unknown hash)', async () => {
    const { repo } = makeRepo(null);
    const resultado = await new AutenticarDispositivoUseCase(repo).execute('Bearer token-ajeno');
    expect(resultado).toEqual({ ok: false, error: 'NO_AUTH' });
  });

  it('authenticates a valid token on an active device', async () => {
    const dispositivo = makeDispositivo();
    const { repo } = makeRepo(dispositivo);
    const resultado = await new AutenticarDispositivoUseCase(repo).execute(
      `Bearer ${TOKEN_VALIDO}`,
    );
    expect(resultado).toEqual({ ok: true, dispositivo });
  });

  it('INACTIVO when the device exists but is disabled (403, not 401)', async () => {
    const { repo } = makeRepo(makeDispositivo({ activo: false }));
    const resultado = await new AutenticarDispositivoUseCase(repo).execute(
      `Bearer ${TOKEN_VALIDO}`,
    );
    expect(resultado).toEqual({ ok: false, error: 'INACTIVO' });
  });
});
