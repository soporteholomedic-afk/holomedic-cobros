'use client';

import Link from 'next/link';

import { useAuth } from '@/features/auth/presentation/hooks/useAuth';
import type { UseResumenConocimientoResult } from '../../hooks/useAuditoriaConfig';
import { CLASES_BOTON_SECUNDARIO, CLASES_TARJETA } from './estilos';

/**
 * TabConocimiento (agente-ia-crm E5·T6) — read-only knowledge stats
 * (active entries, by origin, ingestas by state). Editing lives at
 * /admin/crm/conocimiento under its OWN permiso `crm_conocimiento`:
 * the link only shows when the session has it.
 */

interface TabConocimientoProps {
  resumen: UseResumenConocimientoResult;
}

const ETIQUETAS_ORIGEN = [
  ['MANUAL', 'Manual'],
  ['SEMILLA', 'Semilla'],
  ['SUBIDO', 'Subido'],
] as const;

const ETIQUETAS_ESTADO = [
  ['PENDIENTE', 'Pendiente'],
  ['PROCESANDO', 'Procesando'],
  ['COMPLETADA', 'Completada'],
  ['FALLIDA', 'Fallida'],
] as const;

function Conteos({
  titulo,
  id,
  filas,
}: {
  titulo: string;
  id: string;
  filas: ReadonlyArray<readonly [string, number]>;
}) {
  return (
    <section aria-labelledby={id} className={CLASES_TARJETA}>
      <h3 id={id} className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {titulo}
      </h3>
      <dl className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
        {filas.map(([etiqueta, total]) => (
          <div key={etiqueta} className="flex items-center justify-between py-2 text-sm">
            <dt className="text-slate-700 dark:text-slate-300">{etiqueta}</dt>
            <dd className="font-semibold text-slate-900 dark:text-slate-100">{total}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TabConocimiento({ resumen: estado }: TabConocimientoProps) {
  const { user } = useAuth();
  const puedeAdministrar = user?.permisos.includes('crm_conocimiento') === true;
  const { resumen, status, error } = estado;

  return (
    <div className="space-y-6">
      {status === 'loading' && <p className="text-sm text-slate-600 dark:text-slate-400">Cargando conocimiento…</p>}
      {status === 'error' && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
        >
          {error ?? 'No se pudo cargar el resumen de conocimiento.'}
        </p>
      )}

      {resumen && (
        <>
          <div className={CLASES_TARJETA}>
            <p className="text-sm text-slate-700 dark:text-slate-300">Entradas activas</p>
            <p data-testid="conocimiento-total" className="mt-1 text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {resumen.total}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Conteos
              titulo="Por origen"
              id="conocimiento-origen"
              filas={ETIQUETAS_ORIGEN.map(([clave, etiqueta]) => [etiqueta, resumen.porOrigen[clave]] as const)}
            />
            <Conteos
              titulo="Ingestas por estado"
              id="conocimiento-ingestas"
              filas={ETIQUETAS_ESTADO.map(([clave, etiqueta]) => [etiqueta, resumen.ingestasPorEstado[clave]] as const)}
            />
          </div>
        </>
      )}

      <div className={`${CLASES_TARJETA} space-y-2`}>
        {puedeAdministrar ? (
          <Link href="/admin/crm/conocimiento" className={CLASES_BOTON_SECUNDARIO}>
            Administrar conocimiento
          </Link>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Cargar o revisar conocimiento requiere el permiso aparte «crm_conocimiento». Pídelo a un administrador si lo
            necesitas.
          </p>
        )}
      </div>
    </div>
  );
}
