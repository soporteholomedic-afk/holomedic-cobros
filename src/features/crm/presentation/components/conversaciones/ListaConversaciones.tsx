'use client';

import { Search } from 'lucide-react';

import type { ConversacionListada } from '../../../domain/entities';
import { formatearFecha } from '../../etiquetas';
import {
  ETIQUETA_ESTADO_CONVERSACION,
  iniciales,
  previsualizarUltimoMensaje,
  tituloFilaConversacion,
} from './guards';

/**
 * ListaConversaciones (agente-ia-crm E1) — the bandeja's left column:
 * live search box (every keystroke reports up; the DEBOUNCE lives in
 * useConversaciones) + one row per conversation, ordered by
 * ultimoMensajeEn DESC (the API owns the order — nothing is re-sorted
 * client-side). Row anatomy (mockup approved): avatar + title (contact
 * name, or "Sin vincular · <tel>" while PENDIENTE_VINCULACION) +
 * razón social + discrete estado chip + time + unread badge (> 0).
 * Visual tokens copied from panel/ (PanelCrm card, Buscador input,
 * InsigniaEstado chip) — slate/teal, WhatsApp-dark stays in the mock.
 * E2·T6: each row also previews the LAST message (glifo de emisor +
 * cuerpo truncado, visually quiet — quieter than the razón social)
 * sourced from listar()'s OUTER APPLY columns; rows without messages
 * show no preview line.
 */

export interface ListaConversacionesProps {
  conversaciones: ConversacionListada[];
  total: number;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  /** Current search term (owned by BandejaConversaciones). */
  busqueda: string;
  onBuscar: (valor: string) => void;
  seleccionada: number | null;
  onSeleccionar: (id: number) => void;
  onReintentar: () => void;
}

function ChipEstado({ estado }: { estado: ConversacionListada['estado'] }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
      {ETIQUETA_ESTADO_CONVERSACION[estado]}
    </span>
  );
}

function FilaConversacion({
  conversacion,
  activa,
  onSeleccionar,
}: {
  conversacion: ConversacionListada;
  activa: boolean;
  onSeleccionar: (id: number) => void;
}) {
  const titulo = tituloFilaConversacion(conversacion);
  const previa = previsualizarUltimoMensaje(
    conversacion.ultimoMensajeCuerpo ?? null,
    conversacion.ultimoMensajeEmisor ?? null,
  );
  return (
    <button
      type="button"
      onClick={() => onSeleccionar(conversacion.id)}
      aria-current={activa ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        activa
          ? 'bg-teal-50 dark:bg-teal-950/40 ring-1 ring-teal-500/40'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white"
      >
        {iniciales(conversacion.nombreContacto ?? conversacion.razonSocial ?? conversacion.telefono ?? '?')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {titulo}
          </span>
          {conversacion.ultimoMensajeEn !== null && (
            <span className="flex-none text-[10px] text-slate-400 dark:text-slate-500">
              {formatearFecha(conversacion.ultimoMensajeEn).split(' ')[1]}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">
            {conversacion.razonSocial ?? 'Sin empresa vinculada'}
          </span>
          {conversacion.noLeidos > 0 ? (
            <span
              aria-label={`${conversacion.noLeidos} mensajes sin leer`}
              className="flex-none rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white"
            >
              {conversacion.noLeidos}
            </span>
          ) : null}
        </span>
        {previa !== null && (
          <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-slate-500">
            {previa}
          </span>
        )}
        <span className="mt-1 flex items-center gap-2">
          <ChipEstado estado={conversacion.estado} />
        </span>
      </span>
    </button>
  );
}

export function ListaConversaciones({
  conversaciones,
  total,
  status,
  error,
  busqueda,
  onBuscar,
  seleccionada,
  onSeleccionar,
  onReintentar,
}: ListaConversacionesProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 p-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Buscar conversación"
            placeholder="Buscar empresa, contacto o teléfono..."
            value={busqueda}
            onChange={(evento) => onBuscar(evento.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 py-2 pl-9 pr-4 text-xs transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500 sm:text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2" role="list" aria-label="Conversaciones">
        {status === 'loading' && (
          <div role="status" className="flex items-center justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">Cargando…</span>
          </div>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-400"
          >
            <span>{error ?? 'Error al cargar las conversaciones'}</span>
            <button
              type="button"
              onClick={onReintentar}
              className="rounded-lg border border-red-300 dark:border-red-800/60 px-3 py-1.5 font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
            >
              Reintentar
            </button>
          </div>
        )}

        {status === 'ready' && conversaciones.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {busqueda.trim() === '' ? 'Sin conversaciones aún' : 'Nada coincide con la búsqueda'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {busqueda.trim() === ''
                ? 'Cuando entre un mensaje de WhatsApp aparecerá acá.'
                : 'Probá con otro término (empresa, contacto o teléfono).'}
            </p>
          </div>
        )}

        {status === 'ready' &&
          conversaciones.map((conversacion) => (
            <FilaConversacion
              key={conversacion.id}
              conversacion={conversacion}
              activa={conversacion.id === seleccionada}
              onSeleccionar={onSeleccionar}
            />
          ))}
      </div>

      {status === 'ready' && total > conversaciones.length && (
        <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
          Mostrando {conversaciones.length} de {total}
        </div>
      )}
    </div>
  );
}
