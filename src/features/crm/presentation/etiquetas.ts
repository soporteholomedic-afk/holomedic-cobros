import type { AccionAsignacion, Etapa, Flujo } from '../domain/entities';
import {
  EVENTOS_PIPELINE,
  puedeTransicionar,
  type EstadoPipeline,
  type EventoPipeline,
} from '../domain/maquinaEstados';

/**
 * Spanish UI labels for the pipeline vocabulary (spec G-crm: "Spanish
 * UI" — all user-facing CRM labels are Spanish; the machine-internal
 * enum values stay English-identifier style by design).
 */

export const ETIQUETA_FLUJO: Record<Flujo, string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
};

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  REGISTRADO: 'Registrado',
  SEGUIMIENTO: 'Seguimiento',
  PRESENTACION: 'Presentación',
  CONFIRMADA: 'Confirmada',
  ENTREGADA: 'Entregada',
  NUEVO: 'Nuevo',
  CADENCIA: 'Cadencia',
  ACEPTADO: 'Aceptado',
  DATOS: 'Datos',
  DESCANSO: 'Descanso',
  RECHAZADO: 'Rechazado',
};

/** Assignment action labels for the per-empresa history (spec G5, pr15/WU2). */
export const ETIQUETA_ACCION_ASIGNACION: Record<AccionAsignacion, string> = {
  ASIGNADO: 'Asignado',
  REASIGNADO: 'Reasignado',
  DEVUELTO: 'Devuelto',
};

export const ETIQUETA_EVENTO: Record<EventoPipeline, string> = {
  PresentaciónEnviada: 'Presentación enviada',
  CotizaciónEnviada: 'Cotización enviada',
  ConfirmaciónPresentación: 'Confirmación de presentación',
  HandoffRegistrado: 'Registrar handoff',
  AceptaciónOutbound: 'Aceptación outbound',
  ConversiónProspectoACliente: 'Convertir a cliente',
  DatosSolicitados: 'Pedir datos',
  EnviosAgotados: 'Marcar envíos agotados',
  ReinicioCadencia: 'Reiniciar cadencia',
  PasarAOutbound: 'Pasar a Outbound',
  Rechazo: 'Rechazar',
  Reactivar: 'Reactivar',
};

/** Event label with a verbatim fallback for unknown audit values. */
export function etiquetaEvento(evento: string): string {
  return (ETIQUETA_EVENTO as Record<string, string>)[evento] ?? evento;
}

/**
 * Events the detail page offers from `estado` — the machine guard
 * (`puedeTransicionar`) over the runtime whitelist, MINUS T16: the
 * tipo conversion belongs to POST .../tipo (pr10 route contract) and
 * would be rejected by /transiciones.
 */
export function transicionesDisponibles(estado: EstadoPipeline): EventoPipeline[] {
  return EVENTOS_PIPELINE.filter(
    (evento) => evento !== 'ConversiónProspectoACliente' && puedeTransicionar(estado, evento),
  );
}

/**
 * Deterministic date display: 'YYYY-MM-DD[THH:mm[:ss…]]' →
 * 'dd/mm/yyyy[ hh:mm]'. No locale/timezone dependence (tests pin the
 * shape; the server and the team share one timezone).
 */
export function formatearFecha(iso: string): string {
  const [fecha, hora = ''] = iso.split('T');
  const [anio, mes, dia] = fecha.split('-');
  const horasMinutos = hora.slice(0, 5);
  return horasMinutos === '' ? `${dia}/${mes}/${anio}` : `${dia}/${mes}/${anio} ${horasMinutos}`;
}
