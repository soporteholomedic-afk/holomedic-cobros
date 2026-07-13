/**
 * PR envio-resultados CAMO/EMO wizard — WU-2a.2.
 *
 * `Step1Pacientes` is the multi-select patient picker for the envio
 * wizard. The component is presentational: it renders one row per
 * `UnifiedPerson` passed in via `people`, highlights the rows whose
 * `dni` is in `selectedDnIs`, and dispatches toggle / advance
 * callbacks. The actual state lives in `useEnvioWizard` (PR 1).
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-004 — Step 1 Pacientes.
 *  - Scenarios S-003, S-004, S-005.
 */
'use client';

import { Check } from 'lucide-react';
import type { ReactElement } from 'react';
import type { UnifiedPerson } from '@/types/sp-result';

export interface Step1PacientesProps {
  /** Already filtered by `useUnifiedResults(companyName, …)` upstream. */
  people: ReadonlyArray<UnifiedPerson>;
  /**
   * Set of DNIs the operator has already picked. The component does
   * NOT mutate this set; it derives a per-row `data-selected`
   * attribute from membership.
   */
  selectedDnIs: ReadonlySet<string>;
  /** Fired when a row is clicked. Receives the row's `dni`. */
  onToggle: (dni: string) => void;
  /**
   * Fired when the operator chooses to abandon the wizard without
   * selecting anyone. Per spec, this is the same as closing the
   * wizard (cancel). The parent calls `onClose` after the user
   * explicitly confirms — out of scope here.
   */
  onSaltar: () => void;
  /** Fired when the operator clicks "Siguiente" with at least one pick. */
  onNext: () => void;
}

export function Step1Pacientes({
  people,
  selectedDnIs,
  onToggle,
  onSaltar,
  onNext,
}: Step1PacientesProps): ReactElement {
  const canAdvance = selectedDnIs.size > 0;

  return (
    <div
      className="flex flex-col h-full"
      data-testid="step1-pacientes"
    >
      {/* Step header — mirrors DocumentVerificationModal's chrome. */}
      <header className="px-1 pb-4">
        <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
          Paso 1
        </span>
        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
          Pacientes
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Selecciona los pacientes que enviarás.
        </p>
      </header>

      {/* Patient list */}
      <ul
        data-testid="step1-patient-list"
        className="flex-1 overflow-y-auto space-y-2"
      >
        {people.length === 0 ? (
          <li
            data-testid="step1-empty"
            className="px-4 py-8 text-center text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200"
          >
            No hay pacientes en este lote.
          </li>
        ) : (
          people.map((person) => {
            const isSelected = selectedDnIs.has(person.dni);
            return (
              <li key={person.dni}>
                <button
                  type="button"
                  data-testid={`step1-row-${person.dni}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  onClick={() => onToggle(person.dni)}
                  aria-pressed={isSelected}
                  className={
                    isSelected
                      ? 'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-sky-300 bg-sky-50/60 hover:bg-sky-50 transition-colors text-left'
                      : 'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left'
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {person.nombre}
                    </p>
                    <p className="text-xs text-slate-500">DNI {person.dni}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={
                      isSelected
                        ? 'inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky-500 text-white flex-shrink-0'
                        : 'inline-flex items-center justify-center w-7 h-7 rounded-full border border-slate-300 text-transparent flex-shrink-0'
                    }
                  >
                    <Check className="w-4 h-4" />
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      {/* Footer — Saltar (secondary) + Siguiente (primary, gated on selection). */}
      <footer className="pt-4 flex items-center justify-between border-t border-slate-100 mt-4">
        <button
          type="button"
          onClick={onSaltar}
          data-testid="step1-saltar"
          className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors"
        >
          Saltar
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          data-testid="step1-siguiente"
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none"
        >
          Siguiente
        </button>
      </footer>
    </div>
  );
}
