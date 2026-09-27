import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmPipelineRepositoryPort } from '@/features/crm/domain/ports';
import type { PipelineEmpresa as FilaPipeline } from '@/features/crm/domain/entities';

// ---- Fixtures ----

function filaPipeline(overrides: Partial<FilaPipeline> = {}): FilaPipeline {
  return {
    empresaId: 42,
    flujo: 'INBOUND',
    etapa: 'REGISTRADO',
    ciclo: 1,
    enviosCiclo: 0,
    fechaCicloInicio: null,
    fechaUltimoEnvio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeFakePipeline(overrides: Partial<CrmPipelineRepositoryPort> = {}): CrmPipelineRepositoryPort {
  return {
    obtenerPorEmpresaId: vi.fn().mockResolvedValue(filaPipeline()),
    listarTransiciones: vi.fn().mockResolvedValue([]),
    listarHandoffs: vi.fn().mockResolvedValue([]),
    listarCandidatosCola: vi.fn().mockResolvedValue([]),
    registrarTransicion: vi.fn().mockImplementation(async (datos: Parameters<CrmPipelineRepositoryPort['registrarTransicion']>[0]) => ({
      ...filaPipeline(),
      flujo: datos.estadoNuevo.flujo,
      etapa: datos.estadoNuevo.etapa,
      ciclo: datos.efectos.ciclo,
      enviosCiclo: datos.efectos.enviosCiclo,
      updatedBy: datos.usuario,
    })),
    cambiarTipo: vi.fn(),
    ...overrides,
  };
}

function makeFakeEmpresas(overrides: Partial<CrmDb['empresas']> = {}): CrmDb['empresas'] {
  return { crear: vi.fn(), listar: vi.fn(), obtenerPorId: vi.fn(), actualizar: vi.fn(), ...overrides };
}

function setDb(pipeline: CrmPipelineRepositoryPort, empresas: CrmDb['empresas'] = makeFakeEmpresas()): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas,
    importador: {} as never,
    pipeline,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    envios: {} as never,
    } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/empresas/${id}/transiciones`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/empresas/[id]/transiciones', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakePipeline());

    const response = await POST(jsonPost('42', { evento: 'CotizaciónEnviada' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    setDb(makeFakePipeline());

    const response = await POST(jsonPost('42', { evento: 'CotizaciónEnviada' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 200 with the new state and the emitted result event (T2)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const pipeline = makeFakePipeline();
    setDb(pipeline);

    const response = await POST(jsonPost('42', { evento: 'CotizaciónEnviada' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.estado).toEqual({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' });
    expect(body.resultado).toBe('CotizaciónEnviada');
    expect(body.pipeline.etapa).toBe('SEGUIMIENTO');
    expect(body.pipeline.enviosCiclo).toBe(1);
    // The bundle rode the pinned event name and the session user (audit).
    expect(pipeline.registrarTransicion).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 42,
        evento: 'CotizaciónEnviada',
        usuario: 'u-1',
        estadoPrevio: { flujo: 'INBOUND', etapa: 'REGISTRADO' },
      }),
    );
  });

  it('T11 DatosSolicitados with datos: upserts operational contactos BEFORE the transition and rides the resumen motivo', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const guardar = vi.fn().mockResolvedValue(undefined);
    const pipeline = makeFakePipeline({
      obtenerPorEmpresaId: vi.fn().mockResolvedValue(filaPipeline({ flujo: 'OUTBOUND', etapa: 'ACEPTADO' })),
    });
    setDb(pipeline, makeFakeEmpresas({ guardarContactoOperativo: guardar }));

    const response = await POST(
      jsonPost('42', {
        evento: 'DatosSolicitados',
        datos: {
          facturacion: { encargado: 'Ana López', correo: 'fact@x.com' },
          administrador: { correo: 'admin@x.com' },
        },
      }),
      routeContext('42'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.estado).toEqual({ flujo: 'OUTBOUND', etapa: 'DATOS' });
    // Two filled pairs upserted (médico ocupacional skipped — empty).
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar).toHaveBeenCalledWith(42, 'Facturación', { nombre: 'Ana López', correo: 'fact@x.com' });
    expect(guardar).toHaveBeenCalledWith(42, 'Administrador', { nombre: null, correo: 'admin@x.com' });
    // Contactos BEFORE the transition (retry-safe ordering).
    expect(guardar.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(pipeline.registrarTransicion).mock.invocationCallOrder[0],
    );
    // The compact resumen rides the audit motivo.
    expect(pipeline.registrarTransicion).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'DatosSolicitados',
        motivo: 'Facturación: Ana López (fact@x.com) · Administrador: admin@x.com',
      }),
    );
  });

  it('rejects datos with a non-DatosSolicitados event (400)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakePipeline());

    const response = await POST(
      jsonPost('42', { evento: 'CotizaciónEnviada', datos: { facturacion: { correo: 'a@x.com' } } }),
      routeContext('42'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('maps an illegal move (TransicionInvalidaError) to 400 with the Spanish message verbatim', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    // CONFIRMADA cannot fire CotizaciónEnviada.
    setDb(makeFakePipeline({ obtenerPorEmpresaId: vi.fn().mockResolvedValue(filaPipeline({ etapa: 'CONFIRMADA' })) }));

    const response = await POST(jsonPost('42', { evento: 'CotizaciónEnviada' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('Transición no válida');
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa has no pipeline row', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakePipeline({ obtenerPorEmpresaId: vi.fn().mockResolvedValue(null) }));

    const response = await POST(jsonPost('42', { evento: 'CotizaciónEnviada' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
  });

  it('returns 400 when T14 arrives without a motivo (repo untouched)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const pipeline = makeFakePipeline();
    setDb(pipeline);

    const response = await POST(jsonPost('42', { evento: 'Rechazo' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('motivo');
    expect(pipeline.registrarTransicion).not.toHaveBeenCalled();
  });

  it('returns 400 when T5 arrives without a handoff payload', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const pipeline = makeFakePipeline();
    setDb(pipeline);

    const response = await POST(
      jsonPost('42', { evento: 'HandoffRegistrado' }),
      routeContext('42'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(pipeline.registrarTransicion).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown evento value (shape guard — repo untouched)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const pipeline = makeFakePipeline();
    setDb(pipeline);

    const response = await POST(jsonPost('42', { evento: 'AvanceDeEtapa' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(pipeline.obtenerPorEmpresaId).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakePipeline());

    const response = await POST(jsonPost('42', '{no-json'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-numeric id', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const pipeline = makeFakePipeline();
    setDb(pipeline);

    const response = await POST(jsonPost('abc', { evento: 'CotizaciónEnviada' }), routeContext('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(pipeline.obtenerPorEmpresaId).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(
      makeFakePipeline({
        registrarTransicion: vi.fn().mockRejectedValue(new Error('db down')),
      }),
    );

    const response = await POST(jsonPost('42', { evento: 'CotizaciónEnviada' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
