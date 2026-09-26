'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { ENVIOS_POR_CICLO } from '../../domain/cadence';
import type { CandidatoCola } from '../../domain/ports';
import type { Empresa } from '../../domain/entities';
import { ETIQUETA_FLUJO } from '../etiquetas';
import { useColaHoy } from '../hooks/useColaHoy';
import { ModalAgregarEmpresa } from './ModalAgregarEmpresa';

/**
 * ColaHoy — the `/crm/cola` queue body (tasks pr13/WU3, spec G4,
 * design §3; kanban redesign crm-ux). Renders the four derived
 * sections as a READ-ONLY kanban board: one column per section with
 * an action-first Spanish title (intuitive vocabulary — what the
 * vendedor does, not the domain jargon) and a per-column accent so
 * the day's mix reads at a glance.
 *
 * Every card links to the empresa detail page, where the user acts
 * (log the send, decide the fork, reactivate). The board NEVER sends
 * anything by itself — no auto-send (spec G4 scenario) — and cards
 * cannot be dragged between columns: membership is derived by the
 * pure `seccionCola` predicates (domain/cadence), never hand-placed.
 *
 * Quick capture (crm-ux redesign): when the page passes the session
 * user, a "Agregar empresa" button opens ModalAgregarEmpresa with TWO
 * paths — claim a pool empresa for yourself, or register a new one
 * auto-assigned to you. Either way the empresa does NOT land in any
 * board column (columns are due-state derived); it shows up in "Mi
 * cartera", so the success toast links there.
 */

type ClaveSeccion = 'sinGestion' | 'vencidasHoy' | 'reinicios' | 'decisionRequerida' | 'reactivables';

interface ColumnaKanban {
  clave: ClaveSeccion;
  titulo: string;
  descripcion: string;
  /** Column header dot — full literal Tailwind classes (JIT scanning). */
  punto: string;
  /** Count badge — full literal Tailwind classes (JIT scanning). */
  conteo: string;
}

const COLUMNAS: readonly ColumnaKanban[] = [
  {
    clave: 'sinGestion',
    titulo: 'Iniciar contacto',
    descripcion: 'Tuyas, sin primer envío',
    punto: 'bg-violet-500',
    conteo: 'bg-violet-100 text-violet-700',
  },
  {
    clave: 'vencidasHoy',
    titulo: 'Enviar hoy',
    descripcion: 'Seguimiento con fecha cumplida',
    punto: 'bg-sky-500',
    conteo: 'bg-sky-100 text-sky-700',
  },
  {
    clave: 'reinicios',
    titulo: 'Volver a contactar',
    descripcion: 'Descanso completado',
    punto: 'bg-indigo-500',
    conteo: 'bg-indigo-100 text-indigo-700',
  },
  {
    clave: 'decisionRequerida',
    titulo: 'Esperan tu decisión',
    descripcion: `Sin respuesta tras ${ENVIOS_POR_CICLO} envíos`,
    punto: 'bg-amber-500',
    conteo: 'bg-amber-100 text-amber-700',
  },
  {
    clave: 'reactivables',
    titulo: 'Para reactivar',
    descripcion: 'Rechazo enfriado',
    punto: 'bg-emerald-500',
    conteo: 'bg-emerald-100 text-emerald-700',
  },
];

function TarjetaCola({ fila }: { fila: CandidatoCola }) {
  const contactoNombre = fila.contactoNombre ?? null;
  const contactoCorreo = fila.contactoCorreo ?? null;
  return (
    <li>
      <Link
        href={`/crm/empresas/${fila.empresaId}`}
        className="block rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50"
      >
        <span className="block truncate text-sm font-medium text-slate-800">{fila.razonSocial}</span>
        {contactoNombre !== null && (
          <span className="mt-0.5 block truncate text-xs text-slate-600">
            {contactoNombre}
            {contactoCorreo !== null ? ` · ${contactoCorreo}` : ''}
          </span>
        )}
        <span className="mt-1 block truncate text-xs text-slate-500">
          {ETIQUETA_FLUJO[fila.flujo]} · ciclo {fila.ciclo} · envío {fila.enviosCiclo}/{ENVIOS_POR_CICLO}
        </span>
        {fila.motivoRechazo !== null && (
          <span className="mt-1 block truncate text-xs text-slate-400">Motivo: {fila.motivoRechazo}</span>
        )}
      </Link>
    </li>
  );
}

export interface ColaHoyProps {
  /** Session username (session.sub) — enables the quick-capture button. */
  usuario?: string | null;
  /** Session display name for the modal subtitle. */
  nombreUsuario?: string | null;
}

export function ColaHoy({ usuario = null, nombreUsuario = null }: ColaHoyProps) {
  const { cola, status, error, retry } = useColaHoy();
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);

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

  const manejarCreada = (empresa: Empresa) => {
    setModalAbierto(false);
    toast.success('Empresa agregada', {
      description: `${empresa.razonSocial} quedó asignada a ti — la verás en Mi cartera.`,
      action: { label: 'Ver cartera', onClick: () => router.push('/crm/cartera') },
    });
  };

  const manejarAsignada = (empresa: Empresa) => {
    setModalAbierto(false);
    toast.success('Empresa asignada', {
      description: `${empresa.razonSocial} quedó a tu cargo — la verás en Mi cartera.`,
      action: { label: 'Ver cartera', onClick: () => router.push('/crm/cartera') },
    });
  };

  return (
    <div className="space-y-4">
      {usuario !== null && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar empresa
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNAS.map(({ clave, titulo, descripcion, punto, conteo }) => {
          const filas = cola[clave];
          return (
            <section
              key={clave}
              aria-label={titulo}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <header className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className={`inline-block h-2 w-2 rounded-full ${punto}`} aria-hidden="true" />
                    {titulo}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conteo}`}>
                  {filas.length}
                </span>
              </header>
              {filas.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
                  Sin empresas
                </p>
              ) : (
                <ul className="space-y-2">
                  {filas.map((fila) => (
                    <TarjetaCola key={fila.empresaId} fila={fila} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {modalAbierto && usuario !== null && (
        <ModalAgregarEmpresa
          usuario={usuario}
          nombreUsuario={nombreUsuario}
          onCerrar={() => setModalAbierto(false)}
          onCreada={manejarCreada}
          onAsignada={manejarAsignada}
        />
      )}
    </div>
  );
}
