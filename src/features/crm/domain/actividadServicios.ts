import { UMBRAL_MESES_INACTIVIDAD, type Relacion } from './entities';

/**
 * Service-activity state of an empresa, derived from SIGLA attention data —
 * never from calls or emails (regla S6.6) and never by inventing inactivity
 * when there is no data (regla S6.7).
 */
export const ESTADOS_ATENCION = [
  'sin_informacion',
  'pendiente_primera',
  'reciente',
  'sin_actividad',
] as const;
export type EstadoAtencion = (typeof ESTADOS_ATENCION)[number];

export const ESTADO_ATENCION_LABELS: Record<EstadoAtencion, string> = {
  sin_informacion: 'Sin información',
  pendiente_primera: 'Pendiente de primera atención',
  reciente: 'Actividad reciente',
  sin_actividad: 'Sin actividad de servicios reciente',
};

export interface ActividadServicios {
  /** ISO date (`YYYY-MM-DD`, Lima) of the last performed service; NULL when SIGLA has none. */
  ultimaAtencion: string | null;
  /** RUC the lookup ran against; NULL when the empresa has no RUC. */
  ruc: string | null;
}

/**
 * Derive the display state of the service activity.
 *
 * - Prospectos (and any empresa without a RUC) show "Sin información": the
 *   signal only means something for clientes.
 * - A cliente whose RUC has NO attention at all in SIGLA is "Pendiente de
 *   primera atención" — e.g. a freshly captured client that has not sent its
 *   first worker yet. It is never called inactive.
 * - A cliente with attention data is "reciente" within
 *   `UMBRAL_MESES_INACTIVIDAD` months, "sin actividad" beyond that.
 *
 * @param hoy Anchor date (Lima calendar day) used for the month threshold.
 */
export function estadoActividadServicios(
  relacion: Relacion,
  actividad: ActividadServicios,
  hoy: Date,
): EstadoAtencion {
  if (relacion !== 'cliente' || actividad.ruc === null || actividad.ultimaAtencion === null) {
    return 'sin_informacion';
  }
  const meses = mesesEntre(new Date(`${actividad.ultimaAtencion}T00:00:00Z`), hoy);
  return meses >= UMBRAL_MESES_INACTIVIDAD ? 'sin_actividad' : 'reciente';
}

/** Whole months elapsed from `desde` (UTC) to `hasta`. Negative when `hasta` is earlier. */
function mesesEntre(desde: Date, hasta: Date): number {
  let meses =
    (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - desde.getUTCMonth());
  if (hasta.getUTCDate() < desde.getUTCDate()) meses -= 1;
  return meses;
}
