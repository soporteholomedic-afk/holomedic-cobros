'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ClienteSiglaSinFicha, OpcionesInactivas } from '../../application/listarEmpresasInactivas';
import { ESTADO_ATENCION_LABELS } from '../../domain/actividadServicios';
import { UMBRAL_MESES_INACTIVIDAD } from '../../domain/entities';
import { FiltroDropdown } from './FiltroDropdown';
import { BusquedaDebounced } from './BusquedaDebounced';
import { EncabezadoOrdenable } from './EncabezadoOrdenable';
import { formatoCorto, formatoRelativo } from './fechas';
import { Paginador } from './Paginador';
import { useInactivasCompletas } from './useInactivasCompletas';

export interface CrmInactivasProps {
  /** Notifies the parent (tab badge) once both sources loaded: ficha total + SIGLA total. */
  onCargado?: (total: number) => void;
  /** Bumping it refetches both sources with their current filters (S6: after saving a contact). */
  reloadKey?: number;
  /** The user asked to contact that empresa: the parent opens the registrar-contacto panel. */
  onRegistrar: (idEmpresa: string) => void;
  /** The user asked to create a ficha for a SIGLA-only dormant client (S11). */
  onCrearFicha?: (cliente: ClienteSiglaSinFicha) => void;
}

type Fuente = 'crm' | 'sigla';

interface Filtros {
  q: string;
  sector: string;
  estado: string;
  antiguedad: string;
  contacto: string;
  orden: string;
  direccion: 'asc' | 'desc';
}

const FILTROS_INICIALES: Filtros = { q: '', sector: '', estado: '', antiguedad: '', contacto: '', orden: 'abandono', direccion: 'desc' };

const ESTADOS: { valor: string; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'sin_actividad', etiqueta: 'Sin actividad' },
  { valor: 'pendiente_primera', etiqueta: 'Pendiente de primera atención' },
];

const ANTIGUEDADES: { valor: string; etiqueta: string; min?: number; max?: number }[] = [
  { valor: '', etiqueta: 'Toda antigüedad' },
  { valor: '4-6', etiqueta: '4 a 6 meses', min: 4, max: 6 },
  { valor: '6-12', etiqueta: '6 a 12 meses', min: 6, max: 12 },
  { valor: '12+', etiqueta: 'Más de 12 meses', min: 12 },
];

const CONTACTOS: { valor: string; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'con', etiqueta: 'Con contacto CRM' },
  { valor: 'sin', etiqueta: 'Sin contacto CRM' },
];

function mesesLabel(meses: number): string {
  return meses === 1 ? '1 mes' : `${meses} meses`;
}

/**
 * "Inactivas" view (feature crm-vista-inactivas, S10-S17): two sources under
 * a segmented control, with filters, column sorting and pagination — all
 * server-side (the endpoint does the work) and all through custom controls
 * (S17: no native selects). Contacting a empresa does NOT remove its row:
 * only a new SIGLA attention does (S6), the same rule for both segments.
 */
export function CrmInactivas({ onCargado, reloadKey = 0, onRegistrar, onCrearFicha }: CrmInactivasProps) {
  const [fuente, setFuente] = useState<Fuente>('crm');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [paginaCrm, setPaginaCrm] = useState(1);
  const [paginaSigla, setPaginaSigla] = useState(1);

  // Every filter/sort change resets the page it applies to (handled here, in
  // the events — never in an effect, React 19 rule).
  const cambiarFiltros = (parcial: Partial<Filtros>) => {
    setFiltros((f) => ({ ...f, ...parcial }));
    setPaginaCrm(1);
    setPaginaSigla(1);
  };

  const opcionesCrm = useMemo<OpcionesInactivas>(() => {
    const op: OpcionesInactivas = { orden: filtros.orden as OpcionesInactivas['orden'], direccion: filtros.direccion, pagina: paginaCrm };
    if (filtros.q.trim()) op.q = filtros.q.trim();
    if (filtros.sector) op.sector = filtros.sector;
    if (filtros.estado) op.estado = filtros.estado as 'sin_actividad' | 'pendiente_primera';
    if (filtros.contacto) op.contacto = filtros.contacto as 'con' | 'sin';
    const preset = ANTIGUEDADES.find((a) => a.valor === filtros.antiguedad);
    if (preset?.min !== undefined) {
      op.mesesMin = preset.min;
      if (preset.max !== undefined) op.mesesMax = preset.max;
    }
    return op;
  }, [filtros, paginaCrm]);

  const opcionesSigla = useMemo<OpcionesInactivas>(
    () => ({
      orden: filtros.orden as OpcionesInactivas['orden'],
      direccion: filtros.direccion,
      pagina: paginaSigla,
      ...(filtros.q.trim() ? { q: filtros.q.trim() } : {}),
      ...(filtros.estado ? { estado: filtros.estado as 'sin_actividad' | 'pendiente_primera' } : {}),
    }),
    [filtros, paginaSigla],
  );

  const { crm, cargandoCrm, errorCrm, sigla, cargandoSigla, errorSigla, recargarCrm, recargarSigla } =
    useInactivasCompletas(reloadKey, opcionesCrm, opcionesSigla);


  useEffect(() => {
    if (!cargandoCrm && !errorCrm && !cargandoSigla && !errorSigla) {
      onCargado?.(crm.totalFuente + sigla.totalFuente);
    }
  }, [cargandoCrm, errorCrm, cargandoSigla, errorSigla, crm, sigla, onCargado]);

  const filtrosActivos =
    filtros.q !== '' || filtros.sector !== '' || filtros.estado !== '' || filtros.antiguedad !== '' || filtros.contacto !== '';
  const limpiarFiltros = () => cambiarFiltros(FILTROS_INICIALES);
  const chipoOn = (valor: string) => (filtros.estado === valor || filtros.antiguedad === valor || filtros.contacto === valor);
  const encabezados = 'border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-xl font-bold text-slate-800">Inactivas</h2>
        <p className="mt-1 text-sm text-slate-500">
          Empresas cliente que hace {UMBRAL_MESES_INACTIVIDAD} meses o más no envían pacientes a la clínica.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Fuente de empresas inactivas">
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
            Con ficha en el CRM ({crm.totalFuente})
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
            Solo en SIGLA ({sigla.totalFuente})
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BusquedaDebounced valor={filtros.q} onBusca={(q) => cambiarFiltros({ q })} etiqueta="Buscar por razón social, RUC o contacto" />
          {fuente === 'crm' && (
            <FiltroDropdown
              etiqueta="Sector"
              valor={filtros.sector}
              onCambia={(sector) => cambiarFiltros({ sector })}
              opciones={[{ valor: '', etiqueta: 'Todos los sectores' }, ...crm.sectores.map((s) => ({ valor: s, etiqueta: s }))]}
            />
          )}
          {fuente === 'crm' &&
            ESTADOS.map((e) => (
              <button
                key={e.valor || 'todos-estado'}
                type="button"
                aria-pressed={chipoOn(e.valor) && filtros.estado === e.valor ? 'true' : 'false'}
                onClick={() => cambiarFiltros({ estado: e.valor })}
                className={
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
                  (filtros.estado === e.valor
                    ? 'border-sky-500 bg-sky-50 text-sky-600'
                    : 'border-slate-300 bg-white text-slate-500 hover:text-slate-700')
                }
              >
                {e.valor === '' ? 'Todos los estados' : e.etiqueta}
              </button>
            ))}
          {fuente === 'crm' &&
            ANTIGUEDADES.map((a) => (
              <button
                key={a.valor || 'todas-antig'}
                type="button"
                aria-pressed={filtros.antiguedad === a.valor ? 'true' : 'false'}
                onClick={() => cambiarFiltros({ antiguedad: a.valor })}
                className={
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
                  (filtros.antiguedad === a.valor
                    ? 'border-sky-500 bg-sky-50 text-sky-600'
                    : 'border-slate-300 bg-white text-slate-500 hover:text-slate-700')
                }
              >
                {a.valor === '' ? 'Toda antigüedad' : a.etiqueta}
              </button>
            ))}
          {fuente === 'crm' && (
            <FiltroDropdown
              etiqueta="Último contacto"
              valor={filtros.contacto}
              onCambia={(contacto) => cambiarFiltros({ contacto })}
              opciones={CONTACTOS}
            />
          )}
          {filtrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Limpiar filtros
            </button>
          )}
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

            {!cargandoCrm && errorCrm === null && crm.filas.length === 0 && (
              <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
                {crm.total === 0 && filtrosActivos
                  ? 'No hay resultados con estos filtros.'
                  : `No hay empresas cliente sin actividad hace ${UMBRAL_MESES_INACTIVIDAD} meses o más.`}
              </p>
            )}

            {!cargandoCrm && errorCrm === null && crm.filas.length > 0 && (
              <>
                <p className="mt-4 text-xs text-slate-400">
                  {crm.total} de {crm.totalFuente} clientes
                </p>
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className={encabezados}>
                        <EncabezadoOrdenable etiqueta="Empresa" campo="razonSocial" orden={filtros.orden} direccion={filtros.direccion} onOrden={(campo, dir) => cambiarFiltros({ orden: campo, direccion: dir })} />
                        <th className="px-4 py-2.5">Sector</th>
                        <EncabezadoOrdenable etiqueta="Sin actividad" campo="abandono" orden={filtros.orden} direccion={filtros.direccion} onOrden={(campo, dir) => cambiarFiltros({ orden: campo, direccion: dir })} />
                        <EncabezadoOrdenable etiqueta="Última atención" campo="ultimaAtencion" orden={filtros.orden} direccion={filtros.direccion} onOrden={(campo, dir) => cambiarFiltros({ orden: campo, direccion: dir })} />
                        <EncabezadoOrdenable etiqueta="Último contacto" campo="ultimoContacto" orden={filtros.orden} direccion={filtros.direccion} onOrden={(campo, dir) => cambiarFiltros({ orden: campo, direccion: dir })} />
                        <th className="px-4 py-2.5">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crm.filas.map((fila) => (
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
                {crm.sinInformacion > 0 && (
                  <p className="mt-3 text-xs text-slate-400">
                    {crm.sinInformacion === 1
                      ? '1 empresa cliente sin RUC no se puede evaluar.'
                      : `${crm.sinInformacion} empresas cliente sin RUC no se pueden evaluar.`}
                  </p>
                )}
                {crm.paginas > 1 && <Paginador pagina={paginaCrm} paginas={crm.paginas} onPagina={setPaginaCrm} />}
              </>
            )}
          </>
        )}

        {fuente === 'sigla' && (
          <>
            {cargandoSigla && <p className="mt-6 text-sm text-slate-500">Consultando clientes dormidos en SIGLA…</p>}

            {!cargandoSigla && errorSigla === null && sigla.filas.length === 0 && (
              <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
                {sigla.total === 0 && filtrosActivos
                  ? 'No hay resultados con estos filtros.'
                  : 'No hay clientes de SIGLA sin ficha en este segmento.'}
              </p>
            )}

            {!cargandoSigla && errorSigla === null && sigla.filas.length > 0 && (
              <>
                <p className="mt-4 text-xs text-slate-400">
                  {sigla.total} de {sigla.totalFuente} clientes
                </p>
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className={encabezados}>
                        <EncabezadoOrdenable etiqueta="Cliente en SIGLA" campo="razonSocial" orden={filtros.orden} direccion={filtros.direccion} onOrden={(campo, dir) => cambiarFiltros({ orden: campo, direccion: dir })} />
                        <EncabezadoOrdenable etiqueta="Sin actividad" campo="abandono" orden={filtros.orden} direccion={filtros.direccion} onOrden={(campo, dir) => cambiarFiltros({ orden: campo, direccion: dir })} />
                        <EncabezadoOrdenable etiqueta="Última atención" campo="ultimaAtencion" orden={filtros.orden} direccion={filtros.direccion} onOrden={(campo, dir) => cambiarFiltros({ orden: campo, direccion: dir })} />
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
                <Paginador pagina={paginaSigla} paginas={sigla.paginas} onPagina={setPaginaSigla} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
