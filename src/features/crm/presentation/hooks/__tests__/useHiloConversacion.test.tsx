import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useHiloConversacion } from '../useHiloConversacion';
import type { AjustesConversacionVista } from '../../components/conversaciones/guards';
import type {
  CampoFicha,
  ConversacionCrm,
  FichaConversacion,
  MemoriaLista,
  MensajeCrm,
} from '../../../domain/entities';

/**
 * Hook contract for the E3·T5 help-pattern additions over the hilo:
 * the side column (ficha / memorias / ajustes) loads WITH the thread
 * on selection, the acciones (indicación, tomar/devolver/escalar,
 * confirmar ficha, toggle memoria, gestionar memorias) POST their
 * route and refetch what their success mutates, usuarios-asignables
 * loads ONLY on demand, and every failure lands in its inline error —
 * never a throw, never a crash. Fetch stubbed at the global with a
 * per-"METHOD path" router (HiloConversacion.test precedent).
 */

const CONVERSACION: ConversacionCrm = {
  id: 7,
  empresaId: 1,
  contactoId: 11,
  canal: 'WHATSAPP',
  telefono: '+595981234567',
  identificadorCanal: null,
  estado: 'REQUIERE_HUMANO',
  asignadaA: null,
  modo: 'IA',
  ultimoMensajeEn: '2026-10-11T14:02:00.000Z',
  noLeidos: 0,
  creadoEn: '2026-10-11T10:00:00.000Z',
  actualizadoEn: '2026-10-11T14:02:00.000Z',
};

const MENSAJE: MensajeCrm = {
  id: 3,
  conversacionId: 7,
  direccion: 'IN',
  emisor: 'CLIENTE',
  cuerpo: '¿Tienen descuento por volumen?',
  tipo: 'TEXTO',
  canal: 'WHATSAPP',
  wamid: null,
  idempotenciaKey: null,
  estadoEnvio: null,
  fuentes: null,
  score: null,
  modelo: null,
  creadoEn: '2026-10-11T10:00:00Z',
};

const SOLICITUD = {
  id: 9,
  conversacionId: 7,
  mensajeId: 3,
  consulta: '¿crédito fiscal a 30 días?',
  terminosBuscados: ['crédito', 'facturación'],
  score: 0.29,
  estado: 'PENDIENTE',
  indicacion: null,
  resueltaPor: null,
  creadoEn: '2026-10-11T14:03:00.000Z',
  resueltaEn: null,
};

const FICHA: FichaConversacion = {
  conversacionId: 7,
  contacto: { id: 11, nombre: 'Luis Medina', telefono: '+595981234567', cargo: null },
  empresa: { id: 1, razonSocial: 'Comercio Central', cantidadTrabajadores: null },
  datos: {
    cargo: { valor: null, origen: 'IA', confirmado: false },
    trabajadores: { valor: null, origen: 'IA', confirmado: false },
    sedes: { valor: null, origen: 'IA', confirmado: false },
  },
};

const MEMORIAS: MemoriaLista[] = [
  {
    id: 101,
    nivel: 'chat',
    tipo: 'indicacion_humana',
    titulo: 'Indicación humana',
    contenido: 'Responder por la tarde',
    pineada: true,
    creadoEn: '2026-06-10T10:00:00.000Z',
  },
];

const AJUSTES: Omit<AjustesConversacionVista, 'success'> = {
  estado: 'REQUIERE_HUMANO',
  modo: 'IA',
  asignadaA: null,
  memoriaActiva: true,
  config: { umbralConfianza: 0.6, maxIntercambios: 8, horarioDesde: 8, horarioHasta: 18 },
};

interface Estado {
  hilo: { solicitud: unknown; mensajes: MensajeCrm[] };
  ficha: FichaConversacion;
  memorias: MemoriaLista[];
  ajustes: Omit<AjustesConversacionVista, 'success'>;
}

const BASE: Estado = {
  hilo: { solicitud: SOLICITUD, mensajes: [MENSAJE] },
  ficha: FICHA,
  memorias: MEMORIAS,
  ajustes: AJUSTES,
};

const fetchMock = vi.fn();

function hiloBody(estado: Estado): string {
  return JSON.stringify({
    success: true,
    conversacion: CONVERSACION,
    mensajes: estado.hilo.mensajes,
    solicitudAyuda: estado.hilo.solicitud,
  });
}

/** Router-style stub: routes "METHOD /path" keys to handlers/bodies. */
function enrutar(rutas: Record<string, unknown | ((init?: RequestInit) => unknown)>): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const clave = `${init?.method ?? 'GET'} ${url.replace('http://localhost', '')}`;
    const ruta = rutas[clave];
    if (ruta === undefined) {
      return new Response(JSON.stringify({ success: false, error: `ruta no stubbeada: ${clave}` }), {
        status: 500,
      });
    }
    const cuerpo = typeof ruta === 'function' ? (ruta as (i?: RequestInit) => unknown)(init) : ruta;
    const status = typeof cuerpo === 'number' ? cuerpo : 200;
    const json = typeof cuerpo === 'number' ? { success: false, error: `fallo ${status}` } : cuerpo;
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

/** Manifiesto vivo: los GET leen de ESTE objeto (los refetch ven lo nuevo). */
function rutasBase(estado: Estado): Record<string, unknown> {
  return {
    'GET /api/crm/conversaciones/7': () => ({
      success: true,
      conversacion: CONVERSACION,
      mensajes: estado.hilo.mensajes,
      solicitudAyuda: estado.hilo.solicitud,
    }),
    'GET /api/crm/conversaciones/7/ficha': () => ({ success: true, ...estado.ficha }),
    'GET /api/crm/conversaciones/7/memorias': () => ({
      success: true,
      memorias: estado.memorias,
      empresaId: 7,
    }),
    'GET /api/crm/conversaciones/7/ajustes': () => ({ success: true, ...estado.ajustes }),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useHiloConversacion — carga del hilo + laterales (E3·T5)', () => {
  it('seleccionar la conversación carga hilo (con solicitudAyuda) + ficha/memorias/ajustes', async () => {
    enrutar(rutasBase(BASE));

    const { result } = renderHook(() => useHiloConversacion(7, null));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hilo?.solicitudAyuda).toMatchObject({ id: 9, consulta: '¿crédito fiscal a 30 días?' });
    await waitFor(() => expect(result.current.statusFicha).toBe('ready'));
    expect(result.current.ficha).toMatchObject({ conversacionId: 7 });
    await waitFor(() => expect(result.current.statusMemorias).toBe('ready'));
    expect(result.current.memorias).toHaveLength(1);
    await waitFor(() => expect(result.current.statusAjustes).toBe('ready'));
    expect(result.current.ajustes?.config.maxIntercambios).toBe(8);
  });

  it('mensajes que crecen (llega respuesta de la Guía) → refetch de ficha/memorias', async () => {
    const estado = structuredClone(BASE);
    const rutas = rutasBase(estado);
    let getsFicha = 0;
    const original = rutas['GET /api/crm/conversaciones/7/ficha'] as (init?: RequestInit) => unknown;
    rutas['GET /api/crm/conversaciones/7/ficha'] = (init?: RequestInit) => {
      getsFicha += 1;
      return original(init);
    };
    enrutar(rutas);

    const { result, rerender } = renderHook(({ id, version }) => useHiloConversacion(id, version), {
      initialProps: { id: 7 as number | null, version: 'v1' as string | null },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(getsFicha).toBe(1));

    // Actividad nueva: el listado cambia ultimoMensajeEn (versionActividad)
    // y el hilo refetchado trae la respuesta de la Guía (mensaje extra).
    estado.hilo.mensajes = [...estado.hilo.mensajes, { ...MENSAJE, id: 4, direccion: 'OUT', emisor: 'IA' }];
    rerender({ id: 7, version: 'v2' });

    await waitFor(() => expect(result.current.hilo?.mensajes).toHaveLength(2));
    await waitFor(() => expect(getsFicha).toBe(2));
  });

  it('laterales que fallan (404/503) → error inline por panel, sin crashear', async () => {
    enrutar({
      'GET /api/crm/conversaciones/7': rutasBase(BASE)['GET /api/crm/conversaciones/7'],
      'GET /api/crm/conversaciones/7/ficha': 404,
      'GET /api/crm/conversaciones/7/memorias': 503,
      'GET /api/crm/conversaciones/7/ajustes': 500,
    });

    const { result } = renderHook(() => useHiloConversacion(7, null));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.statusFicha).toBe('error'));
    expect(result.current.errorFicha).toContain('404');
    await waitFor(() => expect(result.current.statusMemorias).toBe('error'));
    expect(result.current.errorMemorias).toContain('503');
    await waitFor(() => expect(result.current.statusAjustes).toBe('error'));
    // El hilo sigue sano: un panel caído no tumba la columna central.
    expect(result.current.hilo?.mensajes).toHaveLength(1);
  });
});

describe('useHiloConversacion — enviarIndicacion (E3·T5)', () => {
  it('POST indicacion → refetch del hilo (la solicitud desaparece) + memorias', async () => {
    const estado = structuredClone(BASE);
    const rutas = rutasBase(estado);
    rutas['POST /api/crm/conversaciones/7/indicacion'] = () => {
      estado.hilo.solicitud = null; // el refetch ya no la ve
      return { success: true, solicitud: { id: 9, estado: 'RESUELTA' } };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.hilo?.solicitudAyuda).not.toBeNull());

    let ok = false;
    await act(async () => {
      ok = await result.current.enviarIndicacion('Decile que sí, con presentación el jueves');
    });

    expect(ok).toBe(true);
    expect(result.current.enviandoIndicacion).toBe(false);
    await waitFor(() => expect(result.current.hilo?.solicitudAyuda).toBeNull());
  });

  it('fallo del POST → errorIndicacion + false (sin refetch)', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/indicacion'] = 409;
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.enviarIndicacion('x');
    });

    expect(ok).toBe(false);
    expect(result.current.errorIndicacion).not.toBeNull();
    expect(result.current.hilo?.solicitudAyuda).not.toBeNull();
  });
});

describe('useHiloConversacion — tomar/devolver/escalar (E3·T5)', () => {
  it('tomar → POST + refetch de hilo y ajustes', async () => {
    const estado = structuredClone(BASE);
    const rutas = rutasBase(estado);
    rutas['POST /api/crm/conversaciones/7/tomar'] = () => {
      Object.assign(estado.hilo, { solicitud: null });
      estado.ajustes = { ...estado.ajustes, estado: 'TOMADA_HUMANO', modo: 'HUMANO', asignadaA: 'juana' };
      return { success: true, estado: 'TOMADA_HUMANO', asignadaA: 'juana' };
    };
    // El GET del hilo refleja el post-tomar.
    rutas['GET /api/crm/conversaciones/7'] = () => ({
      success: true,
      conversacion: { ...CONVERSACION, estado: 'TOMADA_HUMANO', asignadaA: 'juana', modo: 'HUMANO' },
      mensajes: estado.hilo.mensajes,
      solicitudAyuda: estado.hilo.solicitud,
    });
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = false;
    await act(async () => {
      ok = await result.current.tomar();
    });

    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.hilo?.conversacion.estado).toBe('TOMADA_HUMANO'));
    await waitFor(() => expect(result.current.ajustes?.asignadaA).toBe('juana'));
  });

  it('escalar con error 400 → errorTransicion + false', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/escalar'] = 400;
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.escalar('desconocido');
    });

    expect(ok).toBe(false);
    expect(result.current.errorTransicion).not.toBeNull();
  });
});

describe('useHiloConversacion — ficha y ajustes (E3·T5)', () => {
  it('confirmarDatoFicha → POST ficha y adopta la ficha refrescada de la respuesta', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/ficha'] = (init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body ?? '{}')) as { campo: CampoFicha; valor: string };
      return {
        success: true,
        ...FICHA,
        datos: {
          ...FICHA.datos,
          [cuerpo.campo]: { valor: cuerpo.valor, origen: 'HUMANO', confirmado: true },
        },
      };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.statusFicha).toBe('ready'));

    let ok = false;
    await act(async () => {
      ok = await result.current.confirmarDatoFicha('cargo', 'Jefe de RRHH');
    });

    expect(ok).toBe(true);
    expect(result.current.ficha?.datos.cargo).toEqual({ valor: 'Jefe de RRHH', origen: 'HUMANO', confirmado: true });
    expect(result.current.errorConfirmacionFicha).toBeNull();
  });

  it('confirmarDatoFicha falla (409) → errorConfirmacionFicha + false', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/ficha'] = 409;
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.statusFicha).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.confirmarDatoFicha('trabajadores', '120');
    });

    expect(ok).toBe(false);
    expect(result.current.errorConfirmacionFicha).not.toBeNull();
  });

  it('toggleMemoriaActiva → POST ajustes y adopta los ajustes refrescados', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/ajustes'] = { success: true, ...AJUSTES, memoriaActiva: false };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.statusAjustes).toBe('ready'));

    let ok = false;
    await act(async () => {
      ok = await result.current.toggleMemoriaActiva(false);
    });

    expect(ok).toBe(true);
    expect(result.current.ajustes?.memoriaActiva).toBe(false);
  });

  it('toggleMemoriaActiva falla → false + errorToggleMemoria (el caller revierte el optimista)', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/ajustes'] = 500;
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.statusAjustes).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.toggleMemoriaActiva(false);
    });

    expect(ok).toBe(false);
    expect(result.current.errorToggleMemoria).not.toBeNull();
  });
});

describe('useHiloConversacion — memorias del panel (E3·T5)', () => {
  it('pinearMemoria → POST + GET refetch (la fila vuelve pineada)', async () => {
    const estado = structuredClone(BASE);
    estado.memorias = [{ ...MEMORIAS[0]!, pineada: false }];
    const rutas = rutasBase(estado);
    rutas['POST /api/crm/conversaciones/7/memorias'] = () => {
      estado.memorias = [{ ...MEMORIAS[0]!, pineada: true }];
      return { ok: true };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.statusMemorias).toBe('ready'));
    expect(result.current.memorias[0]?.pineada).toBe(false);

    let ok = false;
    await act(async () => {
      ok = await result.current.pinearMemoria(101);
    });

    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.memorias[0]?.pineada).toBe(true));
  });

  it('guardarMemoria EDIT (reemplazaObservacionId) → eliminar + guardar + refetch', async () => {
    const estado = structuredClone(BASE);
    const llamadas: Array<Record<string, unknown>> = [];
    const rutas = rutasBase(estado);
    rutas['POST /api/crm/conversaciones/7/memorias'] = (init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      llamadas.push(cuerpo);
      if (cuerpo.accion === 'eliminar') estado.memorias = [];
      if (cuerpo.accion === 'guardar') {
        estado.memorias = [
          { id: 900, nivel: 'empresa', tipo: 'acuerdo', titulo: 'Editada', contenido: 'Nuevo contenido', pineada: false, creadoEn: '2026-06-12T10:00:00.000Z' },
        ];
      }
      return cuerpo.accion === 'guardar' ? { ok: true, id: 900 } : { ok: true };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.statusMemorias).toBe('ready'));

    let ok = false;
    await act(async () => {
      ok = await result.current.guardarMemoria({
        nivel: 'empresa',
        tipo: 'acuerdo',
        titulo: 'Editada',
        contenido: 'Nuevo contenido',
        reemplazaObservacionId: 101,
      });
    });

    expect(ok).toBe(true);
    expect(llamadas.map((l) => l.accion)).toEqual(['eliminar', 'guardar']);
    await waitFor(() => expect(result.current.memorias[0]?.titulo).toBe('Editada'));
  });

  it('eliminarMemoria falla (404 ajena) → errorMemoriaAccion + false', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/memorias'] = 404;
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.statusMemorias).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.eliminarMemoria(101);
    });

    expect(ok).toBe(false);
    expect(result.current.errorMemoriaAccion).not.toBeNull();
  });
});

describe('useHiloConversacion — usuarios asignables (lazy, E3·T5)', () => {
  it('no se cargan al seleccionar; cargarUsuariosAsignables las trae una vez', async () => {
    let gets = 0;
    const rutas = rutasBase(BASE);
    rutas['GET /api/crm/conversaciones/usuarios-asignables'] = () => {
      gets += 1;
      return { success: true, usuarios: [{ id: 'juana', nombre: 'Juana Perez' }] };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.statusAjustes).toBe('ready'));
    expect(gets).toBe(0);
    expect(result.current.usuariosAsignables).toEqual([]);

    act(() => result.current.cargarUsuariosAsignables());
    await waitFor(() => expect(result.current.statusUsuarios).toBe('ready'));
    expect(result.current.usuariosAsignables).toEqual([{ id: 'juana', nombre: 'Juana Perez' }]);
    expect(gets).toBe(1);

    // Segunda llamada: ya hay datos → no re-pide.
    act(() => result.current.cargarUsuariosAsignables());
    await new Promise((r) => setTimeout(r, 10));
    expect(gets).toBe(1);
  });
});

describe('useHiloConversacion — marcar respuesta deficiente (E4·T5)', () => {
  const MENSAJE_IA: MensajeCrm = {
    id: 4,
    conversacionId: 7,
    direccion: 'OUT',
    emisor: 'IA',
    cuerpo: 'Respuesta de la Guía',
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: 'wamid.4',
    idempotenciaKey: null,
    estadoEnvio: 'ENVIADO',
    fuentes: null,
    score: 0.8,
    modelo: 'glm',
    creadoEn: '2026-10-11T10:05:00Z',
  };

  it('marcarDeficiente → POST {mensajeId}, devuelve el huecoId y refetcha el hilo (la fila llega deficiente)', async () => {
    const estado = structuredClone(BASE);
    estado.hilo.mensajes = [MENSAJE_IA];
    const rutas = rutasBase(estado);
    rutas['POST /api/crm/conversaciones/7/deficiente'] = (init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body ?? '{}')) as { mensajeId: number };
      expect(cuerpo).toEqual({ mensajeId: 4 });
      // El GET del hilo refleja el post-marca (la burbuja lo muestra).
      estado.hilo.mensajes = [{ ...MENSAJE_IA, deficiente: true }];
      return { success: true, huecoId: 61, mensajeId: 4 };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let huecoId: number | null = null;
    await act(async () => {
      huecoId = await result.current.marcarDeficiente(4);
    });

    expect(huecoId).toBe(61);
    expect(result.current.errorDeficiente).toBeNull();
    await waitFor(() =>
      expect(result.current.hilo?.mensajes.find((m) => m.id === 4)?.deficiente).toBe(true),
    );
  });

  it('409 (ya marcada) → null + errorDeficiente con el mensaje del servidor', async () => {
    const estado = structuredClone(BASE);
    estado.hilo.mensajes = [MENSAJE_IA];
    const rutas = rutasBase(estado);
    rutas['POST /api/crm/conversaciones/7/deficiente'] = {
      success: false,
      error: 'La respuesta ya fue marcada como deficiente',
      code: 'CONFLICT_ERROR',
    };
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let huecoId: number | null = 99;
    await act(async () => {
      huecoId = await result.current.marcarDeficiente(4);
    });

    expect(huecoId).toBeNull();
    expect(result.current.errorDeficiente).toBe('La respuesta ya fue marcada como deficiente');
    await waitFor(() =>
      expect(result.current.hilo?.mensajes.find((m) => m.id === 4)?.deficiente).toBeFalsy(),
    );
  });

  it('limpiarErrorDeficiente limpia el error inline', async () => {
    const rutas = rutasBase(BASE);
    rutas['POST /api/crm/conversaciones/7/deficiente'] = 400;
    enrutar(rutas);

    const { result } = renderHook(() => useHiloConversacion(7, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.marcarDeficiente(3);
    });
    expect(result.current.errorDeficiente).not.toBeNull();

    act(() => result.current.limpiarErrorDeficiente());
    expect(result.current.errorDeficiente).toBeNull();
  });
});
