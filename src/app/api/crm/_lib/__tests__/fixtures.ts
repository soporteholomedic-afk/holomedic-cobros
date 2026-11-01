import { vi } from 'vitest';
import type { ICrmEmpresaRepository } from '@/features/crm/domain/ports';
import type { Empresa } from '@/features/crm/domain/entities';

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
  contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
  notas: null,
  etapa: 'por_contactar',
  medio: null,
  medioOtro: null,
  motivo: null,
  intentosSinRespuesta: 0,
  faltaResponderDesde: null,
  proximaAccion: null,
  origen: null,
  sugerenciaDescartadaEn: null,
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
    updateEstado: vi.fn().mockImplementation(async (_id, estado) => ({ ...FILA, ...estado })),
    updateSeguimiento: vi.fn().mockImplementation(async (_id, seguimiento) => ({
      ...FILA,
      ...seguimiento,
    })),
    addInteraccion: vi.fn().mockImplementation(async (idEmpresa: string, i) => ({
      idInteraccion: 1,
      idEmpresa,
      fecha: '2026-01-01T00:00:00.000Z',
      ...i,
    })),
    listInteracciones: vi.fn().mockResolvedValue([]),
    fusionar: vi.fn().mockImplementation(async () => FILA),
    listSectores: vi.fn().mockResolvedValue(['Construcción', 'Comercio y Tiendas']),
    createSector: vi.fn().mockImplementation(async (nombre: string) => nombre),
    ...overrides,
  };
}
