'use client';

import { useEffect, useState } from 'react';

import type { ClienteSiglaSinFicha } from '../../application/listarEmpresasInactivas';
import { ESTADO_ATENCION_LABELS } from '../../domain/actividadServicios';
import { UMBRAL_MESES_INACTIVIDAD } from '../../domain/entities';
import { formatoCorto, formatoRelativo } from './fechas';
import { useInactivasCompletas } from './useInactivasCompletas';

export interface CrmInactivasProps {
  /** Notifies the parent (tab badge) once both sources loaded: ficha rows + SIGLA total. */
  onCargado?: (total: number) => void;
  /** Bumping it refetches both sources (S6: after saving a contact). */
  reloadKey?: number;
  /** The user asked to contact that empresa: the parent opens the registrar-contacto panel. */
  onRegistrar: (idEmpresa: string) => void;
  /** The user asked to create a ficha for a SIGLA-only dormant client (S11). */
  onCrearFicha?: (cliente: ClienteSiglaSinFicha) => void;
}

type Fuente = 'crm' | 'sigla';

function mesesLabel(meses: number): string {
  return meses === 1 ? '1 mes' : `${meses} meses`;
}

/**
 * "Inactivas" view (feature crm-vista-inactivas, S10-S12): two sources under a
 * segmented control — "Con ficha en el CRM" (the S2-S6 table) and "Solo en
 * SIGLA" (dormant SIGLA clients with no ficha, S10), paginated. Contacting a
 * empresa does NOT remove its row: only a new SIGLA attention does (S6), the
 * same rule for both segments. Threshold stays fixed at 4 months (S4).
 */
export function CrmInactivas({ onCargado, reloadKey = 0, onRegistrar, onCrearFicha }: CrmInactivasProps) {
  const { filas, sinInformacion, cargandoCrm, errorCrm, sigla, cargandoSigla, errorSigla, recargarCrm, recargarSigla, irAPaginaSigla } =
    useInactivasCompletas(reloadKey);
  const [fuente, setFuente] = useState<Fuente>('crm');

  useEffect(() => {
    if (!cargandoCrm && !errorCrm && !cargandoSigla && !errorSigla) onCargado?.(filas.length + sigla.total);
  }, [cargandoCrm, errorCrm, cargandoSigla, errorSigla, filas, sigla, onCargado]);

  const encabezados = 'border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-xl font-bold text-slate-800">Inactivas</h2>
        <p className="mt-1 text-sm text-slate-500">
          Empresas cliente que hace {UMBRAL_MESES_INACTIVIDAD} meses o más no envían pacientes a la clínica.
          Ordenadas de la más abandonada a la menos.
        </p>

        <div className="mt-4 flex gap-2" role="group" aria-label="Fuente de empresas inactivas">
          <button
            type="button"
            aria-pressed={fuente === 'crm' ? 'true' : 'false'}
            onClick={() => setFuente('crm')}
            className={
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ' +
              (fuente === 'crm'
                ? 'border-sky-500 bg-sky-50 text-sky-600'
                : 'border-slate-300 bg-white text-slate-500 hover:text-slate-700')
            }
          >
            Con ficha en el CRM ({filas.length})
          </button>
          <button
            type="button"
            aria-pressed={fuente === 'sigla' ? 'true' : 'false'}
            onClick={() => setFuente('sigla')}
            className={
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ' +
              (fuente === 'sigla'
                ? 'border-sky-500 bg-sky-50 text-sky-600'
                : 'border-slate-300 bg-white text-slate-500 hover:text-slate-700')
            }
          >
            Solo en SIGLA ({sigla.total})
          </button>
        </div>

        {errorCrm !== null && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p>{errorCrm}</p>
            <button
              type="button"
              onClick={() => recargarCrm()}
              className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              Reintentar
            </button>
          </div>
        )}
        {errorSigla !== null && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p>{errorSigla}</p>
            <button
              type="button"
              onClick={() => recargarSigla()}
              className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              Reintentar SIGLA
            </button>
          </div>
        )}

        {fuente === 'crm' && (
          <>
            {cargandoCrm && <p className="mt-6 text-sm text-slate-500">Consultando actividad en SIGLA…</p>}

            {!cargandoCrm && errorCrm === null && filas.length === 0 && (
              <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
                No hay empresas cliente sin actividad hace {UMBRAL_MESES_INACTIVIDAD} meses o más.
              </p>
            )}

            {!cargandoCrm && errorCrm === null && filas.length > 0 && (
              <>
                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className={encabezados}>
                        <th className="px-4 py-2.5">Empresa</th>
                        <th className="px-4 py-2.5">Sector</th>
                        <th className="px-4 py-2.5">Sin actividad</th>
                        <th className="px-4 py-2.5">Última atención</th>
                        <th className="px-4 py-2.5">Último contacto</th>
                        <th className="px-4 py-2.5">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((fila) => (
                        <tr key={fila.idEmpresa} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800">{fila.razonSocial}</p>
                            <p className="text-xs text-slate-400">RUC {fila.ruc}</p>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{fila.sector ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            {fila.estado === 'sin_actividad' ? (
                              <span className="font-semibold text-amber-600">{mesesLabel(fila.mesesSinActividad ?? 0)}</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                {ESTADO_ATENCION_LABELS['pendiente_primera']}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {fila.ultimaAtencion === null ? '—' : formatoCorto(fila.ultimaAtencion)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {fila.ultimoContactoCrm === null ? '—' : formatoRelativo(fila.ultimoContactoCrm, new Date())}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => onRegistrar(fila.idEmpresa)}
                              className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-100"
                            >
                              Registrar contacto
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sinInformacion > 0 && (
                  <p className="mt-3 text-xs text-slate-400">
                    {sinInformacion === 1
                      ? '1 empresa cliente sin RUC no se puede evaluar.'
                      : `${sinInformacion} empresas cliente sin RUC no se pueden evaluar.`}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {fuente === 'sigla' && (
          <>
            {cargandoSigla && <p className="mt-6 text-sm text-slate-500">Consultando clientes dormidos en SIGLA…</p>}

            {!cargandoSigla && errorSigla === null && sigla.filas.length === 0 && (
              <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
                No hay clientes de SIGLA sin ficha en este segmento.
              </p>
            )}

            {!cargandoSigla && errorSigla === null && sigla.filas.length > 0 && (
              <>
                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className={encabezados}>
                        <th className="px-4 py-2.5">Cliente en SIGLA</th>
                        <th className="px-4 py-2.5">Sin actividad</th>
                        <th className="px-4 py-2.5">Última atención</th>
                        <th className="px-4 py-2.5">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sigla.filas.map((fila) => (
                        <tr key={fila.ruc} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800">{fila.razonSocial || '(sin razón social en SIGLA)'}</p>
                            <p className="text-xs text-slate-400">
                              RUC {fila.ruc}
                              {fila.contacto !== null ? ` · ${fila.contacto}` : ''}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            {fila.estado === 'sin_actividad' ? (
                              <span className="font-semibold text-amber-600">{mesesLabel(fila.mesesSinActividad ?? 0)}</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                {ESTADO_ATENCION_LABELS['pendiente_primera']}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {fila.ultimaAtencion === null ? '—' : formatoCorto(fila.ultimaAtencion)}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => onCrearFicha?.(fila)}
                              className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-100"
                            >
                              Crear ficha
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => irAPaginaSigla(sigla.pagina - 1)}
                    disabled={sigla.pagina <= 1}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-600 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span>
                    Página {sigla.pagina} de {sigla.paginas} · {sigla.total} clientes
                  </span>
                  <button
                    type="button"
                    onClick={() => irAPaginaSigla(sigla.pagina + 1)}
                    disabled={sigla.pagina >= sigla.paginas}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-600 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
