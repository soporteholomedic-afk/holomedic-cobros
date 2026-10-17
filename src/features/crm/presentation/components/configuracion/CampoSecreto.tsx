'use client';

import { useId, useState, type KeyboardEvent } from 'react';

import type { VistaSecretoUi } from '../../hooks/useConfigCanal';
import {
  CLASES_BOTON_PELIGRO,
  CLASES_BOTON_PRIMARIO,
  CLASES_BOTON_SECUNDARIO,
  CLASES_ERROR_CAMPO,
  CLASES_ETIQUETA,
  CLASES_INPUT,
} from './estilos';

/**
 * CampoSecreto (agente-ia-crm E5·T6) — a secret config field that
 * NEVER renders a value: only the server's `mascara` and a
 * configurada / sin configurar / ilegible badge. "Reemplazar" reveals
 * a password input, "Quitar" asks an inline confirmation and sends
 * null. The typed value lives only in this component until the save
 * resolves and is cleared right after.
 */

type Modo = 'reposo' | 'reemplazando' | 'quitando';

interface CampoSecretoProps {
  id: string;
  etiqueta: string;
  vista: VistaSecretoUi;
  /** CRM_CONFIG_KEY missing: editing secrets is disabled. */
  bloqueado: boolean;
  guardando: boolean;
  /** Field-level server error to show under the field. */
  error?: string | null;
  /** Hides Reemplazar/Quitar (secrets managed through a dedicated action). */
  sinAcciones?: boolean;
  /** string = replace, null = delete. Resolves true on success. */
  onGuardar: (valor: string | null) => Promise<boolean>;
}

function insigniaDe(vista: VistaSecretoUi): { texto: string; clase: string } {
  if (vista.ilegible) {
    return { texto: 'Ilegible', clase: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200' };
  }
  if (vista.configurado) {
    return { texto: 'Configurada', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' };
  }
  return { texto: 'Sin configurar', clase: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200' };
}

export function CampoSecreto({
  id,
  etiqueta,
  vista,
  bloqueado,
  guardando,
  error = null,
  sinAcciones = false,
  onGuardar,
}: CampoSecretoProps) {
  const [modo, setModo] = useState<Modo>('reposo');
  const [nuevo, setNuevo] = useState('');
  const idError = useId();
  const insignia = insigniaDe(vista);

  function cancelar(): void {
    setModo('reposo');
    setNuevo('');
  }

  async function guardarReemplazo(): Promise<void> {
    if (nuevo.trim() === '') return;
    const ok = await onGuardar(nuevo);
    if (ok) cancelar();
  }

  async function confirmarQuitar(): Promise<void> {
    const ok = await onGuardar(null);
    if (ok) cancelar();
  }

  function alPulsarTecla(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key === 'Escape') cancelar();
  }

  return (
    <div className="space-y-2" onKeyDown={alPulsarTecla}>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${id}-etiqueta`} className={CLASES_ETIQUETA}>
          {etiqueta}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${insignia.clase}`}>{insignia.texto}</span>
        {vista.mascara !== '' && (
          <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{vista.mascara}</span>
        )}
      </div>

      {!sinAcciones && modo === 'reposo' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={CLASES_BOTON_SECUNDARIO}
            disabled={bloqueado || guardando}
            aria-label={`Reemplazar ${etiqueta}`}
            onClick={() => setModo('reemplazando')}
          >
            Reemplazar
          </button>
          {(vista.configurado || vista.ilegible) && (
            <button
              type="button"
              className={CLASES_BOTON_SECUNDARIO}
              disabled={bloqueado || guardando}
              aria-label={`Quitar ${etiqueta}`}
              onClick={() => setModo('quitando')}
            >
              Quitar
            </button>
          )}
        </div>
      )}

      {modo === 'reemplazando' && (
        <div className="space-y-2">
          <label htmlFor={id} className="sr-only">
            {`Nuevo valor de ${etiqueta}`}
          </label>
          <input
            id={id}
            type="password"
            autoComplete="new-password"
            value={nuevo}
            onChange={(evento) => setNuevo(evento.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            className={CLASES_INPUT}
            placeholder="Pega el nuevo valor"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={CLASES_BOTON_PRIMARIO}
              disabled={guardando}
              aria-label={`Guardar ${etiqueta}`}
              onClick={() => void guardarReemplazo()}
            >
              Guardar
            </button>
            <button type="button" className={CLASES_BOTON_SECUNDARIO} onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {modo === 'quitando' && (
        <div
          role="group"
          aria-label={`Confirmar quitar ${etiqueta}`}
          className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3"
        >
          <p className="text-sm text-amber-900 dark:text-amber-100">
            {`Se eliminará ${etiqueta} guardada; si existe en el entorno, se usará esa.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={CLASES_BOTON_PELIGRO}
              disabled={guardando}
              aria-label={`Confirmar quitar ${etiqueta}`}
              onClick={() => void confirmarQuitar()}
            >
              Sí, quitar
            </button>
            <button type="button" className={CLASES_BOTON_SECUNDARIO} onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p id={idError} className={CLASES_ERROR_CAMPO}>
          {error}
        </p>
      )}
    </div>
  );
}
