'use client';

import { useState } from 'react';

import type { EventoPipeline } from '../../domain/maquinaEstados';
import {
  ETIQUETA_ETAPA,
  ETIQUETA_EVENTO,
  ETIQUETA_FLUJO,
  formatearFecha,
  transicionesDisponibles,
} from '../etiquetas';
import { useEmpresaDetalle } from '../hooks/useEmpresaDetalle';
import { useTransicion } from '../hooks/useTransicion';
import { Timeline } from './Timeline';

/**
 * EmpresaDetalle — the `/crm/empresas/[id]` detail body (tasks
 * pr11/WU2, spec G1+G4): empresa datos, contactos with correos and the
 * principal badge, the pipeline state with the machine-legal
 * transitions (`puedeTransicionar` over the runtime whitelist) and the
 * history Timeline. Fetch lives in hooks, never here (repo rule).
 *
 * Transition routing: T14 (Rechazo) and T5 (HandoffRegistrado) need
 * extra input, so they open their modals (pr11/WU3) instead of firing
 * directly; every other available event POSTs immediately and refreshes
 * the detail on success. Labels Spanish.
 */

/** The two events whose button opens a modal (WU3) instead of firing. */
const EVENTOS_CON_MODAL: readonly EventoPipeline[] = ['Rechazo', 'HandoffRegistrado'];

export function EmpresaDetalle({ id }: { id: number }) {
  const { detalle, status, error, retry, refresh } = useEmpresaDetalle(id);
  const { ejecutar, enCurso } = useTransicion(id);
  const [modal, setModal] = useState<'Rechazo' | 'HandoffRegistrado' | null>(null);
  const [errorTransicion, setErrorTransicion] = useState<string | null>(null);

  async function transicionDirecta(evento: EventoPipeline): Promise<void> {
    setErrorTransicion(null);
    const resultado = await ejecutar({ evento });
    if (resultado.ok) {
      refresh();
    } else {
      setErrorTransicion(resultado.error);
    }
  }

  function abrirEvento(evento: EventoPipeline): void {
    if (evento === 'Rechazo' || evento === 'HandoffRegistrado') {
      setErrorTransicion(null);
      setModal(evento);
      return;
    }
    void transicionDirecta(evento);
  }

  if (status === 'loading') {
    return (
      <div role="status" className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
        <span className="ml-3 text-sm text-slate-500">Cargando empresa…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        <span>{error ?? 'Error al cargar la empresa'}</span>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // status === 'ready' implies a non-null detalle — the hook sets them
  // together; the guard satisfies the type checker without a cast.
  if (detalle === null) return null;
  const { empresa, pipeline, transiciones, handoffs } = detalle;
  const disponibles = pipeline ? transicionesDisponibles(pipeline) : [];

  return (
    <div className="space-y-6">
      <section aria-label="Datos de la empresa" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-800">{empresa.razonSocial}</h1>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">RUC</dt>
            <dd className="font-mono text-slate-700">{empresa.ruc}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Tipo</dt>
            <dd className="text-slate-700">{empresa.tipo}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Origen</dt>
            <dd className="text-slate-700">{empresa.origen ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Responsable</dt>
            <dd className="text-slate-700">{empresa.responsable ?? 'Sin asignar'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Proyecto / Obra</dt>
            <dd className="text-slate-700">{empresa.proyectoObra ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Destino común</dt>
            <dd className="text-slate-700">{empresa.destinoComun ?? '—'}</dd>
          </div>
        </dl>
        {empresa.notas !== null && (
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <span className="font-medium">Notas: </span>
            {empresa.notas}
          </p>
        )}
      </section>

      <section aria-label="Contactos" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Contactos
        </h2>
        <ul className="space-y-3">
          {empresa.contactos.map((contacto) => (
            <li key={contacto.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{contacto.nombre}</span>
                {contacto.esPrincipal && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                    Principal
                  </span>
                )}
              </div>
              {contacto.telefono !== null && (
                <p className="mt-1 text-slate-600">Teléfono: {contacto.telefono}</p>
              )}
              {contacto.correos.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {contacto.correos.map((correo) => (
                    <li key={correo.id} className="text-slate-600">
                      {correo.correo}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Pipeline" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pipeline
        </h2>
        {pipeline === null ? (
          <p className="text-sm text-slate-500">Esta empresa no tiene pipeline registrado.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {ETIQUETA_FLUJO[pipeline.flujo]}
              </span>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-700">
                {ETIQUETA_ETAPA[pipeline.etapa]}
              </span>
              <span className="text-xs text-slate-500">
                Ciclo {pipeline.ciclo} · Envíos del ciclo {pipeline.enviosCiclo}
              </span>
            </div>

            {pipeline.etapa === 'RECHAZADO' && pipeline.motivoRechazo !== null && (
              <p className="text-sm text-slate-600">
                Motivo: {pipeline.motivoRechazo}
                {pipeline.rechazadoHasta !== null && (
                  <> · Reactivable desde {formatearFecha(pipeline.rechazadoHasta)}</>
                )}
              </p>
            )}
            {pipeline.etapa === 'DESCANSO' && pipeline.descansoHasta !== null && (
              <p className="text-sm text-slate-600">
                En descanso hasta {formatearFecha(pipeline.descansoHasta)}
              </p>
            )}

            {disponibles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {disponibles.map((evento) => (
                  <button
                    key={evento}
                    type="button"
                    disabled={enCurso}
                    onClick={() => abrirEvento(evento)}
                    className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {ETIQUETA_EVENTO[evento]}
                  </button>
                ))}
              </div>
            )}

            {errorTransicion !== null && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorTransicion}
              </p>
            )}
          </div>
        )}
      </section>

      <Timeline transiciones={transiciones} handoffs={handoffs} />
    </div>
  );
}
