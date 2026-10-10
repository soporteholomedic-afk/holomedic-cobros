'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';

import type { ConversacionListada, MensajeCrm } from '../../../domain/entities';
import { useHiloConversacion } from '../../hooks/useHiloConversacion';
import { formatearFecha } from '../../etiquetas';
import { ETIQUETA_ESTADO_CONVERSACION, formatearTelefono, iniciales, tituloFilaConversacion } from './guards';
import { PanelVinculacion } from './PanelVinculacion';

/**
 * HiloConversacion (agente-ia-crm E1) — the bandeja's center column:
 * header (nombre, empresa, estado, teléfono), the thread oldest-first
 * with IN bubbles left (cliente) / OUT bubbles right (La Guía u
 * operador labeled), auto-scroll to the bottom, and the composer
 * (Enter sends / Shift+Enter newline; disabled while empty/sending; a
 * failed send surfaces inline and NEVER drops the draft). CERRADA →
 * composer replaced by the closed notice; PENDIENTE_VINCULACION →
 * composer replaced by PanelVinculacion (linking the conversation IS
 * the action that state demands). Opening the hilo already marks it
 * read server-side (GET contract). All fetches live in
 * useHiloConversacion.
 */

export interface HiloConversacionProps {
  /** The selected bandeja row (names come from the list's JOIN). */
  fila: ConversacionListada;
  /** Mobile only: back to the list (BandejaConversaciones owns it). */
  onVolver: () => void;
  /** Fired after a reply or vinculación so the list refetches. */
  onCambio: () => void;
}

const ETIQUETA_EMISOR: Record<MensajeCrm['emisor'], string> = {
  CLIENTE: 'Cliente',
  IA: 'La Guía',
  HUMANO: 'Operador',
};

function Burbuja({ mensaje }: { mensaje: MensajeCrm }) {
  const esOut = mensaje.direccion === 'OUT';
  return (
    <div
      className={`flex max-w-[80%] flex-col rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
        esOut
          ? 'self-end bg-teal-600 text-white dark:bg-teal-700'
          : 'self-start border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
      }`}
    >
      <span
        className={`mb-0.5 text-[10px] font-bold uppercase tracking-wide ${
          esOut ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {ETIQUETA_EMISOR[mensaje.emisor]}
      </span>
      <span className="whitespace-pre-wrap break-words">{mensaje.cuerpo}</span>
      <span
        className={`mt-1 text-right text-[10px] ${
          esOut ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {formatearFecha(mensaje.creadoEn).split(' ')[1]}
        {mensaje.estadoEnvio === 'FALLIDO' ? ' · envío fallido' : ''}
      </span>
    </div>
  );
}

export function HiloConversacion({ fila, onVolver, onCambio }: HiloConversacionProps) {
  const {
    hilo,
    status,
    error,
    enviando,
    errorEnvio,
    limpiarErrorEnvio,
    enviarMensaje,
    vincular,
    vinculando,
    errorVinculacion,
  } = useHiloConversacion(fila.id);

  const [borrador, setBorrador] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al fondo: al abrir y con cada mensaje nuevo.
  useEffect(() => {
    const nodo = scrollRef.current;
    if (nodo !== null) nodo.scrollTop = nodo.scrollHeight;
  }, [hilo?.mensajes.length, fila.id]);

  // La conversación cerrada o pendiente reemplaza el composer; el
  // borrador NO se limpia al cambiar de estado para no perder texto.
  const estado = hilo?.conversacion.estado ?? fila.estado;
  const composerHabilitado = estado !== 'CERRADA' && estado !== 'PENDIENTE_VINCULACION';

  async function manejarEnvio(): Promise<void> {
    const cuerpo = borrador.trim();
    if (cuerpo === '' || enviando) return;
    const ok = await enviarMensaje(cuerpo);
    if (ok) {
      setBorrador(''); // solo se pierde el texto cuando YA está enviado
      onCambio();
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 px-4 py-3">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a la lista"
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white"
        >
          {iniciales(fila.nombreContacto ?? fila.razonSocial ?? fila.telefono ?? '?')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tituloFilaConversacion(fila)}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {fila.razonSocial ?? 'Sin empresa vinculada'}
            {fila.telefono !== null ? ` · ${formatearTelefono(fila.telefono)}` : ''}
          </p>
        </div>
        <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
          {ETIQUETA_ESTADO_CONVERSACION[estado]}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto bg-slate-50/60 dark:bg-slate-950/30 p-4"
        aria-label="Mensajes"
      >
        {status === 'loading' && (
          <div role="status" className="flex items-center justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">Cargando hilo…</span>
          </div>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="self-center rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-4 text-center text-sm text-red-700 dark:text-red-400"
          >
            {error ?? 'Error al cargar el hilo'}
          </div>
        )}

        {status === 'ready' &&
          hilo?.mensajes.map((mensaje) => <Burbuja key={mensaje.id} mensaje={mensaje} />)}

        {status === 'ready' && hilo !== null && hilo.mensajes.length === 0 && (
          <p className="self-center py-8 text-xs text-slate-400 dark:text-slate-500">
            Sin mensajes todavía.
          </p>
        )}
      </div>

      {estado === 'CERRADA' && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-3">
          <p className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            La conversación está cerrada — no se pueden enviar mensajes.
          </p>
        </div>
      )}

      {estado === 'PENDIENTE_VINCULACION' && (
        <PanelVinculacion
          conversacionId={fila.id}
          telefono={fila.telefono}
          onVincular={async (entrada) => {
            const ok = await vincular(entrada);
            if (ok) onCambio();
            return ok;
          }}
          vinculando={vinculando}
          errorVinculacion={errorVinculacion}
        />
      )}

      {composerHabilitado && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-3">
          {errorEnvio !== null && (
            <p
              role="alert"
              className="mb-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-medium text-red-700 dark:text-red-400"
            >
              {errorEnvio}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Mensaje a enviar"
              placeholder="Escribí tu respuesta… (Enter envía, Shift+Enter salta línea)"
              rows={2}
              value={borrador}
              onChange={(evento) => {
                setBorrador(evento.target.value);
                if (errorEnvio !== null) limpiarErrorEnvio();
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' && !evento.shiftKey) {
                  evento.preventDefault();
                  void manejarEnvio();
                }
              }}
              className="flex-1 resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 px-3 py-2 text-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="button"
              onClick={() => void manejarEnvio()}
              disabled={borrador.trim() === '' || enviando}
              aria-label="Enviar mensaje"
              className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
