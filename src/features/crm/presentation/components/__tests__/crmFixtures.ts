import { vi } from 'vitest';
import type { Empresa, Sector } from '../../../domain/entities';

export function empresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    idEmpresa: 'e-1',
    razonSocial: 'Constructora Andina S.A.C.',
    ruc: '20512345678',
    sector: 'Construcción',
    contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
    notas: null,
    etapa: 'por_contactar',
    medio: null,
    motivo: null,
    medioOtro: null,
    intentosSinRespuesta: 0,
    faltaResponderDesde: null,
    proximaAccion: null,
    origen: null,
    sugerenciaDescartadaEn: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export const LISTA: Empresa[] = [
  empresa(),
  empresa({
    idEmpresa: 'e-2',
    razonSocial: 'Minera Los Tres Picos S.A.',
    ruc: '20601234567',
    sector: 'Minería y Energía',
    contactos: [{ nombre: 'Jorge Salazar', telefono: '954 112 308', correo: null }],
  }),
  empresa({
    idEmpresa: 'e-3',
    razonSocial: 'Textiles Pacífico S.A.C.',
    ruc: '20556677889',
    sector: 'Fábrica y Producción',
    contactos: [
      { nombre: 'Renzo Vargas', telefono: '998 201 456', correo: 'renzo@tp.pe' },
      { nombre: 'Lucía Prado', telefono: '998 220 145', correo: null },
    ],
    etapa: 'contactado',
    medio: 'llamada',
  }),
  empresa({
    idEmpresa: 'e-4',
    razonSocial: 'Agroindustrial Valle Verde S.A.C.',
    ruc: '20534128790',
    sector: null,
    contactos: [{ nombre: 'Ana Torres', telefono: '936 018 552', correo: null }],
    etapa: 'cliente',
    medio: 'whatsapp',
  }),
  empresa({
    idEmpresa: 'e-5',
    razonSocial: 'Ferretería El Maestro S.R.L.',
    ruc: '20478901234',
    sector: 'Comercio y Tiendas',
    contactos: [{ nombre: 'Hugo Medina', telefono: '965 332 100', correo: null }],
    etapa: 'perdido',
    medio: 'llamada',
    motivo: { categoria: 'proveedor', detalle1: 'Distribuidora Norte S.A.C.', detalle2: 'diciembre 2027', notas: null },
  }),
];

export const SECTORES: Sector[] = [
  { nombre: 'Comercio y Tiendas', icono: 'tienda' },
  { nombre: 'Construcción', icono: 'casco' },
  { nombre: 'Fábrica y Producción', icono: 'fabrica' },
  { nombre: 'Minería y Energía', icono: null },
];

export type Respuesta = { status: number; body: unknown };

export function json(r: Respuesta): Response {
  return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
}

export interface Api {
  lista?: Respuesta;
  sectores?: Respuesta;
  /** GET /api/crm/alertas; defaults to an empty day so the panel renders nothing. */
  alertas?: Respuesta;
  post?: (body: Record<string, unknown>) => Respuesta;
  put?: (id: string, body: Record<string, unknown>) => Respuesta;
  etapa?: (id: string, body: Record<string, unknown>) => Respuesta;
  seguimiento?: (id: string, body: Record<string, unknown>) => Respuesta;
  sector?: (body: Record<string, unknown>) => Respuesta;
  contacto?: (id: string, body: Record<string, unknown>) => Respuesta;
  entrante?: (body: Record<string, unknown>) => Respuesta;
}

/** Fake of the CRM API. Unexpected requests throw so a test cannot pass by accident. */
export function mockApi(api: Api = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (url === '/api/crm/empresas' && method === 'GET') {
      return json(api.lista ?? { status: 200, body: { success: true, empresas: LISTA } });
    }
    if (url === '/api/crm/sectores' && method === 'GET') {
      return json(api.sectores ?? { status: 200, body: { success: true, sectores: SECTORES } });
    }
    if (url === '/api/crm/alertas' && method === 'GET') {
      return json(api.alertas ?? { status: 200, body: { success: true, alertas: [], resumen: { vencidas: 0, hoy: 0, sinResponder: 0 } } });
    }
    if (url === '/api/crm/sectores' && method === 'POST') {
      return json(api.sector ? api.sector(body) : { status: 201, body: { success: true, sector: { nombre: String(body.nombre), icono: body.icono ?? null } } });
    }
    if (url === '/api/crm/empresas' && method === 'POST') {
      return json(
        api.post
          ? api.post(body)
          : { status: 201, body: { success: true, empresa: empresa({ idEmpresa: 'e-9', ...(body as Partial<Empresa>), etapa: 'por_contactar' }) } },
      );
    }
    const c = url.match(/^\/api\/crm\/empresas\/([^/]+)\/contactos$/);
    if (c && method === 'POST' && api.contacto) return json(api.contacto(c[1] ?? '', body));
    if (url === '/api/crm/entrantes' && method === 'POST' && api.entrante) return json(api.entrante(body));
    if (/\/historial$/.test(url) && method === 'GET') return json({ status: 200, body: { success: true, interacciones: [] } });
    const m = url.match(/^\/api\/crm\/empresas\/([^/]+)(\/etapa|\/seguimiento)?$/);
    if (m && method === 'PATCH') {
      const [, id = '', sub] = m;
      const actual = LISTA.find((e) => e.idEmpresa === id) ?? empresa({ idEmpresa: id });
      if (sub === '/etapa') {
        return json(
          api.etapa
            ? api.etapa(id, body)
            : {
                status: 200,
                body: {
                  success: true,
                  empresa: {
                    ...actual,
                    etapa: body.etapa,
                    medio: body.etapa === 'por_contactar' ? null : (body.medio ?? actual.medio),
                    motivo: body.etapa === 'perdido' ? { detalle1: null, detalle2: null, notas: null, ...(body.motivo as object) } : null,
                  },
                },
              },
        );
      }
      if (sub === '/seguimiento') {
        return json(
          api.seguimiento
            ? api.seguimiento(id, body)
            : { status: 200, body: { success: true, empresa: { ...actual, ...(body.medio ? { medio: body.medio } : {}), ...(body.motivo ? { motivo: { detalle1: null, detalle2: null, notas: null, ...(body.motivo as object) } } : {}) } } },
        );
      }
      return json(
        api.put
          ? api.put(id, body)
          : {
              status: 200,
              body: {
                success: true,
                empresa: {
                  ...actual,
                  razonSocial: body.razonSocial,
                  ruc: body.ruc,
                  sector: body.sector ?? null,
                  notas: body.notas ?? null,
                  contactos: (body.contactos as { nombre: string; telefono: string; correo?: string }[]).map((c) => ({
                    nombre: c.nombre,
                    telefono: c.telefono,
                    correo: c.correo ?? null,
                  })),
                },
              },
            },
      );
    }
    throw new Error(`unexpected request ${method} ${url}`);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

export function llamadas(fn: ReturnType<typeof mockApi>, metodo: string, filtro: RegExp | string) {
  return fn.mock.calls
    .filter(([url, init]) => (init?.method ?? 'GET') === metodo && (typeof filtro === 'string' ? url === filtro : filtro.test(url)))
    .map(([url, init]) => ({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined }));
}
