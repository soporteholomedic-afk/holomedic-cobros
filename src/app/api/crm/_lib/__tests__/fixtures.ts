import { vi } from 'vitest';
import type { ICrmEmpresaRepository, ICrmOportunidadRepository, IAtencionesServicio } from '@/features/crm/domain/ports';
import type { Empresa, Oportunidad } from '@/features/crm/domain/entities';

export const crmSession = {
  sub: 'u-1',
  nombre: 'Scott Palomino',
  area: 'Comercial',
  permisos: ['crm' as const],
};

export const sinCrmSession = { ...crmSession, permisos: ['cobranza' as const] };

export const FILA: Empresa = {
  idEmpresa: 'e-1',
  razonSocial: 'Constructora Andina S.A.C.',
  ruc: '20512345678',
  sector: 'Construcción',
  direccion: null,
  contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
  notas: null,
  relacion: 'prospecto',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const OPORTUNIDAD: Oportunidad = {
  idOportunidad: 'o-1',
  idEmpresa: 'e-1',
  nombre: 'Exámenes ocupacionales 2026',
  responsableId: null,
  responsableNombre: null,
  origen: null,
  servicio: null,
  montoEstimado: null,
  etapa: 'contactado',
  medio: 'llamada',
  medioOtro: null,
  motivo: null,
  intentosSinRespuesta: 0,
  faltaResponderDesde: null,
  proximaAccion: null,
  sugerenciaDescartadaEn: null,
  migrada: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const VALIDO = {
  razonSocial: 'Minera Los Tres Picos S.A.',
  ruc: '20601234567',
  sector: 'Construcción',
  notas: null,
  contactos: [
    { nombre: 'Jorge Salazar', telefono: '954 112 308', correo: 'jorge@mtp.pe' },
    { nombre: 'Ana Ríos', telefono: '911 222 333' },
  ],
};

export function createJsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request;
}

export function invalidJsonRequest(): Request {
  return { json: () => Promise.reject(new SyntaxError('bad json')) } as Request;
}

export function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Repository whose every method is a spy; defaults describe an empty, healthy store. */
export function makeMockRepo(overrides: Partial<ICrmEmpresaRepository> = {}): ICrmEmpresaRepository {
  return {
    getById: vi.fn().mockResolvedValue(null),
    findByRuc: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (input) => ({ ...FILA, ...input })),
    update: vi.fn().mockImplementation(async (_id, datos) => ({ ...FILA, ...datos })),
    updateRelacion: vi.fn().mockImplementation(async (_id, relacion) => ({ ...FILA, relacion })),
    addInteraccion: vi.fn().mockImplementation(async (idEmpresa: string, i) => ({
      idInteraccion: 1,
      idEmpresa,
      fecha: '2026-01-01T00:00:00.000Z',
      ...i,
    })),
    listInteracciones: vi.fn().mockResolvedValue([]),
    ultimaInteraccionPorEmpresas: vi.fn().mockResolvedValue(new Map<string, string | null>()),
    fusionar: vi.fn().mockImplementation(async () => FILA),
    listSectores: vi.fn().mockResolvedValue([
      { nombre: 'Construcción', icono: 'casco' },
      { nombre: 'Comercio y Tiendas', icono: 'tienda' },
    ]),
    createSector: vi
      .fn()
      .mockImplementation(async (nombre: string, icono: string | null) => ({ nombre, icono })),
    ...overrides,
  };
}

/** Oportunidad repository whose every method is a spy; same empty, healthy defaults. */
export function makeMockOportunidadesRepo(
  overrides: Partial<ICrmOportunidadRepository> = {},
): ICrmOportunidadRepository {
  return {
    getById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    listByEmpresa: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (_idEmpresa: string, datos) => ({ ...OPORTUNIDAD, ...datos })),
    updateDatos: vi.fn().mockImplementation(async (_id: string, datos) => ({ ...OPORTUNIDAD, ...datos })),
    updateSeguimiento: vi
      .fn()
      .mockImplementation(async (_id: string, seguimiento) => ({ ...OPORTUNIDAD, ...seguimiento })),
    ...overrides,
  };
}

/** SIGLA atenciones fake: `null` (no attention) unless overridden. */
export function makeMockAtenciones(overrides: Partial<IAtencionesServicio> = {}): IAtencionesServicio {
  return {
    ultimaAtencion: vi.fn().mockResolvedValue(null),
    ultimaAtencionPorRucs: vi.fn().mockImplementation(async (rucs: string[]) => new Map(rucs.map((ruc) => [ruc, null]))),
    ...overrides,
  };
}
