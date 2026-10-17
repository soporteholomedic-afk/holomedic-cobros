'use client';

import { useId } from 'react';

import type { FuenteConfigUi } from '../../hooks/useConfigAgente';
import { CLASES_AYUDA, CLASES_ERROR_CAMPO, CLASES_ETIQUETA, CLASES_INPUT } from './estilos';

/**
 * CampoFormulario (agente-ia-crm E5·T6) — one labelled config input:
 * label bound to the control, optional origin chip (BD / entorno / por
 * defecto), help text and an inline error wired through
 * aria-describedby / aria-invalid.
 */

const ETIQUETA_FUENTE: Record<FuenteConfigUi, { texto: string; clase: string }> = {
  db: { texto: 'BD', clase: 'bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200' },
  env: { texto: 'Entorno', clase: 'bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200' },
  default: { texto: 'Por defecto', clase: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
};

export function ChipOrigen({ fuente }: { fuente: FuenteConfigUi }) {
  const { texto, clase } = ETIQUETA_FUENTE[fuente];
  return (
    <span
      title="Origen del valor efectivo"
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${clase}`}
    >
      {texto}
    </span>
  );
}

interface OpcionSelect {
  valor: string;
  etiqueta: string;
}

interface CampoFormularioProps {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  tipo?: 'text' | 'number' | 'textarea' | 'select';
  fuente?: FuenteConfigUi | null;
  error?: string | null;
  ayuda?: string;
  opciones?: OpcionSelect[];
  min?: number;
  max?: number;
  step?: number | 'any';
  maxLength?: number;
  disabled?: boolean;
}

export function CampoFormulario({
  etiqueta,
  valor,
  onCambio,
  tipo = 'text',
  fuente = null,
  error = null,
  ayuda,
  opciones = [],
  min,
  max,
  step,
  maxLength,
  disabled = false,
}: CampoFormularioProps) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;

  const comunes = {
    id,
    disabled,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: CLASES_INPUT,
  } as const;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className={CLASES_ETIQUETA}>
          {etiqueta}
        </label>
        {fuente && <ChipOrigen fuente={fuente} />}
      </div>

      {tipo === 'textarea' ? (
        <textarea
          {...comunes}
          rows={3}
          maxLength={maxLength}
          value={valor}
          onChange={(evento) => onCambio(evento.target.value)}
        />
      ) : tipo === 'select' ? (
        <select {...comunes} value={valor} onChange={(evento) => onCambio(evento.target.value)}>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...comunes}
          type={tipo}
          inputMode={tipo === 'number' ? 'decimal' : undefined}
          min={min}
          max={max}
          step={step}
          value={valor}
          onChange={(evento) => onCambio(evento.target.value)}
        />
      )}

      {ayuda && (
        <p id={idAyuda} className={CLASES_AYUDA}>
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className={CLASES_ERROR_CAMPO}>
          {error}
        </p>
      )}
    </div>
  );
}
