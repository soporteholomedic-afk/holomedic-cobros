'use client';

import { useState, type FormEvent } from 'react';

import { useTransicion } from '../hooks/useTransicion';
import { ModalBase } from './ModalBase';

/**
 * HandoffModal — captures the T5 handoff record (área required ≤100,
 * nota optional) and fires the machine event through the transitions
 * endpoint, which writes the CRM_Handoffs row inside the atomic
 * transition bundle (tasks pr11/WU3, spec G4). Success hands control
 * back to the parent (detail refresh); failures show the API's Spanish
 * error verbatim and keep the form open.
 */
export interface HandoffModalProps {
  empresaId: number;
  onSalir: () => void;
  onExito: () => void;
}

export function HandoffModal({ empresaId, onSalir, onExito }: HandoffModalProps) {
  const { ejecutar, enCurso } = useTransicion(empresaId);
  const [area, setArea] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(eventoForm: FormEvent<HTMLFormElement>): Promise<void> {
    eventoForm.preventDefault();
    const areaTrim = area.trim();
    if (areaTrim === '') {
      setError('El área es obligatoria.');
      return;
    }
    const notaTrim = nota.trim();
    setError(null);
    const resultado = await ejecutar({
      evento: 'HandoffRegistrado',
      // JSON.stringify drops undefined — the route guard accepts a
      // string nota or its absence, never null (pr10 shape contract).
      handoff: { area: areaTrim, nota: notaTrim === '' ? undefined : notaTrim },
    });
    if (resultado.ok) {
      onExito();
    } else {
      setError(resultado.error);
    }
  }

  return (
    <ModalBase titulo="Registrar handoff" onSalir={onSalir}>
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <label htmlFor="area-handoff" className="mb-1 block text-sm font-medium text-slate-700">
            Área
          </label>
          <input
            id="area-handoff"
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Área receptora"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </div>
        <div>
          <label htmlFor="nota-handoff" className="mb-1 block text-sm font-medium text-slate-700">
            Nota (opcional)
          </label>
          <textarea
            id="nota-handoff"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder="Instrucciones para el área receptora"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </div>
        {error !== null && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={enCurso}
          className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Registrar handoff
        </button>
      </form>
    </ModalBase>
  );
}
