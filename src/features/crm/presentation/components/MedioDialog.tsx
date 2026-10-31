'use client';

import { useState, type FormEvent } from 'react';

import { MEDIOS, MEDIO_LABELS, type Medio } from '../../domain/entities';
import { ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO, MEDIO_ESTILO } from './crmUi';
import { ModalFrame } from './ModalFrame';

interface Props {
  titulo: string;
  subtitulo: string;
  inicial: Medio | null;
  onCancelar: () => void;
  /** Resolves to an error message to show in the dialog, or `null` when it was saved. */
  onGuardar: (medio: Medio) => Promise<string | null>;
}

export function MedioDialog({ titulo, subtitulo, inicial, onCancelar, onGuardar }: Props) {
  const [medio, setMedio] = useState<Medio | null>(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    if (!medio) {
      setError('Elige el medio de contacto para continuar.');
      return;
    }
    setError('');
    setGuardando(true);
    const fallo = await onGuardar(medio);
    if (fallo) {
      setError(fallo);
      setGuardando(false);
    }
  }

  return (
    <ModalFrame titulo={titulo} subtitulo={subtitulo} onCerrar={onCancelar}>
      <form onSubmit={enviar} noValidate className="mt-4 grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="sr-only">Medio de contacto</legend>
          {MEDIOS.map((m) => {
            const { icono: Icono, casilla } = MEDIO_ESTILO[m];
            return (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-semibold dark:border-slate-700 ${casilla}`}
              >
                <input
                  type="radio"
                  name="medio"
                  value={m}
                  checked={medio === m}
                  onChange={() => {
                    setMedio(m);
                    setError('');
                  }}
                  className="h-4 w-4"
                />
                <Icono className="h-4 w-4" aria-hidden="true" />
                <span>{MEDIO_LABELS[m]}</span>
              </label>
            );
          })}
        </fieldset>
        {error && (
          <p role="alert" className={ALERTA}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onCancelar} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? 'Guardando…' : 'Guardar medio'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
