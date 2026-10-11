import type {
  ConversacionListada,
  DetalleAyudaNotificacion,
  ResumenNotificaciones,
} from '../domain/entities';
import type { ConversacionCrmRepository } from '../domain/ports';

/** E3·T6: the detalle window caps at 5 rows (toast noise stays bounded). */
export const TOPE_DETALLE_AYUDA = 5;

/**
 * ObtenerResumenNotificacionesUseCase (agente-ia-crm E3·T3 + E3·T6) —
 * the read behind GET /api/crm/conversaciones/notificaciones: counts
 * over CRM_Conversaciones — requiereAyuda (estado REQUIERE_HUMANO),
 * pendienteVinculacion (estado PENDIENTE_VINCULACION), total and the
 * latest activity tick — in ONE repo roundtrip (contarResumen, single
 * SELECT with conditional COUNTs). E3·T6 adds `requiereAyudaDetalle`:
 * the top TOPE_DETALLE_AYUDA escalated conversations by
 * ultimoMensajeEn DESC, reusing the SAME `listar` the bandeja reads
 * (it already supports the estado filter — NO new repo method) and
 * joining the pending solicitud's `consulta` per row via
 * `obtenerSolicitudAyudaPendiente` (sequential awaits — at most 5;
 * null when the capability is absent so pre-E3 fakes degrade
 * gracefully). Presentation mapping (Date → ISO string, null stays
 * null) lives HERE; the repo keeps the raw Date. A repo without the
 * E3 count capability fails loudly (aplicarIndicacion precedent: a
 * silent zero badge would hide escalations).
 */

export interface ObtenerResumenNotificacionesDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'contarResumen' | 'listar' | 'obtenerSolicitudAyudaPendiente'
  >;
}

/**
 * Display etiqueta for one escalated row (E3·T6): razonSocial →
 * nombreContacto → telefono — the same chain the bandeja derives for
 * display; the ultimate fallback keeps the toast title well-formed.
 */
function derivarEtiqueta(fila: ConversacionListada): string {
  if (fila.razonSocial !== null) return fila.razonSocial;
  if (fila.nombreContacto !== null) return fila.nombreContacto;
  if (fila.telefono !== null) return fila.telefono;
  return 'Sin identificar';
}

export class ObtenerResumenNotificacionesUseCase {
  constructor(private readonly deps: ObtenerResumenNotificacionesDeps) {}

  async ejecutar(): Promise<ResumenNotificaciones> {
    const contarResumen = this.deps.conversaciones.contarResumen;
    if (contarResumen === undefined) {
      throw new Error(
        'obtenerResumenNotificaciones requiere un repositorio con contarResumen (capacidad E3)',
      );
    }
    const conteo = await contarResumen.call(this.deps.conversaciones);

    // E3·T6 detalle: listar already orders by ultimoMensajeEn DESC and
    // honors `limite`; the slice is the defensive cap so a repo that
    // ignores the limit can still not grow the toast window.
    const pendientes = await this.deps.conversaciones.listar({
      estado: 'REQUIERE_HUMANO',
      limite: TOPE_DETALLE_AYUDA,
    });
    const obtenerPendiente = this.deps.conversaciones.obtenerSolicitudAyudaPendiente;
    const requiereAyudaDetalle: DetalleAyudaNotificacion[] = [];
    for (const fila of pendientes.items.slice(0, TOPE_DETALLE_AYUDA)) {
      let consulta: string | null = null;
      if (obtenerPendiente !== undefined) {
        const solicitud = await obtenerPendiente.call(this.deps.conversaciones, fila.id);
        consulta = solicitud === null ? null : solicitud.consulta;
      }
      requiereAyudaDetalle.push({
        conversacionId: fila.id,
        etiqueta: derivarEtiqueta(fila),
        consulta,
      });
    }

    return {
      requiereAyuda: conteo.requiereAyuda,
      pendienteVinculacion: conteo.pendienteVinculacion,
      total: conteo.total,
      ultimaActividad: conteo.ultimaActividad === null ? null : conteo.ultimaActividad.toISOString(),
      requiereAyudaDetalle,
    };
  }
}
