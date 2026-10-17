'use client';

import type { ErrorGuardadoConfig } from '../../hooks/useConfigAgente';
import { CLASES_AVISO_ERROR } from './estilos';

/**
 * EstadoGuardado (agente-ia-crm E5·T6) — the save-result strip of a
 * tab. The live region is ALWAYS mounted (so screen readers announce
 * the text when it appears); a server error that is not attached to a
 * field of the form is shown as a role=alert.
 */

interface EstadoGuardadoProps {
  exito: boolean;
  /** Server error NOT shown next to a field (null otherwise). */
  errorGeneral: ErrorGuardadoConfig | null;
}

export function EstadoGuardado({ exito, errorGeneral }: EstadoGuardadoProps) {
  return (
    <div className="space-y-2">
      <div role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
        {exito ? 'Cambios guardados.' : ''}
      </div>
      {errorGeneral && (
        <p role="alert" className={CLASES_AVISO_ERROR}>
          {errorGeneral.mensaje}
        </p>
      )}
    </div>
  );
}
