import { ETAPAS_ABIERTAS, ETAPAS_CERRADAS, type AccionTipo, type Empresa, type EtapaOportunidad, type Oportunidad } from '../domain/entities';

/**
 * Pending-work alerts of the CRM, computed live from the stored
 * oportunidades joined with their empresas (feature crm-notificaciones,
 * S3/S4, rebased on the oportunidad model): no notification table, no cron —
 * an alert exists exactly while its underlying fact does, so acting on the
 * deal (registering the activity, answering, moving the stage) makes it
 * disappear on its own.
 *
 * Two signals (S3), both per OPORTUNIDAD:
 *
 * - `accion_vencida` / `accion_hoy`: `proximaAccion` overdue or due today on
 *   an OPEN deal (`ETAPAS_ABIERTAS`: contactado, en_seguimiento, cotizado);
 *   `por_contactar` has no follow-up yet and `ganada`/`perdida` are closed.
 * - `sin_responder`: an inbound contact (`faltaResponderDesde`) waiting at
 *   least `HORAS_SIN_RESPONDER` on a deal that is not closed — an inbound
 *   lead can arrive at any open stage and is never relevant once closed.
 *
 * Each alert carries the deal AND the empresa it belongs to, so the UI can
 * link into the ficha; a deal whose empresa is not in the list is dropped
 * (it could not be linked). Counts of `resumenDeAlertas` are per deal.
 *
 * Like the rest of the CRM application layer, none of this reads the clock:
 * the caller passes `hoy` (Lima calendar day, see `hoyEnLima`) and `ahora`.
 */

/** Inbound contacts wait this many hours before `sin_responder` fires. */
export const HORAS_SIN_RESPONDER = 48;

export type ClaseAlerta = 'accion_vencida' | 'accion_hoy' | 'sin_responder';

export interface AlertaCrm {
  idOportunidad: string;
  nombreOportunidad: string;
  idEmpresa: string;
  nombreEmpresa: string;
  clase: ClaseAlerta;
  etapa: EtapaOportunidad;
  /** Follow-up kind for `accion_*`; null for `sin_responder`. */
  tipoAccion: AccionTipo | null;
  /** Follow-up detail for `accion_*`; null for `sin_responder`. */
  detalle: string | null;
  /** `accion_*`: follow-up day (`YYYY-MM-DD`); `sin_responder`: ISO instant since we owe the reply. */
  fecha: string;
  /** `accion_vencida`: whole days late (0 for today); `sin_responder`: whole hours waiting. */
  atraso: number;
}

export interface ResumenAlertas {
  vencidas: number;
  hoy: number;
  sinResponder: number;
}

/** Whole days from `desde` to `hasta`, both `YYYY-MM-DD` (pure calendar math). */
const diasEntre = (desde: string, hasta: string): number => {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
};

/** Whole hours `ahora` is past the ISO instant `desde`. */
const horasDesde = (desde: string, ahora: Date): number =>
  Math.floor((ahora.getTime() - Date.parse(desde)) / 3_600_000);

const PESO_CLASE: Record<ClaseAlerta, number> = { accion_vencida: 0, accion_hoy: 1, sin_responder: 2 };

/**
 * All pending alerts of the board, ready to render or notify: vencidas first
 * (oldest day first), then today's (by empresa name), then unanswered inbound
 * (longest wait first).
 */
export function calcularAlertas(oportunidades: Oportunidad[], empresas: Empresa[], hoy: string, ahora: Date): AlertaCrm[] {
  const nombreDe = new Map(empresas.map((e) => [e.idEmpresa, e.razonSocial]));
  const alertas: AlertaCrm[] = [];
  for (const o of oportunidades) {
    const nombreEmpresa = nombreDe.get(o.idEmpresa);
    if (nombreEmpresa === undefined) continue;
    const abierta = ETAPAS_ABIERTAS.includes(o.etapa);
    if (abierta && o.proximaAccion) {
      const atraso = diasEntre(o.proximaAccion.fecha, hoy);
      if (atraso >= 0) {
        alertas.push({
          idOportunidad: o.idOportunidad,
          nombreOportunidad: o.nombre,
          idEmpresa: o.idEmpresa,
          nombreEmpresa,
          clase: atraso === 0 ? 'accion_hoy' : 'accion_vencida',
          etapa: o.etapa,
          tipoAccion: o.proximaAccion.tipo,
          detalle: o.proximaAccion.detalle,
          fecha: o.proximaAccion.fecha,
          atraso,
        });
      }
    }
    if (!ETAPAS_CERRADAS.includes(o.etapa) && o.faltaResponderDesde) {
      const espera = horasDesde(o.faltaResponderDesde, ahora);
      if (espera >= HORAS_SIN_RESPONDER) {
        alertas.push({
          idOportunidad: o.idOportunidad,
          nombreOportunidad: o.nombre,
          idEmpresa: o.idEmpresa,
          nombreEmpresa,
          clase: 'sin_responder',
          etapa: o.etapa,
          tipoAccion: null,
          detalle: null,
          fecha: o.faltaResponderDesde,
          atraso: espera,
        });
      }
    }
  }
  const porClase = (a: AlertaCrm): number => PESO_CLASE[a.clase];
  const porNombre = (a: AlertaCrm): string => a.nombreEmpresa;
  const porFecha = (a: AlertaCrm): string => a.fecha;
  return alertas.sort(
    (a, b) =>
      porClase(a) - porClase(b) ||
      (a.clase === 'sin_responder'
        ? porFecha(a).localeCompare(porFecha(b))
        : porNombre(a).localeCompare(porNombre(b)) || a.nombreOportunidad.localeCompare(b.nombreOportunidad)) ||
      (a.clase === 'accion_vencida' ? porFecha(a).localeCompare(porFecha(b)) : 0),
  );
}

/** Counts per clase, the shape the bell and browser notification summarize. */
export function resumenDeAlertas(alertas: AlertaCrm[]): ResumenAlertas {
  const resumen: ResumenAlertas = { vencidas: 0, hoy: 0, sinResponder: 0 };
  for (const a of alertas) {
    if (a.clase === 'accion_vencida') resumen.vencidas++;
    else if (a.clase === 'accion_hoy') resumen.hoy++;
    else resumen.sinResponder++;
  }
  return resumen;
}
