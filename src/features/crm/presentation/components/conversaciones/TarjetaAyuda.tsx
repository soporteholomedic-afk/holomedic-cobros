'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';

import type { SolicitudAyudaVista } from './guards';

/**
 * TarjetaAyuda (agente-ia-crm E3·T5) — the help card at the bottom of
 * the thread (mockup .helpcard): la Guía escalates with the full
 * context — what the client asked (consulta quoted), what she
 * searched (términos as chips) and the score that defeated her — and
 * the operator answers with ONE indicación (she keeps driving, the
 * operator never types the client reply). Success shows the
 * aria-live ✓ line and clears ONLY the card input: the composer
 * draft lives in HiloConversacion and is untouchable from here.
 * `enviada`/`onEnviada` are Hilo-owned so the ✓ SURVIVES the hilo
 * refetch that unmounts the solicitud.
 */

export interface TarjetaAyudaProps {
  /** The PENDIENTE request; null only in the sent-aftermath render. */
  solicitud: SolicitudAyudaVista | null;
  /** true → the indicación landed; only the ✓ line renders. */
  enviada: boolean;
  onEnviada: (enviada: boolean) => void;
  enviando: boolean;
  error: string | null;
  /** POST indicacion; true → applied (hilo refetches). */
  onEnviar: (indicacion: string) => Promise<boolean>;
}

export function TarjetaAyuda({
  solicitud,
  enviada,
  onEnviada,
  enviando,
  error,
  onEnviar,
}: TarjetaAyudaProps) {
  const [texto, setTexto] = useState('');

  async function manejarEnvio(): Promise<void> {
    const indicacion = texto.trim();
    if (indicacion === '' || enviando) return;
    const ok = await onEnviar(indicacion);
    if (ok) {
      setTexto(''); // SOLO el input de la tarjeta
      onEnviada(true);
    }
  }

  if (enviada) {
    return (
      <div className="self-end max-w-[80%] rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3 text-sm shadow-sm">
        <p role="status" aria-live="polite" className="font-medium text-indigo-700 dark:text-indigo-300">
          ✓ Indicación guardada — la Guía continúa con el cliente
        </p>
      </div>
    );
  }

  if (solicitud === null) return null;

  return (
    <div className="self-end w-[80%] rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
          🤖 La Guía pregunta: ¿cómo sigo?
        </p>
      </div>

      <div className="mt-2 space-y-2 text-xs text-indigo-900/90 dark:text-indigo-100/90">
        <p>
          El cliente preguntó:{' '}
          <span className="italic">«{solicitud.consulta}»</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {solicitud.terminosBuscados.length > 0 && (
            <>
              <span className="text-indigo-700/80 dark:text-indigo-300/80">La Guía buscó:</span>
              {solicitud.terminosBuscados.map((termino) => (
                <span
                  key={termino}
                  className="rounded-full bg-white/70 dark:bg-indigo-900/50 px-2 py-0.5 font-medium"
                >
                  {termino}
                </span>
              ))}
            </>
          )}
          {solicitud.score !== null && (
            <span className="rounded-full bg-white/70 dark:bg-indigo-900/50 px-2 py-0.5 font-semibold">
              score {solicitud.score.toFixed(2)}
            </span>
          )}
        </div>
        <p className="font-medium text-indigo-800 dark:text-indigo-200">
          Decime cómo responder y sigo yo.
        </p>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-medium text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          aria-label="Indicación para la Guía"
          placeholder="Tu indicación para la Guía…"
          rows={2}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          className="flex-1 resize-none rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-indigo-950 dark:text-indigo-50 dark:placeholder-indigo-400/70 px-3 py-2 text-xs transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
        />
        <button
          type="button"
          onClick={() => void manejarEnvio()}
          disabled={texto.trim() === '' || enviando}
          className="flex-none rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        >
          Enviar indicación
        </button>
      </div>
    </div>
  );
}
