import { vi } from 'vitest';
import type { Empresa, Medio, Oportunidad, Sector } from '../../../domain/entities';

/** Permanent ficha (S1): the empresa is never a board card anymore. */
export function empresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
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
  }),
  empresa({
    idEmpresa: 'e-4',
    razonSocial: 'Agroindustrial Valle Verde S.A.C.',
    ruc: '20534128790',
    sector: null,
    contactos: [{ nombre: 'Ana Torres', telefono: '936 018 552', correo: null }],
    relacion: 'cliente',
  }),
  empresa({
    idEmpresa: 'e-5',
    razonSocial: 'Ferretería El Maestro S.R.L.',
    ruc: '20478901234',
    sector: 'Comercio y Tiendas',
    contactos: [{ nombre: 'Hugo Medina', telefono: '965 332 100', correo: null }],
  }),
];

/** One board card (S2): the stage and the follow-up state live on the deal. */
export function oportunidad(overrides: Partial<Oportunidad> = {}): Oportunidad {
  return {
    idOportunidad: 'o-1',
    idEmpresa: 'e-1',
    nombre: 'Equipos de protección para obra',
    responsableId: null,
    responsableNombre: null,
    origen: null,
    servicio: null,
    montoEstimado: null,
    etapa: 'por_contactar',
    medio: null,
    medioOtro: null,
    motivo: null,
    intentosSinRespuesta: 0,
    faltaResponderDesde: null,
    proximaAccion: null,
    sugerenciaDescartadaEn: null,
    migrada: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Every stage gets a card; Textiles sits in two columns (S2). */
export const OPORTUNIDADES: Oportunidad[] = [
  oportunidad(),
  oportunidad({ idOportunidad: 'o-2', idEmpresa: 'e-2', nombre: 'Monitoreo ocupacional 2026' }),
  oportunidad({
    idOportunidad: 'o-3',
    idEmpresa: 'e-3',
    nombre: 'Exámenes de ingreso',
    etapa: 'contactado',
    medio: 'llamada',
  }),
  oportunidad({
    idOportunidad: 'o-4',
    idEmpresa: 'e-3',
    nombre: 'Campaña de vacunación 2025',
    etapa: 'ganada',
    migrada: true,
  }),
  oportunidad({
    idOportunidad: 'o-5',
    idEmpresa: 'e-4',
    nombre: 'Ergonomía para planta',
    etapa: 'en_seguimiento',
    medio: 'whatsapp',
    proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-05' },
  }),
  oportunidad({
    idOportunidad: 'o-6',
    idEmpresa: 'e-2',
    nombre: 'Vigilancia epidemiológica',
    etapa: 'cotizado',
    servicio: 'Audiometrías',
    responsableId: 'u-1',
    responsableNombre: 'Luis Cárdenas',
    origen: 'referido',
    montoEstimado: 12000,
  }),
  oportunidad({
    idOportunidad: 'o-7',
    idEmpresa: 'e-5',
    nombre: 'Ergonomía industrial',
    etapa: 'perdida',
    medio: 'llamada',
    motivo: { categoria: 'proveedor', detalle1: 'Distribuidora Norte S.A.C.', detalle2: 'diciembre 2027', notas: null },
    migrada: true,
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
  /** GET /api/crm/empresas. */
  lista?: Respuesta;
  /** GET /api/crm/oportunidades. */
  oportunidades?: Respuesta;
  sectores?: Respuesta;
  /** GET /api/crm/alertas; defaults to an empty day (PanelDia is mocked in board suites). */
  alertas?: Respuesta;
  /** GET /api/crm/empresas/{id}/historial; defaults to an empty history. */
  historial?: (id: string) => Respuesta;
  /** GET /api/crm/empresas/{id}/atencion; defaults to sin_informacion without a date. */
  atencion?: (id: string) => Respuesta;
  post?: (body: Record<string, unknown>) => Respuesta;
  put?: (id: string, body: Record<string, unknown>) => Respuesta;
  /** PATCH /api/crm/empresas/{id}/relacion. */
  relacion?: (id: string, body: Record<string, unknown>) => Respuesta;
  etapa?: (id: string, body: Record<string, unknown>) => Respuesta;
  seguimiento?: (id: string, body: Record<string, unknown>) => Respuesta;
  sugerencia?: (id: string, body: Record<string, unknown>) => Respuesta;
  sector?: (body: Record<string, unknown>) => Respuesta;
  /** POST /api/crm/entrantes — no default: each save test states the deal it creates. */
  entrante?: (body: Record<string, unknown>) => Respuesta;
  /** POST /api/crm/empresas/{id}/actividades — no default: each save test states what advanced. */
  actividades?: (id: string, body: Record<string, unknown>) => Respuesta;
  /** POST /api/crm/oportunidades (the alta's primera oportunidad) — no default. */
  nuevaOportunidad?: (body: Record<string, unknown>) => Respuesta;
}

/** Fake of the CRM API. Unexpected requests throw so a test cannot pass by accident. */
export function mockApi(api: Api = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (url === '/api/crm/empresas' && method === 'GET') {
      return json(api.lista ?? { status: 200, body: { success: true, empresas: LISTA } });
    }
    if (url === '/api/crm/oportunidades' && method === 'GET') {
      return json(api.oportunidades ?? { status: 200, body: { success: true, oportunidades: OPORTUNIDADES } });
    }
    if (url === '/api/crm/sectores' && method === 'GET') {
      return json(api.sectores ?? { status: 200, body: { success: true, sectores: SECTORES } });
    }
    if (url === '/api/crm/alertas' && method === 'GET') {
      return json(api.alertas ?? { status: 200, body: { success: true, alertas: [], resumen: { vencidas: 0, hoy: 0, sinResponder: 0 } } });
    }
    const h = url.match(/^\/api\/crm\/empresas\/([^/]+)\/historial$/);
    if (h && method === 'GET') {
      return json(api.historial ? api.historial(h[1]!) : { status: 200, body: { success: true, interacciones: [] } });
    }
    const a = url.match(/^\/api\/crm\/empresas\/([^/]+)\/atencion$/);
    if (a && method === 'GET') {
      return json(
        api.atencion ? api.atencion(a[1]!) : { status: 200, body: { success: true, actividad: { ultimaAtencion: null, ruc: null }, estado: 'sin_informacion' } },
      );
    }
    if (url === '/api/crm/sectores' && method === 'POST') {
      return json(api.sector ? api.sector(body) : { status: 201, body: { success: true, sector: { nombre: String(body.nombre), icono: body.icono ?? null } } });
    }
    if (url === '/api/crm/empresas' && method === 'POST') {
      return json(
        api.post
          ? api.post(body)
          : { status: 201, body: { success: true, empresa: { ...empresa({ idEmpresa: 'e-9' }), ...(body as Partial<Empresa>) } } },
      );
    }
    if (url === '/api/crm/entrantes' && method === 'POST') {
      if (!api.entrante) throw new Error('stub api.entrante for POST /api/crm/entrantes');
      return json(api.entrante(body));
    }
    if (url === '/api/crm/oportunidades' && method === 'POST') {
      if (!api.nuevaOportunidad) throw new Error('stub api.nuevaOportunidad for POST /api/crm/oportunidades');
      return json(api.nuevaOportunidad(body));
    }
    const act = url.match(/^\/api\/crm\/empresas\/([^/]+)\/actividades$/);
    if (act && method === 'POST') {
      if (!api.actividades) throw new Error('stub api.actividades for POST /api/crm/empresas/[id]/actividades');
      return json(api.actividades(act[1]!, body));
    }
    const o = url.match(/^\/api\/crm\/oportunidades\/([^/]+)(\/etapa|\/seguimiento|\/sugerencia)?$/);
    if (o) {
      const [, id = '', sub] = o;
      const actual = OPORTUNIDADES.find((x) => x.idOportunidad === id) ?? oportunidad({ idOportunidad: id });
      if (sub === '/etapa' && method === 'PATCH') {
        // Mirrors MoverOportunidadUseCase: por contactar clears the medium, only
        // perdida stores a reason, ganada/perdida clear the próxima acción.
        return json(
          api.etapa
            ? api.etapa(id, body)
            : {
                status: 200,
                body: {
                  success: true,
                  oportunidad: {
                    ...actual,
                    etapa: body.etapa,
                    medio: body.etapa === 'por_contactar' ? null : ((body.medio as Medio | undefined) ?? actual.medio),
                    motivo:
                      body.etapa === 'perdida'
                        ? { detalle1: null, detalle2: null, notas: null, ...(body.motivo as object) }
                        : null,
                    proximaAccion: body.etapa === 'ganada' || body.etapa === 'perdida' ? null : actual.proximaAccion,
                  },
                },
              },
        );
      }
      if (sub === '/seguimiento' && method === 'PATCH') {
        return json(
          api.seguimiento
            ? api.seguimiento(id, body)
            : {
                status: 200,
                body: {
                  success: true,
                  oportunidad: {
                    ...actual,
                    ...(body.medio ? { medio: body.medio } : {}),
                    ...(body.motivo ? { motivo: { detalle1: null, detalle2: null, notas: null, ...(body.motivo as object) } } : {}),
                  },
                },
              },
        );
      }
      if (sub === '/sugerencia' && method === 'POST') {
        return json(
          api.sugerencia
            ? api.sugerencia(id, body)
            : body.accion === 'perder'
              ? {
                  status: 200,
                  body: {
                    success: true,
                    oportunidad: {
                      ...actual,
                      etapa: 'perdida',
                      motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null },
                      proximaAccion: null,
                      faltaResponderDesde: null,
                    },
                  },
                }
              : {
                  status: 200,
                  body: { success: true, oportunidad: { ...actual, sugerenciaDescartadaEn: actual.intentosSinRespuesta } },
                },
        );
      }
    }
    const p = url.match(/^\/api\/crm\/empresas\/([^/]+)$/);
    if (p && method === 'PATCH') {
      const [, id = ''] = p;
      const actual = LISTA.find((x) => x.idEmpresa === id) ?? empresa({ idEmpresa: id });
      return json(api.put ? api.put(id, body) : { status: 200, body: { success: true, empresa: { ...actual, ...body } as Empresa } });
    }
    const r = url.match(/^\/api\/crm\/empresas\/([^/]+)\/relacion$/);
    if (r && method === 'PATCH') {
      const [, id = ''] = r;
      const actual = LISTA.find((x) => x.idEmpresa === id) ?? empresa({ idEmpresa: id });
      return json(
        api.relacion
          ? api.relacion(id, body)
          : { status: 200, body: { success: true, empresa: { ...actual, relacion: body.relacion } as Empresa } },
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
