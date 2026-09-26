'use client';

import { useState, type FormEvent } from 'react';

import { useTransicion } from '../hooks/useTransicion';
import { ModalBase } from './ModalBase';

/**
 * RechazoModal — captures the T14 rejection motivo (required, ≤300 —
 * mirrored by the pr10 use case validation) and fires the machine
 * event through the transitions endpoint (tasks pr11/WU3, spec G4:
 * "rejection with motive and cooldown"). Success hands control back to
 * the parent, which refreshes the detail; failures show the API's
 * Spanish error verbatim and keep the form open.
 */
export interface RechazoModalProps {
  empresaId: number;
  onSalir: () => void;
  onExito: () => void;
}

export function RechazoModal({ empresaId, onSalir, onExito }: RechazoModalProps) {
  const { ejecutar, enCurso } = useTransicion(empresaId);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(eventoForm: FormEvent<HTMLFormElement>): Promise<void> {
    eventoForm.preventDefault();
    const motivoTrim = motivo.trim();
    if (motivoTrim === '') {
      setError('El motivo es obligatorio.');
      return;
    }
    if (motivoTrim.length > 300) {
      setError('El motivo no puede superar los 300 caracteres.');
      return;
    }
    setError(null);
    const resultado = await ejecutar({ evento: 'Rechazo', motivo: motivoTrim });
    if (resultado.ok) {
      onExito();
    } else {
      setError(resultado.error);
    }
  }

  return (
    <ModalBase titulo="Rechazar empresa" onSalir={onSalir}>
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <label htmlFor="motivo-rechazo" className="mb-1 block text-sm font-medium text-slate-700">
            Motivo
          </label>
          <textarea
            id="motivo-rechazo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="¿Por qué se rechaza la empresa?"
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
          className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Rechazar
        </button>
      </form>
    </ModalBase>
  );
}
