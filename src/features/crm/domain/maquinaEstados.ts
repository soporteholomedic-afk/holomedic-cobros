/**
 * Pipeline state machine (design D3: "two doors, one cadence engine").
 *
 * States are `{ flujo, etapa }` pairs over the INBOUND and OUTBOUND
 * doors plus the cross-flow RECHAZADO stage (T14 keeps the flujo). The
 * whole machine is a DATA TABLE (`TRANSICIONES`, the design's 16
 * T-rows) plus two pure functions over it — no framework, DB or clock
 * imports (hexagonal domain layer). Cadence arithmetic (weekly windows,
 * 3-strike, 3-month rest/cooldown) lives in `cadence.ts` (pr12): the
 * guards here are purely structural, so T8's derived trigger and T13's
 * "agotada" fork are reachability rules only — the counters that arm
 * them are validated by the application layer (pr10).
 *
 * Result events (bold rows in design D3) map onto design D4's final
 * 6-event catalog. `AvanceDeEtapa` is deliberately NOT in the catalog:
 * every stage change already lives in CRM_Transiciones, and emitting it
 * as a result event would double-count (design D4).
 *
 * Error messages are Spanish on purpose — they surface verbatim in the
 * UI through the API error body (repo convention).
 */

import type { Etapa, Flujo, Origen } from './entities';
import { ValidationError } from './errors';

/** One pipeline state: flow + stage (design D3's state table). */
export interface EstadoPipeline {
  readonly flujo: Flujo;
  readonly etapa: Etapa;
}

/**
 * Result-event catalog (design D4, final): 6 events, no weights.
 * Attributed to the acting user in CRM_Resultados for productivity.
 */
export type TipoResultado =
  | 'CotizaciónEnviada'
  | 'PresentaciónEnviada'
  | 'AceptaciónOutbound'
  | 'ConfirmaciónPresentación'
  | 'HandoffRegistrado'
  | 'ConversiónProspectoACliente';

/**
 * Runtime D4 catalog — the exact 6 result events (mirrors the
 * CK_CRM_Resultados_Tipo CHECK), in catalog order. `AvanceDeEtapa` is
 * deliberately absent: stage changes already live in CRM_Transiciones
 * and must not double-count (design D4). Productivity reads and the
 * pr17 export derive their breakdown columns from this list.
 */
export const EVENTOS_RESULTADO: readonly TipoResultado[] = [
  'CotizaciónEnviada',
  'PresentaciónEnviada',
  'AceptaciónOutbound',
  'ConfirmaciónPresentación',
  'HandoffRegistrado',
  'ConversiónProspectoACliente',
];

/**
 * Pipeline events. The design table names some rows with prose
 * ("3 envíos sin respuesta", "datos solicitados", "pasar a Outbound");
 * those get the stable machine-readable names here — the SAME string
 * pr10 writes to `CRM_Transiciones.evento` (VC(40) audit column).
 */
export type EventoPipeline =
  | 'PresentaciónEnviada'
  | 'CotizaciónEnviada'
  | 'ConfirmaciónPresentación'
  | 'HandoffRegistrado'
  | 'AceptaciónOutbound'
  | 'ConversiónProspectoACliente'
  | 'DatosSolicitados'
  | 'EnviosAgotados'
  | 'ReinicioCadencia'
  | 'PasarAOutbound'
  | 'Rechazo'
  | 'Reactivar';

export type IdTransicion =
  | 'T1'
  | 'T2'
  | 'T3'
  | 'T4'
  | 'T5'
  | 'T6'
  | 'T7'
  | 'T8'
  | 'T9'
  | 'T10'
  | 'T11'
  | 'T12'
  | 'T13'
  | 'T14'
  | 'T15'
  | 'T16';

/**
 * Runtime whitelist of every machine-readable event (the API body
 * guard validates `evento` against this list before the use case
 * runs). T1/T6 are creation rows with `evento: null` — they are
 * applied at empresa creation via `estadoInicial`, never through the
 * transitions endpoint.
 */
export const EVENTOS_PIPELINE: readonly EventoPipeline[] = [
  'PresentaciónEnviada',
  'CotizaciónEnviada',
  'ConfirmaciónPresentación',
  'HandoffRegistrado',
  'AceptaciónOutbound',
  'ConversiónProspectoACliente',
  'DatosSolicitados',
  'EnviosAgotados',
  'ReinicioCadencia',
  'PasarAOutbound',
  'Rechazo',
  'Reactivar',
];

/** Required previous state; `null` fields are wildcards (T14/T15/T16). */
export interface EstadoPrevio {
  readonly flujo: Flujo | null;
  readonly etapa: Etapa | null;
}

export interface FilaTransicion {
  readonly id: IdTransicion;
  /** `null`/`null` = creation row (T1/T6): unreachable via `transitar`. */
  readonly desde: EstadoPrevio;
  /** `null` = creation row (matched only by `estadoInicial`). */
  readonly evento: EventoPipeline | null;
  /** `'MISMO'` keeps the current flow (T14/T15/T16). */
  readonly haciaFlujo: Flujo | 'MISMO';
  /** `'MISMO'` keeps the current stage (T16 — tipo update only). */
  readonly haciaEtapa: Etapa | 'MISMO';
  /** Bold rows only (design D3) — the CRM_Resultados event, else null. */
  readonly resultado: TipoResultado | null;
  /** Guard exclusions: stages the row must NOT fire from (T14: any ACTIVE stage). */
  readonly excluye?: readonly Etapa[];
}

/**
 * The design D3 transition table, T1–T16, verbatim. Order is the
 * design's order; `buscar` relies on rows being mutually exclusive
 * for a given (estado, evento) — guarded by the maquinaEstados tests.
 */
export const TRANSICIONES: readonly FilaTransicion[] = [
  // T1 — empresa creada, Origen Inbound (creation row).
  { id: 'T1', desde: { flujo: null, etapa: null }, evento: null, haciaFlujo: 'INBOUND', haciaEtapa: 'REGISTRADO', resultado: null },
  // T2 — cotización enviada; arms the cadence (persisted by pr10).
  { id: 'T2', desde: { flujo: 'INBOUND', etapa: 'REGISTRADO' }, evento: 'CotizaciónEnviada', haciaFlujo: 'INBOUND', haciaEtapa: 'SEGUIMIENTO', resultado: 'CotizaciónEnviada' },
  // T3 — presentación enviada; disarms the cadence.
  { id: 'T3', desde: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' }, evento: 'PresentaciónEnviada', haciaFlujo: 'INBOUND', haciaEtapa: 'PRESENTACION', resultado: 'PresentaciónEnviada' },
  // T4 — presentación confirmada.
  { id: 'T4', desde: { flujo: 'INBOUND', etapa: 'PRESENTACION' }, evento: 'ConfirmaciónPresentación', haciaFlujo: 'INBOUND', haciaEtapa: 'CONFIRMADA', resultado: 'ConfirmaciónPresentación' },
  // T5 — handoff registrado (CRM_Handoffs row written by pr10).
  { id: 'T5', desde: { flujo: 'INBOUND', etapa: 'CONFIRMADA' }, evento: 'HandoffRegistrado', haciaFlujo: 'INBOUND', haciaEtapa: 'ENTREGADA', resultado: 'HandoffRegistrado' },
  // T6 — empresa creada, Origen Outbound (creation row).
  { id: 'T6', desde: { flujo: null, etapa: null }, evento: null, haciaFlujo: 'OUTBOUND', haciaEtapa: 'NUEVO', resultado: null },
  // T7 — presentación = send #1; arms the cadence (envíos = 1).
  { id: 'T7', desde: { flujo: 'OUTBOUND', etapa: 'NUEVO' }, evento: 'PresentaciónEnviada', haciaFlujo: 'OUTBOUND', haciaEtapa: 'CADENCIA', resultado: 'PresentaciónEnviada' },
  // T8 — 3 envíos sin respuesta (derived): 3-month rest (pr10/persists descansoHasta).
  { id: 'T8', desde: { flujo: 'OUTBOUND', etapa: 'CADENCIA' }, evento: 'EnviosAgotados', haciaFlujo: 'OUTBOUND', haciaEtapa: 'DESCANSO', resultado: null },
  // T9 — descansoHasta ≤ hoy, next send logged: ciclo+1, envíos=1.
  { id: 'T9', desde: { flujo: 'OUTBOUND', etapa: 'DESCANSO' }, evento: 'ReinicioCadencia', haciaFlujo: 'OUTBOUND', haciaEtapa: 'CADENCIA', resultado: null },
  // T10 — aceptación outbound; "pedir datos" next.
  { id: 'T10', desde: { flujo: 'OUTBOUND', etapa: 'CADENCIA' }, evento: 'AceptaciónOutbound', haciaFlujo: 'OUTBOUND', haciaEtapa: 'ACEPTADO', resultado: 'AceptaciónOutbound' },
  // T11 — datos solicitados (plain stage change — no result event).
  { id: 'T11', desde: { flujo: 'OUTBOUND', etapa: 'ACEPTADO' }, evento: 'DatosSolicitados', haciaFlujo: 'OUTBOUND', haciaEtapa: 'DATOS', resultado: null },
  // T12 — cotización outbound: FLOW FLIP to the inbound door; re-arms cadence.
  { id: 'T12', desde: { flujo: 'OUTBOUND', etapa: 'DATOS' }, evento: 'CotizaciónEnviada', haciaFlujo: 'INBOUND', haciaEtapa: 'SEGUIMIENTO', resultado: 'CotizaciónEnviada' },
  // T13 — user fork on the agotada IN/SEGUIMIENTO: pasar a Outbound (choice audited).
  { id: 'T13', desde: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' }, evento: 'PasarAOutbound', haciaFlujo: 'OUTBOUND', haciaEtapa: 'NUEVO', resultado: null },
  // T14 — rechazo + motivo from any ACTIVE stage (not terminal ENTREGADA,
  // not RECHAZADO itself); flujo kept; pr10 stores motivo + rechazadoHasta.
  { id: 'T14', desde: { flujo: null, etapa: null }, evento: 'Rechazo', haciaFlujo: 'MISMO', haciaEtapa: 'RECHAZADO', resultado: null, excluye: ['ENTREGADA', 'RECHAZADO'] },
  // T15 — reactivar after the cooldown expired (user action, not auto;
  // the date guard `rechazadoHasta ≤ hoy` is the application layer's).
  { id: 'T15', desde: { flujo: null, etapa: 'RECHAZADO' }, evento: 'Reactivar', haciaFlujo: 'MISMO', haciaEtapa: 'NUEVO', resultado: null },
  // T16 — conversión prospecto→cliente: tipo update only, NO stage change,
  // from ANY state (active, terminal or rejected).
  { id: 'T16', desde: { flujo: null, etapa: null }, evento: 'ConversiónProspectoACliente', haciaFlujo: 'MISMO', haciaEtapa: 'MISMO', resultado: 'ConversiónProspectoACliente' },
];

/**
 * An illegal transition is a validation error of the requested move —
 * it extends the domain kernel's `ValidationError` so the pr10 API
 * routes map it to 400 with the Spanish message verbatim, while staying
 * a distinct, catchable type for the application layer.
 */
export class TransicionInvalidaError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'TransicionInvalidaError';
  }
}

/**
 * Initial state for a freshly created empresa — creation rows T1/T6 of
 * the design table (door chosen by the registration origen).
 */
export function estadoInicial(origen: Origen): EstadoPipeline {
  return origen === 'Inbound'
    ? { flujo: 'INBOUND', etapa: 'REGISTRADO' }
    : { flujo: 'OUTBOUND', etapa: 'NUEVO' };
}

function buscarTransicion(estado: EstadoPipeline, evento: EventoPipeline): FilaTransicion | undefined {
  return TRANSICIONES.find((t) => {
    if (t.evento !== evento) return false;
    if (t.desde.flujo !== null && t.desde.flujo !== estado.flujo) return false;
    if (t.desde.etapa !== null && t.desde.etapa !== estado.etapa) return false;
    if (t.excluye?.includes(estado.etapa)) return false;
    return true;
  });
}

/**
 * Resolve the T-row that `evento` fires from `estado` (the guard
 * table lookup). Exported so the pr10 effects layer can key the
 * denormalized counters on the UNAMBIGUOUS row id — two rows share
 * `PresentaciónEnviada` (T3 passthrough vs T7 arm) and two share
 * `CotizaciónEnviada` (T2/T12, both arm), so the event name alone
 * cannot select an effect.
 */
export function resolverTransicion(estado: EstadoPipeline, evento: EventoPipeline): FilaTransicion | undefined {
  return buscarTransicion(estado, evento);
}

/** Whether `evento` is legal from `estado` (the T1–T16 guard table). */
export function puedeTransicionar(estado: EstadoPipeline, evento: EventoPipeline): boolean {
  return buscarTransicion(estado, evento) !== undefined;
}

export interface ResultadoTransicion {
  /** The NEW state (a fresh object — the machine is pure, no mutation). */
  readonly estado: EstadoPipeline;
  /** The result event to emit into CRM_Resultados (bold rows), else null. */
  readonly resultado: TipoResultado | null;
}

/**
 * Apply `evento` to `estado`. Pure: returns a NEW state object, never
 * mutates the input. Throws `TransicionInvalidaError` (Spanish message
 * naming the event and the flujo/etapa) for illegal moves.
 */
export function transitar(estado: EstadoPipeline, evento: EventoPipeline): ResultadoTransicion {
  const fila = buscarTransicion(estado, evento);
  if (!fila) {
    throw new TransicionInvalidaError(
      `Transición no válida: el evento "${evento}" no aplica desde ${estado.flujo}/${estado.etapa}`,
    );
  }
  return {
    estado: {
      flujo: fila.haciaFlujo === 'MISMO' ? estado.flujo : fila.haciaFlujo,
      etapa: fila.haciaEtapa === 'MISMO' ? estado.etapa : fila.haciaEtapa,
    },
    resultado: fila.resultado,
  };
}
