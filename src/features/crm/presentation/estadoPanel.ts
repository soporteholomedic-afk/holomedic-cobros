import type { Etapa, Flujo } from '../domain/entities';
import { formatearFecha } from './etiquetas';

/**
 * estadoPanel (tasks 6.1/6.2, design D1, spec crm-status-derivation) —
 * PURE presentation derivation: machine state → exactly ONE panel
 * status + its row actions. The T1–T16 machine, cadence math and
 * audit stay untouched (SD-1); this module only READS the pipeline
 * projection. A pipeline-less empresa carries ALL pipeline fields
 * null (priority row 0).
 *
 * Priority table (first match wins):
 *  0 no pipeline row            → sin_carta          [Enviar carta, ficha]
 *  1 ACEPTADO                   → respondio_positivo [Ver Ficha]
 *  2 RECHAZADO cooldown FUTURE  → respondio_negativo [Ver Ficha]
 *  3 RECHAZADO expired/null     → en_pausa_3m        [Reactivar ya, ficha]
 *  4 DESCANSO (any marker)      → en_pausa_3m        [Reactivar ya, ficha]
 *  5 PRESENTACION/CONFIRMADA/   → avanzado           [ficha]
 *    ENTREGADA/DATOS (the badge
 *    label resolves via ETIQUETA_ETAPA at render time)
 *  6 NUEVO/REGISTRADO envios=0 fechaCicloInicio=null → sin_carta
 *  7 NUEVO/REGISTRADO envios=0 fechaCicloInicio≠null → reactivado
 *    (fechaCicloInicio≠null is THE discriminator: T13/T15 preserve
 *    the old arm date while fresh rows are born null — without it the
 *    Reactivados tab could never populate)
 *  8–11 CADENCIA/SEGUIMIENTO envios 1/2/3/≥4 → carta_enviada /
 *    seguimiento_1 / seguimiento_2 / seguimiento_3 (≥4 = inbound rows
 *    that keep sending with a manual "Pausar 3m")
 */

export type EstadoPanel =
  | 'sin_carta'
  | 'carta_enviada'
  | 'seguimiento_1'
  | 'seguimiento_2'
  | 'seguimiento_3'
  | 'respondio_positivo'
  | 'en_pausa_3m'
  | 'reactivado'
  | 'respondio_negativo'
  | 'avanzado';

/** Row buttons the table renders for a status (spec OP-4 action table). */
export type AccionFila =
  | 'enviar_carta'
  | 'sumar_semana'
  | 'registrar_respuesta'
  | 'pausar_3m'
  | 'reactivar'
  | 'ver_ficha';

export interface EntradaEstadoPanel {
  flujo: Flujo | null;
  etapa: Etapa | null;
  enviosCiclo: number | null;
  ciclo: number | null;
  fechaCicloInicio: string | null;
  descansoHasta: string | null;
  rechazadoHasta: string | null;
  hoy: string;
}

export const ACCIONES_POR_ESTADO: Record<EstadoPanel, readonly AccionFila[]> = {
  sin_carta: ['enviar_carta', 'ver_ficha'],
  carta_enviada: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
  seguimiento_1: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
  seguimiento_2: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
  seguimiento_3: ['registrar_respuesta', 'pausar_3m', 'ver_ficha'],
  respondio_positivo: ['ver_ficha'],
  en_pausa_3m: ['reactivar', 'ver_ficha'],
  reactivado: ['registrar_respuesta', 'ver_ficha'],
  respondio_negativo: ['ver_ficha'],
  avanzado: ['ver_ficha'],
};

const ETAPAS_AVANZADAS: ReadonlySet<Etapa> = new Set([
  'PRESENTACION',
  'CONFIRMADA',
  'ENTREGADA',
  'DATOS',
]);

/** `YYYY-MM-DD` strings compare lexicographically = chronologically. */
function venceDespues(marker: string | null, hoy: string): boolean {
  return marker !== null && marker > hoy;
}

export function derivarEstadoPanel(e: EntradaEstadoPanel): EstadoPanel {
  if (e.flujo === null || e.etapa === null) return 'sin_carta'; // row 0
  if (e.etapa === 'ACEPTADO') return 'respondio_positivo'; // row 1
  if (e.etapa === 'RECHAZADO') {
    return venceDespues(e.rechazadoHasta, e.hoy) ? 'respondio_negativo' : 'en_pausa_3m'; // rows 2/3
  }
  if (e.etapa === 'DESCANSO') return 'en_pausa_3m'; // row 4
  if (ETAPAS_AVANZADAS.has(e.etapa)) return 'avanzado'; // row 5
  if (e.etapa === 'NUEVO' || e.etapa === 'REGISTRADO') {
    if ((e.enviosCiclo ?? 0) === 0) {
      return e.fechaCicloInicio === null ? 'sin_carta' : 'reactivado'; // rows 6/7
    }
  }
  // Rows 8–11: cadence slots. Unreachable NUEVO/REGISTRADO envios≥1
  // clamps into send #1 — the derivation is total by construction.
  const envios = Math.max(e.enviosCiclo ?? 0, 1);
  if (envios >= 4) return 'seguimiento_3'; // row 11
  if (envios === 3) return 'seguimiento_2'; // row 10
  if (envios === 2) return 'seguimiento_1'; // row 9
  return 'carta_enviada'; // row 8
}

/** "En espera" bucket: row 5 + rows 8–11 (design D1 buckets). */
export function enBucketEnEspera(estado: EstadoPanel): boolean {
  return (
    estado === 'avanzado' ||
    estado === 'carta_enviada' ||
    estado === 'seguimiento_1' ||
    estado === 'seguimiento_2' ||
    estado === 'seguimiento_3'
  );
}

/** "Sin interés" bucket: the mock union negativo ∪ pausa (rows 2/3/4). */
export function enBucketSinInteres(estado: EstadoPanel): boolean {
  return estado === 'respondio_negativo' || estado === 'en_pausa_3m';
}

/** "Se reactiva:" date — descansoHasta (row 4) / rechazadoHasta (row
 * 3), dd/mm/yyyy; null when the status shows no reactivation. */
export function fechaReactivacion(e: EntradaEstadoPanel): string | null {
  if (derivarEstadoPanel(e) !== 'en_pausa_3m') return null;
  const iso = e.descansoHasta ?? e.rechazadoHasta;
  return iso === null ? null : formatearFecha(iso);
}

export interface PasoProximo {
  principal: string | null;
  secundario: string | null;
}

/** "Próximo paso" labels, verbatim from the design mock (spec OP-4).
 * avanzado reuses the positivo block (inbound advanced stages are
 * engaged leads — "Cliente esperando"); respondio_negativo leaves the
 * cell empty, as the mock does. */
export function proximoPaso(e: EntradaEstadoPanel): PasoProximo {
  switch (derivarEstadoPanel(e)) {
    case 'sin_carta':
      return { principal: 'Enviar carta hoy', secundario: null };
    case 'carta_enviada':
      return { principal: 'Toca Semana 1', secundario: 'Si no responde en 7 días' };
    case 'seguimiento_1':
      return { principal: 'Toca Semana 2', secundario: 'Si no responde en 7 días' };
    case 'seguimiento_2':
      return { principal: 'Toca Semana 3 (Fin)', secundario: 'Si no responde en 7 días' };
    case 'seguimiento_3':
      return { principal: 'Cumplió 3 semanas (Pausa)', secundario: 'Si no responde en 7 días' };
    case 'respondio_positivo':
    case 'avanzado':
      return { principal: 'Llamar o Cotizar', secundario: 'Cliente esperando' };
    case 'en_pausa_3m':
      return { principal: 'Se reactiva:', secundario: fechaReactivacion(e) ?? 'En 3 meses' };
    case 'reactivado':
      return { principal: 'Toca volver a contactar', secundario: 'Pasaron los 3 meses' };
    case 'respondio_negativo':
      return { principal: null, secundario: null };
  }
}
