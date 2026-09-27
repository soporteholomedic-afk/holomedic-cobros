import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (transiciones route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Stub the SMTP adapter class at the module seam — the route
// composes `new EnviadorCorreoCrm()` internally, so the fake replaces
// the class; the REAL use case still runs (composition proof). The
// dispatch internals are already pinned by enviarCorreoCrm.test.ts —
// these tests only verify the HTTP surface + wiring (watch item). ----

const mockEnviar = vi.hoisted(() => vi.fn());
vi.mock('@/features/crm/infrastructure/email/enviadorCorreoCrm', () => ({
  EnviadorCorreoCrm: class {
    enviar = mockEnviar;
  },
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmPipelineRepositoryPort } from '@/features/crm/domain/ports';
import type { Empresa, PipelineEmpresa as FilaPipeline } from '@/features/crm/domain/entities';

// ---- Fixtures ----

function filaPipeline(overrides: Partial<FilaPipeline> = {}): FilaPipeline {
  return {
    empresaId: 42,
    flujo: 'OUTBOUND',
    etapa: 'NUEVO',
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

function empresaFixture(): Empresa {
  return {
    id: 42,
    ruc: '1792345678001',
    rucNormalizado: '1792345678001',
    razonSocial: 'Andes SA',
    tipo: 'Prospecto',
    origen: 'Outbound',
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    contactos: [
      {
        id: 7,
        empresaId: 42,
        nombre: 'Ana Ruiz',
        telefono: '0991112222',
        esPrincipal: true,
        correos: [{ id: 1, contactoId: 7, correo: 'ana@andes.com' }],
      },
    ],
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
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
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn().mockResolvedValue(empresaFixture()),
    actualizar: vi.fn(),
    ...overrides,
  };
}

function makeFakeEnvios(): CrmDb['envios'] {
  return { registrar: vi.fn().mockResolvedValue(77), listarPorEmpresa: vi.fn().mockResolvedValue([]) };
}

function setDb(overrides: {
  pipeline?: Partial<CrmPipelineRepositoryPort>;
  empresas?: Partial<CrmDb['empresas']>;
  envios?: CrmDb['envios'];
} = {}): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: makeFakeEmpresas(overrides.empresas),
    importador: {} as never,
    pipeline: makeFakePipeline(overrides.pipeline),
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    envios: overrides.envios ?? makeFakeEnvios(),
    panel: {} as never,
  } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/empresas/${id}/envios`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset().mockResolvedValue(crmSession);
  mockEnviar.mockReset().mockResolvedValue({ ok: true, messageId: 'msg-1' });
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/empresas/[id]/envios', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb();

    const response = await POST(jsonPost('42', { plantilla: 'carta_presentacion' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    setDb();

    const response = await POST(jsonPost('42', { plantilla: 'carta_presentacion' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 400 for a non-numeric empresa id', async () => {
    setDb();

    const response = await POST(jsonPost('abc', { plantilla: 'carta_presentacion' }), routeContext('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON and for an unknown plantilla', async () => {
    setDb();

    const notJson = await POST(jsonPost('42', '{no-json'), routeContext('42'));
    expect(notJson.status).toBe(400);

    const unknownKey = await POST(jsonPost('42', { plantilla: 'newsletter' }), routeContext('42'));
    const body = await unknownKey.json();
    expect(unknownKey.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockEnviar).not.toHaveBeenCalled();
  });

  it('dispatches the carta and returns the persisted result (T7 path)', async () => {
    setDb();

    const response = await POST(jsonPost('42', { plantilla: 'carta_presentacion' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.envioId).toBe(77);
    expect(body.plantilla).toBe('carta_presentacion');
    expect(body.destinatario).toBe('ana@andes.com');
    expect(body.contactoId).toBe(7);
    expect(body.pipeline.etapa).toBe('CADENCIA');
    expect(body.pipeline.enviosCiclo).toBe(1);
    expect(mockEnviar).toHaveBeenCalledTimes(1);
    expect(mockEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ destinatario: 'ana@andes.com', plantilla: 'carta_presentacion', empresa: 'Andes SA' }),
    );
  });

  it('answers 400 BEFORE dispatch when the template does not apply to the pipeline state', async () => {
    setDb({ pipeline: { obtenerPorEmpresaId: vi.fn().mockResolvedValue(filaPipeline({ etapa: 'CADENCIA', enviosCiclo: 2 })) } });

    const response = await POST(jsonPost('42', { plantilla: 'carta_presentacion' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockEnviar).not.toHaveBeenCalled();
  });

  it('answers a user-safe 500 on SMTP failure; the FALLIDO row carries the detail and the state is unchanged', async () => {
    const envios = makeFakeEnvios();
    const pipeline = makeFakePipeline();
    setDb({ envios, pipeline });
    mockEnviar.mockResolvedValue({ ok: false, error: 'SMTP_TIMEOUT', detalle: 'greeting timeout' });

    const response = await POST(jsonPost('42', { plantilla: 'carta_presentacion' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).not.toContain('greeting timeout');
    expect(envios.registrar).toHaveBeenCalledTimes(1);
    expect(envios.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'FALLIDO', messageId: null, contactoId: 7 }),
    );
    expect(pipeline.registrarTransicion).not.toHaveBeenCalled();
  });

  it('returns 404 when the empresa does not exist', async () => {
    setDb({ empresas: { obtenerPorId: vi.fn().mockResolvedValue(null) } });

    const response = await POST(jsonPost('42', { plantilla: 'carta_presentacion' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
  });
});
