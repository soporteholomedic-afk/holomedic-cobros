'use client';

import { useState } from 'react';

import { CLASES_BOTON_SECUNDARIO } from './estilos';

/**
 * BotonCopiar (agente-ia-crm E5·T6) — copies a value to the clipboard
 * and announces the result through an aria-live region. The value is
 * only handed to the Clipboard API; it is never logged.
 */

interface BotonCopiarProps {
  valor: string;
  /** Accessible name, e.g. "Copiar URL del webhook". */
  etiqueta: string;
}

type EstadoCopia = 'inactivo' | 'copiado' | 'fallido';

export function BotonCopiar({ valor, etiqueta }: BotonCopiarProps) {
  const [estado, setEstado] = useState<EstadoCopia>('inactivo');

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(valor);
      setEstado('copiado');
    } catch {
      setEstado('fallido');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" aria-label={etiqueta} className={CLASES_BOTON_SECUNDARIO} onClick={() => void copiar()}>
        Copiar
      </button>
      <span role="status" aria-live="polite" className="text-xs text-slate-700 dark:text-slate-300">
        {estado === 'copiado' ? 'Copiado' : estado === 'fallido' ? 'No se pudo copiar' : ''}
      </span>
    </span>
  );
}
