'use client';

import Link from 'next/link';

import type { CandidatoCola } from '../../domain/ports';
import { useColaHoy } from '../hooks/useColaHoy';

/**
 * ColaHoy — the `/crm/cola` queue body (tasks pr13/WU3, spec G4,
 * design §3). Renders the four derived sections ("a quién le toca
 * hoy") with Spanish titles; every empresa row links to its detail
 * page, where the user acts (log the send, decide the fork,
 * reactivate). The queue NEVER sends anything by itself — no
 * auto-send (spec G4 scenario).
 */

const SECCIONES_TITULOS = ['Vencidas hoy', 'Reinicios de cadencia', 'Decisión requerida', 'Reactivables'] as const;

function FilaCola({ fila }: { fila: CandidatoCola }) {
  return (
    <li>
      <Link
        href={`/crm/empresas/${fila.empresaId}`}
        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-sky-400 hover:bg-sky-50"
      >
        <span className="font-medium text-slate-800">{fila.razonSocial}</span>
        <span className="text-xs text-muted-foreground">
          {fila.flujo} / {fila.etapa} · ciclo {fila.ciclo} · envío {fila.enviosCiclo}
        </span>
      </Link>
    </li>
  );
}

export function ColaHoy() {
  const { cola, status, error, retry } = useColaHoy();

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        <span>{error ?? 'Error al cargar la cola'}</span>
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

  if (status === 'loading' || !cola) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
      </div>
    );
  }

  const secciones: { titulo: string; filas: CandidatoCola[] }[] = [
    { titulo: SECCIONES_TITULOS[0], filas: cola.vencidasHoy },
    { titulo: SECCIONES_TITULOS[1], filas: cola.reinicios },
    { titulo: SECCIONES_TITULOS[2], filas: cola.decisionRequerida },
    { titulo: SECCIONES_TITULOS[3], filas: cola.reactivables },
  ];

  return (
    <div className="space-y-6">
      {secciones.map(({ titulo, filas }) => (
        <section key={titulo} aria-label={titulo} className="space-y-2">
          <h2 className="text-lg font-semibold">
            {titulo} <span className="text-sm font-normal text-muted-foreground">({filas.length})</span>
          </h2>
          {filas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-muted-foreground">
              Sin empresas
            </p>
          ) : (
            <ul className="space-y-2">
              {filas.map((fila) => (
                <FilaCola key={fila.empresaId} fila={fila} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
