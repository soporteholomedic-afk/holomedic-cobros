import { describe, expect, it } from 'vitest';

import { ObtenerResumenNotificacionesUseCase } from '../obtenerResumenNotificaciones';
import type {
  ConversacionListada,
  ResumenNotificaciones,
  SolicitudAyuda,
} from '../../domain/entities';
import type { ListadoConversaciones } from '../../domain/ports';

/**
 * Use-case contract for obtenerResumenNotificaciones (agente-ia-crm
 * E3·T3 + E3·T6 detalle): {requiereAyuda (estado REQUIERE_HUMANO),
 * pendienteVinculacion (estado PENDIENTE_VINCULACION), total,
 * ultimaActividad (MAX ultimoMensajeEn)} PLUS the E3·T6
 * `requiereAyudaDetalle` — top 5 REQUIERE_HUMANO conversations by
 * ultimoMensajeEn DESC (repo `listar` already supports the estado
 * filter: NO new repo method), each with the display etiqueta
 * (razonSocial → nombreContacto → telefono) and the pending
 * solicitud's consulta joined via obtenerSolicitudAyudaPendiente
 * (null when the capability or the row is absent). A repo without the
 * E3 count capability fails loudly (aplicarIndicacion precedent: a
 * silent zero badge would hide escalations).
 */

interface SemillaConteo {
  requiereAyuda: number;
  pendienteVinculacion: number;
  total: number;
  ultimaActividad: Date | null;
}

class FakeConversacionesConteo {
  resumen: SemillaConteo | undefined;
  /** Filas que el fake `listar` devuelve (ya ordenadas por el repo real). */
  pendientes: ConversacionListada[] = [];
  /** conversacionId → consulta de la solicitud PENDIENTE (null = sin fila). */
  consultas = new Map<number, string | null>();
  /** Filtros recibidos por listar — para pisar el contrato estado+limite. */
  filtrosRecibidos: unknown[] = [];

  async contarResumen(): Promise<SemillaConteo> {
    if (this.resumen === undefined) throw new Error('no sembrado');
    return this.resumen;
  }

  async listar(filtros?: unknown): Promise<ListadoConversaciones> {
    this.filtrosRecibidos.push(filtros);
    const limite = (filtros as { limite?: number } | undefined)?.limite;
    // El repo real hace TOP (@limite) + ORDER BY ultimoMensajeEn DESC:
    // el fake respeta el límite para que el slice defensivo del use
    // case nunca enmascare un repo que ignora `limite`.
    return { items: this.pendientes.slice(0, limite ?? 50), total: this.pendientes.length };
  }

  async obtenerSolicitudAyudaPendiente(conversacionId: number): Promise<SolicitudAyuda | null> {
    if (!this.consultas.has(conversacionId)) return null;
    const consulta = this.consultas.get(conversacionId);
    if (consulta === null || consulta === undefined) return null;
    // Solicitud mínima válida: el use case solo lee `consulta`.
    return {
      id: conversacionId,
      conversacionId,
      mensajeId: null,
      consulta,
      terminosBuscados: [],
      score: null,
      estado: 'PENDIENTE',
      indicacion: null,
      resueltaPor: null,
      creadoEn: new Date('2026-06-15T12:00:00.000Z'),
      resueltaEn: null,
    };
  }
}

function filaPendiente(overrides: Partial<ConversacionListada> = {}): ConversacionListada {
  return {
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
    noLeidos: 1,
    creadoEn: '2026-10-11T10:00:00.000Z',
    actualizadoEn: '2026-10-11T14:02:00.000Z',
    razonSocial: 'ACME S.A.',
    nombreContacto: 'Ana López',
    ...overrides,
  };
}

describe('ObtenerResumenNotificacionesUseCase — badge de la bandeja (E3·T3)', () => {
  it('mapea el conteo del repo: Date → ISO string, null → null (+ detalle vacío)', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = {
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: new Date('2026-06-15T12:30:00.000Z'),
    };

    const resumen = await new ObtenerResumenNotificacionesUseCase({
      conversaciones: repo,
    }).ejecutar();

    expect(resumen).toEqual({
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: '2026-06-15T12:30:00.000Z',
      requiereAyudaDetalle: [],
    } satisfies ResumenNotificaciones);
  });

  it('sin conversaciones → ultimaActividad null (MAX sobre conjunto vacío)', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = { requiereAyuda: 0, pendienteVinculacion: 0, total: 0, ultimaActividad: null };

    await expect(
      new ObtenerResumenNotificacionesUseCase({ conversaciones: repo }).ejecutar(),
    ).resolves.toEqual({
      requiereAyuda: 0,
      pendienteVinculacion: 0,
      total: 0,
      ultimaActividad: null,
      requiereAyudaDetalle: [],
    });
  });

  it('repo sin la capacidad contarResumen (pre-E3) → falla explícito (jamás un badge en cero mintiendo)', async () => {
    // Repo pre-E3 realista: listar existía desde E1, contarResumen no.
    const sinCapacidad = {
      conversaciones: {
        listar: async (): Promise<ListadoConversaciones> => ({ items: [], total: 0 }),
      },
    };

    await expect(
      new ObtenerResumenNotificacionesUseCase(sinCapacidad).ejecutar(),
    ).rejects.toThrow(/contarResumen/);
  });
});

describe('ObtenerResumenNotificacionesUseCase — requiereAyudaDetalle (E3·T6)', () => {
  it('listar con estado REQUIERE_HUMANO + limite 5 y mapea cada fila (orden del repo)', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = { requiereAyuda: 2, pendienteVinculacion: 0, total: 40, ultimaActividad: null };
    repo.pendientes = [
      filaPendiente({ id: 7, ultimoMensajeEn: '2026-10-11T14:05:00.000Z' }),
      filaPendiente({ id: 8, ultimoMensajeEn: '2026-10-11T14:02:00.000Z' }),
    ];
    repo.consultas.set(7, 'Crédito fiscal a 30 días');

    const resumen = await new ObtenerResumenNotificacionesUseCase({
      conversaciones: repo,
    }).ejecutar();

    // El use case NO inventa queries: pisa el contrato del port (estado
    // + tope) sobre el MISMO listar de la bandeja.
    expect(repo.filtrosRecibidos).toEqual([{ estado: 'REQUIERE_HUMANO', limite: 5 }]);
    expect(resumen.requiereAyudaDetalle).toEqual([
      { conversacionId: 7, etiqueta: 'ACME S.A.', consulta: 'Crédito fiscal a 30 días' },
      { conversacionId: 8, etiqueta: 'ACME S.A.', consulta: null },
    ]);
  });

  it('etiqueta: razonSocial → nombreContacto → telefono → "Sin identificar"', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = { requiereAyuda: 3, pendienteVinculacion: 0, total: 40, ultimaActividad: null };
    repo.pendientes = [
      filaPendiente({ id: 7, razonSocial: null }),
      filaPendiente({ id: 8, razonSocial: null, nombreContacto: null, telefono: '+595981111111' }),
      filaPendiente({ id: 9, razonSocial: null, nombreContacto: null, telefono: null }),
    ];

    const resumen = await new ObtenerResumenNotificacionesUseCase({
      conversaciones: repo,
    }).ejecutar();

    expect(resumen.requiereAyudaDetalle).toEqual([
      { conversacionId: 7, etiqueta: 'Ana López', consulta: null },
      { conversacionId: 8, etiqueta: '+595981111111', consulta: null },
      { conversacionId: 9, etiqueta: 'Sin identificar', consulta: null },
    ]);
  });

  it('capa el detalle en 5 filas aunque el repo devuelva más', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = { requiereAyuda: 9, pendienteVinculacion: 0, total: 40, ultimaActividad: null };
    repo.pendientes = Array.from({ length: 8 }, (_, i) => filaPendiente({ id: i + 1 }));

    const resumen = await new ObtenerResumenNotificacionesUseCase({
      conversaciones: repo,
    }).ejecutar();

    expect(resumen.requiereAyudaDetalle).toHaveLength(5);
    expect(resumen.requiereAyudaDetalle?.map((d) => d.conversacionId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('consulta null cuando la conversación no tiene solicitud PENDIENTE', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = { requiereAyuda: 1, pendienteVinculacion: 0, total: 40, ultimaActividad: null };
    repo.pendientes = [filaPendiente({ id: 7 })];
    repo.consultas.set(7, null); // resolvió entre el conteo y el join

    const resumen = await new ObtenerResumenNotificacionesUseCase({
      conversaciones: repo,
    }).ejecutar();

    expect(resumen.requiereAyudaDetalle).toEqual([
      { conversacionId: 7, etiqueta: 'ACME S.A.', consulta: null },
    ]);
  });

  it('repo sin la capacidad obtenerSolicitudAyudaPendiente → detalle con consulta null (degradación grácil)', async () => {
    const repo = new FakeConversacionesConteo();
    const resumenEsperado: SemillaConteo = {
      requiereAyuda: 1,
      pendienteVinculacion: 0,
      total: 40,
      ultimaActividad: null,
    };
    repo.resumen = resumenEsperado;
    repo.pendientes = [filaPendiente({ id: 7 })];

    // Pre-E3 fake: listar sí, solicitud no — el Pick mantiene el
    // método opcional, así que el objeto sin él sigue tipando.
    const sinSolicitud = {
      conversaciones: {
        contarResumen: () => repo.contarResumen(),
        listar: () => repo.listar({ estado: 'REQUIERE_HUMANO', limite: 5 }),
      },
    };

    const resumen = await new ObtenerResumenNotificacionesUseCase(sinSolicitud).ejecutar();

    expect(resumen.requiereAyudaDetalle).toEqual([
      { conversacionId: 7, etiqueta: 'ACME S.A.', consulta: null },
    ]);
  });
});
