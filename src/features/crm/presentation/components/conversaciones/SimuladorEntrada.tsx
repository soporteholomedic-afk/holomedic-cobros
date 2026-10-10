'use client';

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';

import type { ResultadoSimulacionUi } from '../../hooks/useConversaciones';

/**
 * SimuladorEntrada (agente-ia-crm E1, "Simulación Kapso") — visible
 * ONLY while the canal runs simulado (the server's modoSimulado gates
 * the card in BandejaConversaciones; this component never reads env
 * vars): synthesizes an inbound WhatsApp message through the REAL
 * pipeline so the whole circuit (ingesta → vinculación → bandeja →
 * respuesta) is demoable before Kapso credentials exist. The POST
 * lives in useConversaciones.simularEntrada — this is pure UI.
 */

export interface SimuladorEntradaProps {
  onSimular: (telefono: string, texto: string) => Promise<ResultadoSimulacionUi>;
}

export function SimuladorEntrada({ onSimular }: SimuladorEntradaProps) {
  const [telefono, setTelefono] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const habilitado = telefono.trim() !== '' && texto.trim() !== '' && !enviando;

  async function manejarSimulacion(): Promise<void> {
    setEnviando(true);
    setError(null);
    const resultado = await onSimular(telefono.trim(), texto.trim());
    if (resultado.ok) {
      setTexto(''); // el número se conserva: simular varias del mismo chat
    } else {
      setError(resultado.error);
    }
    setEnviando(false);
  }

  return (
    <section
      aria-label="Simulador de mensaje entrante"
      className="rounded-2xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4"
    >
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Simular mensaje entrante
        </h2>
        <span className="rounded-full border border-amber-400/60 dark:border-amber-800/60 bg-amber-100/70 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          modo simulado — Kapso no conectado
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          aria-label="Teléfono a simular"
          placeholder="0981 234 567"
          value={telefono}
          onChange={(evento) => setTelefono(evento.target.value)}
          className="w-full rounded-lg border border-amber-300 dark:border-amber-900/60 bg-white dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 px-3 py-2 text-xs transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500 sm:w-48 sm:text-sm"
        />
        <input
          type="text"
          aria-label="Texto del mensaje a simular"
          placeholder="Hola, quiero información sobre exámenes ocupacionales"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          className="flex-1 rounded-lg border border-amber-300 dark:border-amber-900/60 bg-white dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 px-3 py-2 text-xs transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500 sm:text-sm"
        />
        <button
          type="button"
          disabled={!habilitado}
          onClick={() => void manejarSimulacion()}
          className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
        >
          {enviando ? 'Simulando…' : 'Simular mensaje entrante'}
        </button>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-medium text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </section>
  );
}
