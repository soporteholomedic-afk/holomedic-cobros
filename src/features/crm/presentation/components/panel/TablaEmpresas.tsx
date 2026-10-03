'use client';

import { Eye } from 'lucide-react';

import type { FilaPanelCrm } from '../../../domain/ports';
import { ETIQUETA_TIPO, type FilaDerivadaPanel } from '../../panelDerivado';
import type { AccionFila, EstadoPanel } from '../../estadoPanel';
import { EstadoVacio } from './EstadoVacio';

/**
 * TablaEmpresas (task 8.4, design D4, spec OP-4 + SD-3) — the operator
 * panel table. Every cell renders DERIVATION OUTPUT from panelDerivado
 * (estado badge, acciones, próximo paso): no classification lives here.
 * Column headers, status badges, action labels and the footer are
 * verbatim from the design mock; inbound advanced stages carry their
 * own badge via `etiquetaEtapaAvanzada` (SD-3 — never the carta badge).
 *
 * Row actions: each button reports (fila, accion) through onAccion —
 * PanelCrm owns what each action does (ficha/respuesta modals and the
 * send/pause posts, wired in batch 14). While a row's action is in
 * flight (`accionEnCurso`), that row's buttons disable so a send
 * cannot double-fire. The empresa name doubles as a ficha affordance
 * (spec OP-6). When nothing matches the active tab + search, the
 * mock's empty state replaces the table.
 */

const ETIQUETA_ESTADO: Record<EstadoPanel, string> = {
  sin_carta: 'Falta enviar carta',
  carta_enviada: 'Carta enviada (Inicio)',
  seguimiento_1: 'Semana 1 enviada',
  seguimiento_2: 'Semana 2 enviada',
  seguimiento_3: 'Semana 3 (Último aviso)',
  respondio_positivo: '¡Interesado! (Positivo)',
  en_pausa_3m: 'En pausa por 3 meses',
  reactivado: '¡Reactivado tras 3 meses!',
  respondio_negativo: 'Sin interés (En pausa)',
  avanzado: '', // resolved per row via etiquetaEtapaAvanzada (SD-3)
};

const ETIQUETA_ACCION: Record<AccionFila, string> = {
  enviar_carta: 'Enviar carta',
  sumar_semana: '+1 Sem',
  registrar_respuesta: '¿Respondió?',
  pausar_3m: 'Pausar 3m',
  reactivar: 'Reactivar ya',
  ver_ficha: 'Ver Ficha',
};

export interface TablaEmpresasProps {
  /** Derived rows after tab + search filtering (PanelCrm filters). */
  filas: FilaDerivadaPanel[];
  /** Total empresas in the panel — the M in "Mostrando N de M". */
  total: number;
  onAccion: (fila: FilaDerivadaPanel, accion: AccionFila) => void;
  /** Empty-state CTA (interim → alta page; modal in task 10.2). */
  onAnotar: () => void;
  /** empresaId whose row action is in flight (decision 13): that row's
   * action buttons disable so a send cannot double-fire. */
  accionEnCurso?: number | null;
}

function InsigniaEstado({ derivada }: { derivada: FilaDerivadaPanel }) {
  const etiqueta =
    derivada.estado === 'avanzado'
      ? (derivada.etiquetaEtapaAvanzada ?? '')
      : ETIQUETA_ESTADO[derivada.estado];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
      {etiqueta}
    </span>
  );
}

function CeldaEmpresa({ fila, onAccion }: { fila: FilaPanelCrm; onAccion: () => void }) {
  return (
    <div className="flex items-center space-x-3">
      <div>
        <button
          type="button"
          onClick={onAccion}
          className="text-xs font-bold text-slate-900 dark:text-slate-200 transition hover:text-teal-600 dark:hover:text-teal-400 sm:text-sm"
        >
          {fila.razonSocial}
        </button>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>RUC: {fila.ruc}</span>
          {fila.cantidadTrabajadores !== null && (
            <>
              <span aria-hidden="true">•</span>
              <span>{fila.cantidadTrabajadores} trabajadores</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CeldaContacto({ fila }: { fila: FilaPanelCrm }) {
  if (fila.contactoNombre === null) {
    return <span className="text-xs text-slate-400">Sin contacto registrado</span>;
  }
  return (
    <div>
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{fila.contactoNombre}</p>
      {fila.contactoCargo !== null && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{fila.contactoCargo}</p>
      )}
      {fila.sector !== null && (
        <span className="mt-1 inline-block rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
          {fila.sector}
        </span>
      )}
    </div>
  );
}

function CeldaAcciones({
  derivada,
  enCurso,
  onAccion,
}: {
  derivada: FilaDerivadaPanel;
  enCurso: boolean;
  onAccion: (accion: AccionFila) => void;
}) {
  const conOtrasAcciones = derivada.acciones.some((accion) => accion !== 'ver_ficha');
  return (
    <div className="flex justify-end space-x-1 whitespace-nowrap">
      {derivada.acciones.map((accion) => {
        if (accion === 'ver_ficha' && conOtrasAcciones) {
          return (
            <button
              key={accion}
              type="button"
              aria-label="Ver ficha"
              title="Ver ficha"
              disabled={enCurso}
              onClick={() => onAccion(accion)}
              className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-800 dark:hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        }
        return (
          <button
            key={accion}
            type="button"
            disabled={enCurso}
            onClick={() => onAccion(accion)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition hover:bg-slate-100 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ETIQUETA_ACCION[accion]}
          </button>
        );
      })}
    </div>
  );
}

export function TablaEmpresas({
  filas,
  total,
  onAccion,
  onAnotar,
  accionEnCurso = null,
}: TablaEmpresasProps) {
  return (
    <>
      {filas.length === 0 ? (
        <EstadoVacio onAnotar={onAnotar} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-5 py-3.5">Empresa</th>
                <th scope="col" className="px-4 py-3.5">Persona de Contacto</th>
                <th scope="col" className="px-4 py-3.5">Tipo</th>
                <th scope="col" className="px-4 py-3.5">¿En qué correo va?</th>
                <th scope="col" className="px-4 py-3.5">Próximo paso</th>
                <th scope="col" className="px-5 py-3.5 text-right">¿Qué deseas hacer?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filas.map((derivada) => (
                <tr key={derivada.fila.empresaId} className="border-b border-slate-100 dark:border-slate-800/60 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3.5">
                    <CeldaEmpresa
                      fila={derivada.fila}
                      onAccion={() => onAccion(derivada, 'ver_ficha')}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <CeldaContacto fila={derivada.fila} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center rounded-full border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
                      {ETIQUETA_TIPO[derivada.fila.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <InsigniaEstado derivada={derivada} />
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    {derivada.proximo.principal !== null && (
                      <div data-testid="proximo-paso">
                        <span className="block font-medium text-slate-700 dark:text-slate-200">
                          {derivada.proximo.principal}
                        </span>
                        {derivada.proximo.secundario !== null && (
                          <span className="text-[11px] text-slate-400">
                            {derivada.proximo.secundario}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <CeldaAcciones
                      derivada={derivada}
                      enCurso={accionEnCurso === derivada.fila.empresaId}
                      onAccion={(accion) => onAccion(derivada, accion)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 px-5 py-3 text-xs text-slate-500 dark:text-slate-400 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-500" aria-hidden="true" />
          <span>
            Regla de reactivación: Si no hay interés, se deja en pausa 3 meses y luego se reactiva
            para consultar nuevamente.
          </span>
        </div>
        <span>Mostrando {filas.length} de {total} empresas</span>
      </div>
    </>
  );
}
