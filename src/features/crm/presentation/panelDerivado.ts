import type { TipoEmpresa } from '../domain/entities';
import type { FilaPanelCrm } from '../domain/ports';
import {
  ACCIONES_POR_ESTADO,
  derivarEstadoPanel,
  enBucketEnEspera,
  enBucketSinInteres,
  fechaReactivacion,
  proximoPaso,
  type AccionFila,
  type EntradaEstadoPanel,
  type EstadoPanel,
  type PasoProximo,
} from './estadoPanel';
import { ETIQUETA_ETAPA } from './etiquetas';

/**
 * panelDerivado (tasks 8.1–8.4, design D4, spec OP-1..OP-3) — PURE
 * client-side derivation of the panel from ONE GET /api/crm/panel
 * payload {hoy, filas}. The server date (`hoy`) is authoritative for
 * the derivation (batch-9 watch item: never a client Date.now()).
 *
 * KPI cards and filter tabs share the SAME predicates — the counts are
 * tallied once here, so every KPI equals its tab count by construction
 * (OP-2). The table renders `filas` (estado badge, próximo paso,
 * actions) and `filtrarFilas` applies tab + search client-side (OP-3).
 *
 * "Sin interés" is the mock union (respondio_negativo ∪ en_pausa_3m),
 * so its KPI/tab count covers both statuses.
 */

/** Display-only vocabulary over the domain tipos (spec OP-4). */
export const ETIQUETA_TIPO: Record<TipoEmpresa, string> = {
  Cliente: 'Cliente Nuevo',
  Prospecto: 'Posible Cliente',
};

/** One payload row enriched with everything the table renders. */
export interface FilaDerivadaPanel {
  fila: FilaPanelCrm;
  estado: EstadoPanel;
  acciones: readonly AccionFila[];
  proximo: PasoProximo;
  /** "Se reactiva:" date (dd/mm/yyyy) — set only under en_pausa_3m. */
  fechaReactivacion: string | null;
  /** Underlying etapa label for the avanzado badge, null otherwise. */
  etiquetaEtapaAvanzada: string | null;
}

/** KPI/tab counts (spec OP-2) + the "N clientes / M posibles" split. */
export interface ConteosPanel {
  todas: number;
  enEspera: number;
  positivos: number;
  pausa3m: number;
  reactivados: number;
  sinInteres: number;
  faltaCarta: number;
  clientes: number;
  posibles: number;
}

export type TabPanel =
  | 'todas'
  | 'en_espera'
  | 'positivos'
  | 'pausa_3m'
  | 'reactivados'
  | 'sin_interes'
  | 'falta_carta';

/** The 7 filter tabs, mock-verbatim labels with live counts (OP-3).
 * Rendering the SAME list the counts were tallied into keeps tabs and
 * KPIs in lockstep — exactly seven, no extra tab. */
export const TABS_PANEL: readonly { clave: TabPanel; etiqueta: string }[] = [
  { clave: 'todas', etiqueta: 'Todas' },
  { clave: 'en_espera', etiqueta: 'En espera' },
  { clave: 'positivos', etiqueta: '👍 Positivos' },
  { clave: 'pausa_3m', etiqueta: '💤 Pausa 3 meses' },
  { clave: 'reactivados', etiqueta: '🔔 Reactivados' },
  { clave: 'sin_interes', etiqueta: '👎 Sin interés' },
  { clave: 'falta_carta', etiqueta: 'Falta carta' },
];

/** GET /api/crm/panel success payload (route contract, task 7.2). */
export interface PanelPayload {
  hoy: string;
  filas: readonly FilaPanelCrm[];
}

export interface PanelDerivado {
  hoy: string;
  filas: FilaDerivadaPanel[];
  conteos: ConteosPanel;
}

function entradaDe(fila: FilaPanelCrm, hoy: string): EntradaEstadoPanel {
  return {
    flujo: fila.flujo,
    etapa: fila.etapa,
    enviosCiclo: fila.enviosCiclo,
    ciclo: fila.ciclo,
    fechaCicloInicio: fila.fechaCicloInicio,
    descansoHasta: fila.descansoHasta,
    rechazadoHasta: fila.rechazadoHasta,
    hoy,
  };
}

/** Derives rows + tallies counts in ONE pass — the single source both
 * the KPI cards and the tabs render from (OP-2 equality guarantee). */
export function derivarPanel(payload: PanelPayload): PanelDerivado {
  const conteos: ConteosPanel = {
    todas: 0,
    enEspera: 0,
    positivos: 0,
    pausa3m: 0,
    reactivados: 0,
    sinInteres: 0,
    faltaCarta: 0,
    clientes: 0,
    posibles: 0,
  };

  const filas = payload.filas.map((fila): FilaDerivadaPanel => {
    const entrada = entradaDe(fila, payload.hoy);
    const estado = derivarEstadoPanel(entrada);
    conteos.todas += 1;
    if (enBucketEnEspera(estado)) conteos.enEspera += 1;
    if (estado === 'respondio_positivo') conteos.positivos += 1;
    if (estado === 'en_pausa_3m') conteos.pausa3m += 1;
    if (estado === 'reactivado') conteos.reactivados += 1;
    if (enBucketSinInteres(estado)) conteos.sinInteres += 1;
    if (estado === 'sin_carta') conteos.faltaCarta += 1;
    if (fila.tipo === 'Cliente') conteos.clientes += 1;
    else conteos.posibles += 1;
    return {
      fila,
      estado,
      acciones: ACCIONES_POR_ESTADO[estado],
      proximo: proximoPaso(entrada),
      fechaReactivacion: fechaReactivacion(entrada),
      etiquetaEtapaAvanzada:
        estado === 'avanzado' && fila.etapa !== null ? ETIQUETA_ETAPA[fila.etapa] : null,
    };
  });

  return { hoy: payload.hoy, filas, conteos };
}

/** Tab membership — the SAME predicates the counts tallied above. */
function perteneceATab(estado: EstadoPanel, tab: TabPanel): boolean {
  switch (tab) {
    case 'todas':
      return true;
    case 'en_espera':
      return enBucketEnEspera(estado);
    case 'positivos':
      return estado === 'respondio_positivo';
    case 'pausa_3m':
      return estado === 'en_pausa_3m';
    case 'reactivados':
      return estado === 'reactivado';
    case 'sin_interes':
      return enBucketSinInteres(estado);
    case 'falta_carta':
      return estado === 'sin_carta';
  }
}

/** Search matches empresa name and contact person, plus RUC and sector
 * (spec OP-3), case-insensitive, on the raw payload strings. */
function coincideBusqueda({ fila }: FilaDerivadaPanel, q: string): boolean {
  return (
    fila.razonSocial.toLowerCase().includes(q) ||
    (fila.contactoNombre?.toLowerCase().includes(q) ?? false) ||
    fila.ruc.toLowerCase().includes(q) ||
    (fila.sector?.toLowerCase().includes(q) ?? false)
  );
}

/** Applies the active tab and the search term to the derived rows. */
export function filtrarFilas(
  filas: FilaDerivadaPanel[],
  tab: TabPanel,
  busqueda: string,
): FilaDerivadaPanel[] {
  const q = busqueda.trim().toLowerCase();
  return filas.filter(
    (derivada) => perteneceATab(derivada.estado, tab) && (q === '' || coincideBusqueda(derivada, q)),
  );
}
