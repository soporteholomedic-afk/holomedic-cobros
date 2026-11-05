import type { AccionTipo, Empresa, Etapa } from '../domain/entities';

/**
 * Pending-work alerts of the CRM board, computed live from the stored
 * empresas (feature crm-notificaciones, S3/S4): no notification table, no
 * cron — an alert exists exactly while its underlying fact does, so acting
 * on the empresa (registering the contact, answering, moving the stage)
 * makes it disappear on its own.
 *
 * Two signals (S3):
 *
 * - `accion_vencida` / `accion_hoy`: `proximaAccion` overdue or due today on
 *   an ACTIVE pipeline stage (`contactado`, `en_seguimiento`); `por_contactar`
 *   has no follow-up yet and `cliente`/`perdido` are closed cards.
 * - `sin_responder`: an inbound contact (`faltaResponderDesde`) waiting at
 *   least `HORAS_SIN_RESPONDER`; any stage except `perdido`, because an
 *   inbound lead can arrive at any stage and is never relevant once lost.
 *
 * Like the rest of the CRM application layer, none of this reads the clock:
 * the caller passes `hoy` (Lima calendar day, see `hoyEnLima`) and `ahora`.
 */

/** Inbound contacts wait this many hours before `sin_responder` fires. */
export const HORAS_SIN_RESPONDER = 48;

export type ClaseAlerta = 'accion_vencida' | 'accion_hoy' | 'sin_responder';

export interface AlertaCrm {
  idEmpresa: string;
  razonSocial: string;
  clase: ClaseAlerta;
  etapa: Etapa;
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

const ETAPAS_CON_SEGUIMIENTO: readonly Etapa[] = ['contactado', 'en_seguimiento'];

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
 * (oldest day first), then today's (alphabetical), then unanswered inbound
 * (longest wait first).
 */
export function calcularAlertas(empresas: Empresa[], hoy: string, ahora: Date): AlertaCrm[] {
  const alertas: AlertaCrm[] = [];
  for (const e of empresas) {
    const activa = ETAPAS_CON_SEGUIMIENTO.includes(e.etapa);
    if (activa && e.proximaAccion) {
      const atraso = diasEntre(e.proximaAccion.fecha, hoy);
      if (atraso > 0) {
        alertas.push({
          idEmpresa: e.idEmpresa,
          razonSocial: e.razonSocial,
          clase: 'accion_vencida',
          etapa: e.etapa,
          tipoAccion: e.proximaAccion.tipo,
          detalle: e.proximaAccion.detalle,
          fecha: e.proximaAccion.fecha,
          atraso,
        });
      } else if (atraso === 0) {
        alertas.push({
          idEmpresa: e.idEmpresa,
          razonSocial: e.razonSocial,
          clase: 'accion_hoy',
          etapa: e.etapa,
          tipoAccion: e.proximaAccion.tipo,
          detalle: e.proximaAccion.detalle,
          fecha: e.proximaAccion.fecha,
          atraso: 0,
        });
      }
    }
    if (e.etapa !== 'perdido' && e.faltaResponderDesde) {
      const espera = horasDesde(e.faltaResponderDesde, ahora);
      if (espera >= HORAS_SIN_RESPONDER) {
        alertas.push({
          idEmpresa: e.idEmpresa,
          razonSocial: e.razonSocial,
          clase: 'sin_responder',
          etapa: e.etapa,
          tipoAccion: null,
          detalle: null,
          fecha: e.faltaResponderDesde,
          atraso: espera,
        });
      }
    }
  }
  const porClase = (a: AlertaCrm): number => PESO_CLASE[a.clase];
  const porNombre = (a: AlertaCrm): string => a.razonSocial;
  const porFecha = (a: AlertaCrm): string => a.fecha;
  return alertas.sort(
    (a, b) =>
      porClase(a) - porClase(b) ||
      (a.clase === 'sin_responder' ? porFecha(a).localeCompare(porFecha(b)) : porNombre(a).localeCompare(porNombre(b))) ||
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
