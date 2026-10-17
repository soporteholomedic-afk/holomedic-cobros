'use client';

import type { ResultadoProbeVista } from '../../hooks/useConfigAgente';
import { CLASES_BOTON_SECUNDARIO } from './estilos';

/**
 * BotonProbar (agente-ia-crm E5·T6) — "Probar conexión" with a loading
 * state and an aria-live result (ok / detalle).
 */

interface BotonProbarProps {
  probando: boolean;
  resultado: ResultadoProbeVista | null;
  onProbar: () => void;
}

export function BotonProbar({ probando, resultado, onProbar }: BotonProbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={CLASES_BOTON_SECUNDARIO} disabled={probando} onClick={onProbar}>
        {probando ? 'Probando…' : 'Probar conexión'}
      </button>
      <div role="status" aria-live="polite" className="text-sm">
        {resultado && (
          <span
            className={`font-medium ${
              resultado.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-700 dark:text-red-400'
            }`}
          >
            {`${resultado.ok ? 'Correcto' : 'Falló'} — ${resultado.detalle}`}
          </span>
        )}
      </div>
    </div>
  );
}
