import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';

/**
 * POST /api/asistencia/heartbeat — device liveness + clock drift + user
 * bootstrap (REQ-F1-03/09, ADR-1). This path is OUT of RUTAS_PROTEGIDAS:
 * the ZKTeco worker authenticates with its Bearer token like every
 * /api/asistencia/* endpoint. Body is all-optional
 * ({ drift_seg?, usuarios? }); validation is ALL-OR-NOTHING — a
 * malformed body rejects 400 before the device's heartbeat is stamped.
 */
import { POST } from '../route';
import {
  __setAsistenciaDbForTests,
  type AsistenciaDb,
} from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import type {
  IAlertaRepository,
  IDispositivoRepository,
  IEmpleadoRepository,
  IParametroRepository,
} from '@/features/asistencia-rrhh/domain/ports';
import type { Dispositivo } from '@/features/asistencia-rrhh/domain/entities';

const TOKEN = 'tok-dispositivo-01';
const HASH_VALIDO = createHash('sha256').update(TOKEN, 'utf8').digest();
const HORA_SERVIDOR = new Date('2026-09-01T08:30:00');

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

function makeRequest(body: unknown, token?: string): Request {
  return new Request('http://localhost:3000/api/asistencia/heartbeat', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeRequestRaw(raw: string, token: string): Request {
  return new Request('http://localhost:3000/api/asistencia/heartbeat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: raw,
  });
}

describe('POST /api/asistencia/heartbeat', () => {
  let dispositivoActual: Dispositivo;
  let registrarHeartbeat: IDispositivoRepository['registrarHeartbeat'];
  let crearAlerta: IAlertaRepository['crear'];
  let upsertPendientes: IEmpleadoRepository['upsertPendientes'];
  let valorParametro: IParametroRepository['valor'];

  beforeEach(() => {
    dispositivoActual = makeDispositivo();
    registrarHeartbeat = async () => HORA_SERVIDOR;
    crearAlerta = async () => undefined;
    upsertPendientes = async () => 0;
    valorParametro = async (clave: string) => (clave === 'TARDANZA_ALARMA_RELOJ_SEG' ? '60' : null);
  });

  afterEach(() => {
    __setAsistenciaDbForTests(null);
  });

  function injectDb(): void {
    __setAsistenciaDbForTests({
      dispositivos: {
        porTokenHash: async (hash: Buffer) =>
          hash.equals(HASH_VALIDO) ? dispositivoActual : null,
        registrarHeartbeat,
        estados: async () => [],
      },
      empleados: {
        upsertPendientes,
        pendientes: async () => [],
        completar: async () => {
          throw new Error('no aplicable');
        },
      },
      alertas: { crear: crearAlerta, recientes: async () => [] },
      parametros: { valor: valorParametro },
    } as unknown as AsistenciaDb);
  }

  // ---- 401 / 403: device auth (REQ-F1-14) ----

  it('401 without an Authorization header — the heartbeat is NOT stamped', async () => {
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    injectDb();
    const res = await POST(makeRequest({ drift_seg: 10 }));
    expect(res.status).toBe(401);
    expect(registrarHeartbeat).not.toHaveBeenCalled();
  });

  it('401 with an unknown token', async () => {
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    injectDb();
    const res = await POST(makeRequest({ drift_seg: 10 }, 'token-desconocido'));
    expect(res.status).toBe(401);
    expect(registrarHeartbeat).not.toHaveBeenCalled();
  });

  it('403 when the device is registered but inactive — nothing runs', async () => {
    dispositivoActual = makeDispositivo({ activo: false });
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    upsertPendientes = vi.fn(upsertPendientes);
    injectDb();
    const res = await POST(makeRequest({ drift_seg: 10 }, TOKEN));
    expect(res.status).toBe(403);
    expect(registrarHeartbeat).not.toHaveBeenCalled();
    expect(upsertPendientes).not.toHaveBeenCalled();
  });

  // ---- 400: all-or-nothing validation ----

  it('400 on malformed JSON — the heartbeat is NOT stamped', async () => {
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    injectDb();
    const res = await POST(makeRequestRaw('{drift_seg: no-json', TOKEN));
    expect(res.status).toBe(400);
    expect(registrarHeartbeat).not.toHaveBeenCalled();
  });

  it('400 when drift_seg is not a number — nothing is stamped or alerted', async () => {
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    crearAlerta = vi.fn(crearAlerta);
    injectDb();
    const res = await POST(makeRequest({ drift_seg: '75' }, TOKEN));
    expect(res.status).toBe(400);
    expect(registrarHeartbeat).not.toHaveBeenCalled();
    expect(crearAlerta).not.toHaveBeenCalled();
  });

  it('400 when an item of usuarios is malformed — NOTHING is persisted (all-or-nothing)', async () => {
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    upsertPendientes = vi.fn(upsertPendientes);
    injectDb();
    const body = {
      usuarios: [
        { user_id: 'U001', nombre: 'Uno' },
        { user_id: 'U002', nombre: '' },
      ],
    };
    const res = await POST(makeRequest(body, TOKEN));
    expect(res.status).toBe(400);
    expect(registrarHeartbeat).not.toHaveBeenCalled();
    expect(upsertPendientes).not.toHaveBeenCalled();
  });

  it('400 when usuarios is not an array', async () => {
    injectDb();
    const res = await POST(makeRequest({ usuarios: 'todos' }, TOKEN));
    expect(res.status).toBe(400);
  });

  // ---- 200: the happy paths ----

  it('200 plain heartbeat ({}): stamps ultimaSincronizacion and answers hora_servidor', async () => {
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    injectDb();
    const res = await POST(makeRequest({}, TOKEN));
    expect(res.status).toBe(200);
    expect(registrarHeartbeat).toHaveBeenCalledWith(7);
    await expect(res.json()).resolves.toEqual({ hora_servidor: '2026-09-01T08:30:00' });
  });

  it('200 with drift 75 — DRIFT_RELOJ alert raised with the device id + hora_servidor', async () => {
    crearAlerta = vi.fn(crearAlerta);
    injectDb();
    const res = await POST(makeRequest({ drift_seg: 75 }, TOKEN));
    expect(res.status).toBe(200);
    expect(crearAlerta).toHaveBeenCalledWith('DRIFT_RELOJ', expect.stringContaining('75'), 7);
    await expect(res.json()).resolves.toMatchObject({ hora_servidor: '2026-09-01T08:30:00' });
  });

  it('200 with 35 usuarios — ONE upsert with the mapped {userId, nombre} list', async () => {
    upsertPendientes = vi.fn(async () => 35);
    injectDb();
    const usuarios = Array.from({ length: 35 }, (_, i) => ({
      user_id: `U${String(i + 1).padStart(3, '0')}`,
      nombre: `Usuario ${i + 1}`,
    }));
    const res = await POST(makeRequest({ usuarios }, TOKEN));
    expect(res.status).toBe(200);
    expect(upsertPendientes).toHaveBeenCalledTimes(1);
    const recibidos = (upsertPendientes as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(recibidos).toHaveLength(35);
    expect(recibidos[0]).toEqual({ userId: 'U001', nombre: 'Usuario 1' });
    const json = (await res.json()) as { hora_servidor: string };
    expect(json.hora_servidor).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('200 drift + usuarios in ONE payload (ADR-1) — a single heartbeat drives both effects', async () => {
    registrarHeartbeat = vi.fn(registrarHeartbeat);
    crearAlerta = vi.fn(crearAlerta);
    upsertPendientes = vi.fn(async () => 1);
    injectDb();
    const res = await POST(
      makeRequest({ drift_seg: 90, usuarios: [{ user_id: 'U001', nombre: 'Uno' }] }, TOKEN),
    );
    expect(res.status).toBe(200);
    expect(registrarHeartbeat).toHaveBeenCalledTimes(1);
    expect(crearAlerta).toHaveBeenCalledTimes(1);
    expect(upsertPendientes).toHaveBeenCalledTimes(1);
  });
});
