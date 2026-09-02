import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';

/**
 * POST /api/asistencia/marcaciones — the device ingestion endpoint
 * (REQ-F1-01/02/14). Auth model: Bearer token per device (resolved via
 * the seam-injected container) — the proxy does NOT gate this path
 * (routes.asistencia.test.ts guard). Body validation is ALL-OR-NOTHING:
 * any malformed item (or a batch over the 500 cap, or invalid JSON)
 * rejects with 400 before a single row is inserted.
 */
import { POST } from '../route';
import {
  __setAsistenciaDbForTests,
  type AsistenciaDb,
} from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import type {
  IAlertaRepository,
  IComandoRepository,
  IMarcacionRepository,
} from '@/features/asistencia-rrhh/domain/ports';
import type { Comando, Dispositivo } from '@/features/asistencia-rrhh/domain/entities';

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

function makeComando(overrides: Partial<Comando> = {}): Comando {
  return {
    id: 21,
    dispositivoId: 7,
    tipo: 'SET_TIME',
    payload: '{"drift_seg":75}',
    estado: 'ENVIADO',
    createdAt: new Date('2026-09-01T08:00:00'),
    enviadoAt: new Date('2026-09-01T08:01:00'),
    confirmadoAt: null,
    ...overrides,
  };
}

function marcacion(user_id: string, punch: number) {
  return { user_id, fecha_hora: '2026-09-01T08:15:00', punch, tipo_verificacion: 'HUELLA' };
}

function bodyValido(cantidad: number, overrides: Record<number, object> = {}): object {
  const items = Array.from({ length: cantidad }, (_, i) => {
    const base = marcacion('U001', i + 1);
    return { ...base, ...overrides[i] };
  });
  return { codigo_dispositivo: 'K20-SEDE-01', marcaciones: items };
}

function makeRequest(body: string | object, token?: string): Request {
  const esTexto = typeof body === 'string';
  return new Request('http://localhost:3000/api/asistencia/marcaciones', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(esTexto ? {} : { 'Content-Type': 'application/json' }),
    },
    body: esTexto ? body : JSON.stringify(body),
  });
}

describe('POST /api/asistencia/marcaciones', () => {
  let dispositivoActual: Dispositivo;
  let insertarLote: IMarcacionRepository['insertarLote'];
  let crearAlerta: IAlertaRepository['crear'];
  let pendientes: IComandoRepository['pendientesYMarcarEnviados'];

  beforeEach(() => {
    dispositivoActual = makeDispositivo();
    insertarLote = async () => ({ insertados: 0, userIdsDesconocidos: [] });
    crearAlerta = async () => undefined;
    pendientes = async () => [];
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
      marcaciones: { insertarLote },
      alertas: { crear: crearAlerta, recientes: async () => [] },
      comandos: { pendientesYMarcarEnviados: pendientes, confirmar: async () => 'CONFIRMADO' },
    } as unknown as AsistenciaDb);
  }

  // ---- 401 / 403: device auth (REQ-F1-14) ----

  it('401 without an Authorization header — nothing is authenticated or inserted', async () => {
    const porTokenHash = vi.fn(async () => dispositivoActual);
    insertarLote = vi.fn(insertarLote);
    __setAsistenciaDbForTests({
      dispositivos: { porTokenHash },
    } as unknown as AsistenciaDb);
    const res = await POST(makeRequest(bodyValido(1)));
    expect(res.status).toBe(401);
    expect(porTokenHash).not.toHaveBeenCalled();
    expect(insertarLote).not.toHaveBeenCalled();
  });

  it('401 with an unknown token', async () => {
    insertarLote = vi.fn(insertarLote);
    injectDb();
    const res = await POST(makeRequest(bodyValido(1), 'token-desconocido'));
    expect(res.status).toBe(401);
    expect(insertarLote).not.toHaveBeenCalled();
  });

  it('403 when the device is registered but inactive', async () => {
    dispositivoActual = makeDispositivo({ activo: false });
    insertarLote = vi.fn(insertarLote);
    injectDb();
    const res = await POST(makeRequest(bodyValido(1), TOKEN));
    expect(res.status).toBe(403);
    expect(insertarLote).not.toHaveBeenCalled();
  });

  // ---- 400: all-or-nothing validation ----

  it('400 on malformed JSON — nothing is inserted', async () => {
    insertarLote = vi.fn(insertarLote);
    injectDb();
    const res = await POST(makeRequest('{codigo_dispositivo: no-json', TOKEN));
    expect(res.status).toBe(400);
    expect(insertarLote).not.toHaveBeenCalled();
  });

  it('400 on a 501-item batch — over the cap, NOTHING is inserted', async () => {
    insertarLote = vi.fn(insertarLote);
    injectDb();
    const res = await POST(makeRequest(bodyValido(501), TOKEN));
    expect(res.status).toBe(400);
    expect(insertarLote).not.toHaveBeenCalled();
  });

  it('400 when one item is malformed (all-or-nothing: valid items are NOT inserted either)', async () => {
    insertarLote = vi.fn(insertarLote);
    crearAlerta = vi.fn(crearAlerta);
    injectDb();
    const body = bodyValido(3, { 2: { tipo_verificacion: 'PALMADA' } });
    const res = await POST(makeRequest(body, TOKEN));
    expect(res.status).toBe(400);
    expect(insertarLote).not.toHaveBeenCalled();
    expect(crearAlerta).not.toHaveBeenCalled();
  });

  it('400 when marcaciones is not an array', async () => {
    insertarLote = vi.fn(insertarLote);
    injectDb();
    const res = await POST(
      makeRequest({ codigo_dispositivo: 'K20-SEDE-01', marcaciones: 'una-sola' }, TOKEN),
    );
    expect(res.status).toBe(400);
    expect(insertarLote).not.toHaveBeenCalled();
  });

  it('400 when codigo_dispositivo is missing', async () => {
    injectDb();
    const res = await POST(makeRequest({ marcaciones: [marcacion('U001', 1)] }, TOKEN));
    expect(res.status).toBe(400);
  });

  // ---- 200: the happy path ----

  it('200 on a valid batch — inserts with the device id and reports the counters', async () => {
    const items = [marcacion('U001', 1), marcacion('U001', 2), marcacion('U002', 3)];
    insertarLote = vi.fn(async () => ({ insertados: 3, userIdsDesconocidos: [] }));
    pendientes = vi.fn(async () => []);
    injectDb();
    const res = await POST(
      makeRequest({ codigo_dispositivo: 'K20-SEDE-01', marcaciones: items }, TOKEN),
    );
    expect(res.status).toBe(200);
    expect(insertarLote).toHaveBeenCalledWith(7, items);
    await expect(res.json()).resolves.toEqual({
      recibidos: 3,
      insertados: 3,
      duplicados: 0,
      comandos: [],
    });
  });

  it('200 counts duplicates from the repository result (idempotent re-send)', async () => {
    insertarLote = vi.fn(async () => ({ insertados: 5, userIdsDesconocidos: [] }));
    injectDb();
    const res = await POST(makeRequest(bodyValido(7), TOKEN));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      recibidos: 7,
      insertados: 5,
      duplicados: 2,
    });
  });

  it('200 raises USER_ID_DESCONOCIDO through the use case and delivers claimed commands in wire shape', async () => {
    crearAlerta = vi.fn(crearAlerta);
    insertarLote = vi.fn(async () => ({ insertados: 1, userIdsDesconocidos: ['U404'] }));
    pendientes = vi.fn(async () => [makeComando()]);
    injectDb();
    const res = await POST(makeRequest(bodyValido(1), TOKEN));
    expect(res.status).toBe(200);
    expect(crearAlerta).toHaveBeenCalledWith(
      'USER_ID_DESCONOCIDO',
      expect.stringContaining('U404'),
      7,
    );
    expect(pendientes).toHaveBeenCalledWith(7);
    const json = (await res.json()) as { comandos: unknown[] };
    expect(json.comandos).toEqual([{ id: 21, tipo: 'SET_TIME', payload: '{"drift_seg":75}' }]);
  });
});
