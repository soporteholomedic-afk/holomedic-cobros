'use client';

import { useEffect } from 'react';

import { ESTADO_ATENCION_LABELS } from '../../domain/actividadServicios';
import { UMBRAL_MESES_INACTIVIDAD } from '../../domain/entities';
import { formatoCorto, formatoRelativo } from './fechas';
import { useEmpresasInactivas } from './useEmpresasInactivas';

export interface CrmInactivasProps {
  /** Notifies the parent (tab badge) once a list has loaded successfully. */
  onCargado?: (total: number) => void;
  /** Bumping it refetches the list (S6: after saving a contact). */
  reloadKey?: number;
  /** The user asked to contact that empresa: the parent opens the registrar-contacto panel. */
  onRegistrar: (idEmpresa: string) => void;
}

function mesesLabel(meses: number): string {
  return meses === 1 ? '1 mes' : `${meses} meses`;
}

/**
 * "Inactivas" view (feature crm-vista-inactivas, S2/S3): clientes de SIGLA
 * without performed service for `UMBRAL_MESES_INACTIVIDAD` months or more,
 * most abandoned first. The rows come ordered from the endpoint; this
 * component only renders states: loading, SIGLA failure (with retry),
 * empty list, and the table. Contacting a empresa does NOT remove its row —
 * only a new SIGLA attention does (S6).
 */
export function CrmInactivas({ onCargado, reloadKey = 0, onRegistrar }: CrmInactivasProps) {
  const { filas, sinInformacion, cargando, error, recargar } = useEmpresasInactivas(reloadKey);

  useEffect(() => {
    if (!cargando && !error) onCargado?.(filas.length);
  }, [cargando, error, filas, onCargado]);

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-xl font-bold text-slate-800">Inactivas</h2>
        <p className="mt-1 text-sm text-slate-500">
          Empresas cliente que hace {UMBRAL_MESES_INACTIVIDAD} meses o más no envían pacientes a la clínica.
          Ordenadas de la más abandonada a la menos.
        </p>

        {error !== null && (
          <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void recargar()}
              className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              Reintentar
            </button>
          </div>
        )}

        {cargando && <p className="mt-6 text-sm text-slate-500">Consultando actividad en SIGLA…</p>}

        {!cargando && error === null && filas.length === 0 && (
          <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            No hay empresas cliente sin actividad hace {UMBRAL_MESES_INACTIVIDAD} meses o más.
          </p>
        )}

        {!cargando && error === null && filas.length > 0 && (
          <>
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
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
      </div>
    </div>
  );
}
