// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditoriaConfigCrm, EntradaConfigCrm } from '@/features/crm/domain/entities';
import type {
  ConfigCrmRepository,
  GuardarConfigInput,
  ListarAuditoriaConfigInput,
} from '@/features/crm/domain/ports';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';

/**
 * Route contract for /api/crm/configuracion/{agente,agente/kill-switch,
 * auditoria} (agente-ia-crm E5·T4 — permiso `crm_configuracion`).
 * Use cases are the REAL ones; only the ConfigCrmRepository port is a
 * fake (ingestas route precedent).
 */

const mocks = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

import { GET as getAgente, PUT as putAgente } from '../agente/route';
import { PUT as putKillSwitch } from '../agente/kill-switch/route';
import { GET as getAuditoria } from '../auditoria/route';

class FakeConfig implements ConfigCrmRepository {
  filas = new Map<string, EntradaConfigCrm>();
  guardados: GuardarConfigInput[] = [];
  auditoria: AuditoriaConfigCrm[] = [];
  limitePedido: number | undefined;
  falloEnGuardar: Error | null = null;

  async obtener(clave: string): Promise<EntradaConfigCrm | null> {
    return this.filas.get(clave) ?? null;
  }

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    return [...this.filas.values()].filter((fila) => fila.clave.startsWith(prefijo));
  }

  async guardar(input: GuardarConfigInput): Promise<void> {
    if (this.falloEnGuardar) throw this.falloEnGuardar;
    this.guardados.push({ ...input });
    this.filas.set(input.clave, {
      clave: input.clave,
      valor: input.valor,
      esSecreto: input.esSecreto,
      actualizadoPor: input.usuario,
      actualizadoEn: new Date('2026-10-17T10:00:00.000Z'),
    });
    this.auditoria.unshift({
      id: this.auditoria.length + 1,
      clave: input.clave,
      usuario: input.usuario,
      valorAnterior: null,
      valorNuevo: input.valor,
      esSecreto: input.esSecreto,
      creadoEn: new Date('2026-10-17T10:00:00.000Z'),
    });
  }

  async eliminar(): Promise<void> {}

  async listarAuditoria(input?: ListarAuditoriaConfigInput): Promise<AuditoriaConfigCrm[]> {
    this.limitePedido = input?.limite;
    return this.auditoria.slice(0, input?.limite ?? 50);
  }
}

function setDb(config: ConfigCrmRepository | undefined): void {
  __setCrmDbForTests({
    pool: {} as CrmDb['pool'],
    ...(config ? { config } : {}),
  } as unknown as CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'sistemas' };

function put(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const URL_AGENTE = 'http://localhost/api/crm/configuracion/agente';
const URL_KILL = 'http://localhost/api/crm/configuracion/agente/kill-switch';
const URL_AUDITORIA = 'http://localhost/api/crm/configuracion/auditoria';

let config: FakeConfig;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_configuracion'] });
  config = new FakeConfig();
  setDb(config);
});

afterEach(() => {
  __setCrmDbForTests(null);
  vi.unstubAllEnvs();
});

describe('GET /api/crm/configuracion/agente', () => {
  it('401 without session, 403 without permiso, 503 without config repo', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await getAgente()).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await getAgente()).status).toBe(403);

    setDb(undefined);
    const sinRepo = await getAgente();
    expect(sinRepo.status).toBe(503);
    expect(await sinRepo.json()).toMatchObject({ success: false });
  });

  it('200 resolved config with the effective source per key, no-store', async () => {
    vi.stubEnv('AGENTE_MAX_INTERCAMBIOS', '5');
    vi.stubEnv('AGENTE_UMBRAL_CONF', '');
    await config.guardar({
      clave: 'agente.umbralConfianza',
      valor: '0.8',
      esSecreto: false,
      usuario: 'seed',
    });

    const response = await getAgente();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.config.umbralConfianza).toBe(0.8);
    expect(body.config.maxIntercambios).toBe(5);
    expect(body.fuentes.umbralConfianza).toBe('db');
    expect(body.fuentes.maxIntercambios).toBe('env');
    expect(body.fuentes.horarioDesde).toBe('default');
  });
});

describe('PUT /api/crm/configuracion/agente', () => {
  it('401 without session and 403 without permiso', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await putAgente(put(URL_AGENTE, { habilitado: true }))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await putAgente(put(URL_AGENTE, { habilitado: true }))).status).toBe(403);
    expect(config.guardados).toEqual([]);
  });

  it('400 {error, campo} on an invalid field and nothing is written', async () => {
    const response = await putAgente(put(URL_AGENTE, { maxIntercambios: 4, umbralConfianza: 3 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.campo).toBe('umbralConfianza');
    expect(typeof body.error).toBe('string');
    expect(config.guardados).toEqual([]);
  });

  it('400 on malformed JSON, unknown keys, non-object and empty bodies', async () => {
    expect((await putAgente(put(URL_AGENTE, '{no'))).status).toBe(400);
    expect((await putAgente(put(URL_AGENTE, { apiKey: 'x' }))).status).toBe(400);
    expect((await putAgente(put(URL_AGENTE, [1]))).status).toBe(400);
    expect((await putAgente(put(URL_AGENTE, {}))).status).toBe(400);
    expect(config.guardados).toEqual([]);
  });

  it('200 persists a subset through the repo with the session user and returns the resolved config', async () => {
    const response = await putAgente(
      put(URL_AGENTE, { umbralConfianza: 0.75, textoEscalado: '  Te paso con un asesor  ' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(config.guardados.map((g) => [g.clave, g.valor, g.usuario, g.esSecreto])).toEqual([
      ['agente.umbralConfianza', '0.75', 'Juana Perez', false],
      ['agente.textoEscalado', 'Te paso con un asesor', 'Juana Perez', false],
    ]);
    expect(body.config.umbralConfianza).toBe(0.75);
    expect(body.config.textoEscalado).toBe('Te paso con un asesor');
    expect(body.fuentes.umbralConfianza).toBe('db');
  });

  it('503 without config repo and 500 without leaking the internal message', async () => {
    config.falloEnGuardar = new Error('conexión secreta rota');
    const fallo = await putAgente(put(URL_AGENTE, { habilitado: false }));
    expect(fallo.status).toBe(500);
    expect(JSON.stringify(await fallo.json())).not.toContain('secreta');

    setDb(undefined);
    expect((await putAgente(put(URL_AGENTE, { habilitado: false }))).status).toBe(503);
  });
});

describe('PUT /api/crm/configuracion/agente/kill-switch', () => {
  it('401 / 403 / 503 gates', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await putKillSwitch(put(URL_KILL, { habilitado: false }))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await putKillSwitch(put(URL_KILL, { habilitado: false }))).status).toBe(403);

    setDb(undefined);
    expect((await putKillSwitch(put(URL_KILL, { habilitado: false }))).status).toBe(503);
  });

  it('rejects non-boolean values and malformed bodies with 400', async () => {
    for (const cuerpo of [{ habilitado: 'false' }, { habilitado: 0 }, { habilitado: null }, {}, '{no']) {
      expect((await putKillSwitch(put(URL_KILL, cuerpo))).status).toBe(400);
    }
    expect(config.guardados).toEqual([]);
  });

  it('200 {habilitado} and the change is stored with the session user', async () => {
    const response = await putKillSwitch(put(URL_KILL, { habilitado: false }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, habilitado: false });
    expect(config.guardados).toEqual([
      { clave: 'agente.habilitado', valor: 'false', esSecreto: false, usuario: 'Juana Perez' },
    ]);
    expect(config.auditoria[0]?.usuario).toBe('Juana Perez');
  });
});

describe('GET /api/crm/configuracion/auditoria', () => {
  function sembrarAuditoria(cantidad: number): void {
    for (let i = 0; i < cantidad; i++) {
      config.auditoria.push({
        id: i + 1,
        clave: i % 2 === 0 ? 'agente.umbralConfianza' : 'whatsapp.token',
        usuario: 'seed',
        valorAnterior: null,
        valorNuevo: 'v',
        esSecreto: false,
        creadoEn: new Date('2026-10-17T10:00:00.000Z'),
      });
    }
  }

  it('401 / 403 / 503 gates', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await getAuditoria(new Request(URL_AUDITORIA))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await getAuditoria(new Request(URL_AUDITORIA))).status).toBe(403);

    setDb(undefined);
    expect((await getAuditoria(new Request(URL_AUDITORIA))).status).toBe(503);
  });

  it('defaults the limit to 50 and caps it at 200 (invalid → default), no-store', async () => {
    const sinLimite = await getAuditoria(new Request(URL_AUDITORIA));
    expect(config.limitePedido).toBe(50);
    expect(sinLimite.headers.get('cache-control')).toBe('no-store');

    await getAuditoria(new Request(`${URL_AUDITORIA}?limite=9999`));
    expect(config.limitePedido).toBe(200);

    await getAuditoria(new Request(`${URL_AUDITORIA}?limite=abc`));
    expect(config.limitePedido).toBe(50);
  });

  it('filters by prefijo and honours the limit over the filtered rows', async () => {
    sembrarAuditoria(10);

    const response = await getAuditoria(new Request(`${URL_AUDITORIA}?prefijo=agente.&limite=3`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.auditoria).toHaveLength(3);
    expect(body.auditoria.every((fila: { clave: string }) => fila.clave.startsWith('agente.'))).toBe(true);
    expect(typeof body.auditoria[0].creadoEn).toBe('string');
  });

  it('never puts values of secret rows on the wire', async () => {
    config.auditoria.push({
      id: 1,
      clave: 'agente.apiKey',
      usuario: 'seed',
      valorAnterior: 'sk-viejo-123',
      valorNuevo: 'sk-nuevo-456',
      esSecreto: true,
      creadoEn: new Date('2026-10-17T10:00:00.000Z'),
    });

    const response = await getAuditoria(new Request(`${URL_AUDITORIA}?prefijo=agente.`));
    const texto = await response.text();

    expect(texto).not.toContain('sk-viejo-123');
    expect(texto).not.toContain('sk-nuevo-456');
    expect(JSON.parse(texto).auditoria[0]).toMatchObject({
      esSecreto: true,
      valorAnterior: null,
      valorNuevo: null,
    });
  });
});
