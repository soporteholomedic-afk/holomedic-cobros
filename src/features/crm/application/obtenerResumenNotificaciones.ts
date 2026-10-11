import type { ResumenNotificaciones } from '../domain/entities';
import type { ConversacionCrmRepository } from '../domain/ports';

/**
 * ObtenerResumenNotificacionesUseCase (agente-ia-crm E3·T3) — the
 * bandeja badge read behind GET /api/crm/conversaciones/notificaciones:
 * counts over CRM_Conversaciones — requiereAyuda (estado
 * REQUIERE_HUMANO), pendienteVinculacion (estado
 * PENDIENTE_VINCULACION), total and the latest activity tick — in ONE
 * repo roundtrip (contarResumen, single SELECT with conditional
 * COUNTs). Presentation mapping (Date → ISO string, null stays null)
 * lives HERE; the repo keeps the raw Date. A repo without the E3
 * count capability fails loudly (aplicarIndicacion precedent: a
 * silent zero badge would hide escalations).
 */

export interface ObtenerResumenNotificacionesDeps {
  conversaciones: Pick<ConversacionCrmRepository, 'contarResumen'>;
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
    return {
      requiereAyuda: conteo.requiereAyuda,
      pendienteVinculacion: conteo.pendienteVinculacion,
      total: conteo.total,
      ultimaActividad: conteo.ultimaActividad === null ? null : conteo.ultimaActividad.toISOString(),
    };
  }
}
