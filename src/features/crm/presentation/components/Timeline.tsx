import type { HandoffHistorial, TransicionHistorial } from '../../domain/ports';
import { ETIQUETA_ETAPA, etiquetaEvento, formatearFecha } from '../etiquetas';

/**
 * Timeline — the detail page's history section (tasks pr11/WU2, spec
 * G4 audit: who, when, from, to) plus the handoff records (área, nota,
 * usuario, fecha). Purely presentational: data arrives pre-loaded and
 * ordered (newest first) from the detail endpoint. Labels Spanish.
 */
export interface TimelineProps {
  transiciones: TransicionHistorial[];
  handoffs: HandoffHistorial[];
}

export function Timeline({ transiciones, handoffs }: TimelineProps) {
  return (
    <section aria-label="Historial" className="space-y-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Historial de transiciones
        </h2>
        {transiciones.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
            Sin transiciones registradas.
          </p>
        ) : (
          <ul className="space-y-2">
            {transiciones.map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">{etiquetaEvento(t.evento)}</span>
                  <span className="text-xs text-slate-500">
                    {formatearFecha(t.createdAt)} · {t.usuario}
                  </span>
                </div>
                <div className="mt-1 text-slate-600">
                  {t.etapaPrevia === null ? (
                    <span>Creación → {ETIQUETA_ETAPA[t.etapaNueva]}</span>
                  ) : (
                    <span>
                      {ETIQUETA_ETAPA[t.etapaPrevia]} → {ETIQUETA_ETAPA[t.etapaNueva]}
                    </span>
                  )}
                </div>
                {t.motivo !== null && (
                  <p className="mt-1 text-xs text-slate-500">Motivo: {t.motivo}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Handoffs
        </h2>
        {handoffs.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
            Sin handoffs registrados.
          </p>
        ) : (
          <ul className="space-y-2">
            {handoffs.map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">{h.area}</span>
                  <span className="text-xs text-slate-500">
                    {formatearFecha(h.createdAt)} · {h.usuario}
                  </span>
                </div>
                {h.nota !== null && <p className="mt-1 text-xs text-slate-500">Nota: {h.nota}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
