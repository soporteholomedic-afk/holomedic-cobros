import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';

/**
 * POST /api/asistencia/comandos/[id]/confirmar — the worker
 * acknowledges an applied command (REQ-F1-04). Bearer-authenticated
 * like every /api/asistencia/* endpoint (OUT of RUTAS_PROTEGIDAS).
 * Outcomes: 200 {ok, estado, confirmadoAt} (a re-confirm of an already
 * terminal command is a 200 no-op echoing the ORIGINAL confirmadoAt),
 * 404 for an unknown id, 403 for another device's command.
 */
import { POST } from '../route';
import {
  __setAsistenciaDbForTests,
  type AsistenciaDb,
} from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import type { IComandoRepository, ResultadoConfirmacion } from '@/features/asistencia-rrhh/domain/ports';
import type { Dispositivo } from '@/features/asistencia-rrhh/domain/entities';

const TOKEN = 'tok-dispositivo-01';
const HASH_VALIDO = createHash('sha256').update(TOKEN, 'utf8').digest();

function makeDispositivo(overrides: Partial<Dispositivo> = {}): Dispositivo {
  return {
    id: 7,
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

function makeRequest(token?: string): Request {
  return new Request('http://localhost:3000/api/asistencia/comandos/21/confirmar', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/asistencia/comandos/[id]/confirmar', () => {
  let dispositivoActual: Dispositivo;
  let confirmar: IComandoRepository['confirmar'];

  beforeEach(() => {
    dispositivoActual = makeDispositivo();
    confirmar = async (): Promise<ResultadoConfirmacion> => ({
      estado: 'CONFIRMADO',
      confirmadoAt: new Date('2026-09-01T08:05:00'),
    });
  });

  afterEach(() => {
    __setAsistenciaDbForTests(null);
  });

  function injectDb(): void {
    __setAsistenciaDbForTests({
      dispositivos: {
        porTokenHash: async (hash: Buffer) =>
          hash.equals(HASH_VALIDO) ? dispositivoActual : null,
        registrarHeartbeat: async () => new Date(),
        estados: async () => [],
      },
      comandos: { pendientesYMarcarEnviados: async () => [], confirmar },
    } as unknown as AsistenciaDb);
  }

  // ---- 401 / 403: device auth (REQ-F1-14) ----

  it('401 without an Authorization header — the command is NOT touched', async () => {
    confirmar = vi.fn(confirmar);
    injectDb();
    const res = await POST(makeRequest(), makeParams('21'));
    expect(res.status).toBe(401);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('401 with an unknown token', async () => {
    confirmar = vi.fn(confirmar);
    injectDb();
    const res = await POST(makeRequest('token-desconocido'), makeParams('21'));
    expect(res.status).toBe(401);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('403 when the device is registered but inactive', async () => {
    dispositivoActual = makeDispositivo({ activo: false });
    confirmar = vi.fn(confirmar);
    injectDb();
    const res = await POST(makeRequest(TOKEN), makeParams('21'));
    expect(res.status).toBe(403);
    expect(confirmar).not.toHaveBeenCalled();
  });

  // ---- 400: route param validation ----

  it('400 when the path id is not a positive integer — the port is never called', async () => {
    confirmar = vi.fn(confirmar);
    injectDb();
    for (const id of ['abc', '1.5', '-1', '']) {
      const res = await POST(makeRequest(TOKEN), makeParams(id));
      expect(res.status).toBe(400);
    }
    expect(confirmar).not.toHaveBeenCalled();
  });

  // ---- 200 / 404 / 403: the port outcome mapping ----

  it('200 CONFIRMADO: ok + estado + confirmadoAt, delegating (21, 7)', async () => {
    confirmar = vi.fn(confirmar);
    injectDb();
    const res = await POST(makeRequest(TOKEN), makeParams('21'));
    expect(res.status).toBe(200);
    expect(confirmar).toHaveBeenCalledWith(21, 7);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      estado: 'CONFIRMADO',
      confirmadoAt: '2026-09-01T08:05:00',
    });
  });

  it('404 when the command does not exist', async () => {
    confirmar = vi.fn(async (): Promise<ResultadoConfirmacion> => ({ estado: 'NO_EXISTE' }));
    injectDb();
    const res = await POST(makeRequest(TOKEN), makeParams('999'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  it('403 when the command belongs to another device', async () => {
    confirmar = vi.fn(async (): Promise<ResultadoConfirmacion> => ({ estado: 'AJENO' }));
    injectDb();
    const res = await POST(makeRequest(TOKEN), makeParams('21'));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  it('200 no-op on re-confirm: the ORIGINAL confirmadoAt is echoed untouched', async () => {
    confirmar = vi.fn(async (): Promise<ResultadoConfirmacion> => ({
      estado: 'CONFIRMADO',
      confirmadoAt: new Date('2026-09-01T08:01:00'),
    }));
    injectDb();
    const res = await POST(makeRequest(TOKEN), makeParams('21'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      estado: 'CONFIRMADO',
      confirmadoAt: '2026-09-01T08:01:00',
    });
  });
});
