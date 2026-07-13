/**
 * PR envio-resultados CAMO/EMO wizard — WU-2a.4.
 *
 * `EnvioResultadosWizard` is the modal shell that owns the
 * `useEnvioWizard` reducer and routes the current step to its
 * sub-component. The shell is responsible for:
 *
 *  1. Modal chrome — fixed backdrop, header with X close, Escape
 *     key handler, `role="dialog" aria-modal="true"`.
 *  2. Stepper — renders the 4-chip `WizardStepper` (PR 1).
 *  3. Step routing — switches on `state.currentStep` to render
 *     `Step1Pacientes` (1), `Step2Camo` (2), or a placeholder for
 *     step 3 / 4. Step 3 and 4 are explicitly placeholders in this
 *     PR; they become `Step3Emo` and `Step4Resumen` in PR 2b / PR 3.
 *  4. Reducer wiring — `togglePatient`, `next`, `prev`, `setCamo`,
 *     `setEmo`, `goToStep` flow from the step sub-components to
 *     `useEnvioWizard`.
 *  5. State sync — `onStateChange` fires after every reducer
 *     transition so the parent (`WorkerDetailTable` in PR 3) can
 *     keep a snapshot for the wizard → email round-trip.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-002 — wizard shell + stepper, Escape closes.
 *  - REQ-003 — useEnvioWizard state machine (observed via shell).
 *  - Scenarios S-001, S-021.
 */
'use client';

import { useEffect, type ReactElement } from 'react';
import { X } from 'lucide-react';

import { useEnvioWizard, type WizardState } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import { Step1Pacientes } from '@/features/envio-resultados/presentation/components/wizard/Step1Pacientes';
import { Step2Camo } from '@/features/envio-resultados/presentation/components/wizard/Step2Camo';
import { WizardStepper } from '@/features/envio-resultados/presentation/components/wizard/WizardStepper';
import type { UnifiedPerson } from '@/types/sp-result';

export interface EnvioResultadosWizardProps {
  /**
   * Already filtered by `useUnifiedResults(companyName, fechaInicio,
   * fechaFin)`. Passed through to `Step1Pacientes` unchanged.
   */
  people: ReadonlyArray<UnifiedPerson>;
  /** Display name for the wizard header (the company/lot label). */
  companyName: string;
  /**
   * Optional restored state (used by the PR3 wizard → email round-trip
   * to remount the wizard at step 4 with the previous picks intact).
   * For PR 2a the field is plumbed but unused in production flows
   * (the Enviar button always opens a fresh wizard).
   */
  initialState?: WizardState;
  /**
   * Fired on Escape, backdrop click, X button, or Step 1 "Saltar".
   * The parent unmounts the wizard on this callback.
   */
  onClose: () => void;
  /**
   * Fired after every reducer transition. The parent stores the
   * latest state so it can restore the wizard (e.g. on
   * EmailEditor "Volver al paso 4"). PR 2a plumbs this through; the
   * round-trip wiring lands in PR 3.
   */
  onStateChange: (s: WizardState) => void;
}

export function EnvioResultadosWizard({
  people,
  companyName,
  initialState,
  onClose,
  onStateChange,
}: EnvioResultadosWizardProps): ReactElement {
  const {
    state,
    canAdvance,
    togglePatient,
    setCamo,
    next,
    prev,
    goToStep,
  } = useEnvioWizard({ people: people as ReadonlyArray<{ dni: string }>, initialState });

  // Snapshot the latest state to the parent. This effect runs AFTER
  // every commit, so the first render fires it once with the initial
  // state (matches the test contract). Subsequent dispatches fire it
  // again with the next state. The effect intentionally does NOT
  // exclude the initial render — the test asserts the call count
  // grows on every transition.
  useEffect(() => {
    onStateChange(state);
  }, [state, onStateChange]);

  // Escape key closes the wizard. Mirrors the FilesModal / Document
  // VerificationModal pattern.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Visited steps for the stepper — derived from `maxVisitedStep` so
  // any step ≤ the high-water mark is clickable.
  const visitedSteps: ReadonlySet<1 | 2 | 3 | 4> = new Set(
    ([1, 2, 3, 4] as const).filter((n) => n <= state.maxVisitedStep),
  );

  const headerTitle = `Enviar resultados — ${companyName}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="wizard-backdrop"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        data-testid="wizard-dialog"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="space-y-1 flex-1 min-w-0">
            <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
              Asistente
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {headerTitle}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <WizardStepper
              currentStep={state.currentStep}
              visitedSteps={visitedSteps}
              onGoToStep={goToStep}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal"
              data-testid="wizard-x"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body — step routing. Each step is given the same people
            list + the relevant slice of the wizard state. Step 3 and
            4 are explicit placeholders in PR 2a — they become real
            components in PR 2b / PR 3. */}
        <div className="flex-1 overflow-y-auto p-6" data-testid="wizard-body">
          {state.currentStep === 1 ? (
            <Step1Pacientes
              people={people}
              selectedDnIs={state.selectedDnIs}
              onToggle={togglePatient}
              onSaltar={onClose}
              onNext={next}
            />
          ) : state.currentStep === 2 ? (
            <Step2Camo
              people={people}
              selectedDnIs={state.selectedDnIs}
              camoByDni={state.camoByDni}
              onPickFile={setCamo}
              onBack={prev}
              onNext={next}
            />
          ) : state.currentStep === 3 ? (
            <div
              data-testid="wizard-step-3-placeholder"
              className="px-4 py-8 text-center text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200"
            >
              <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
                Próximamente
              </span>
              <h3 className="text-lg font-semibold text-slate-700 mt-1">
                Paso 3 — EMO
              </h3>
              <p className="mt-2">
                El selector EMO llega en el próximo PR.
              </p>
            </div>
          ) : (
            <div
              data-testid="wizard-step-4-placeholder"
              className="px-4 py-8 text-center text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200"
            >
              <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
                Próximamente
              </span>
              <h3 className="text-lg font-semibold text-slate-700 mt-1">
                Paso 4 — Resumen
              </h3>
              <p className="mt-2">
                El resumen y la confirmación llegan en el próximo PR.
              </p>
            </div>
          )}
        </div>

        {/* Footer — hidden because each step renders its own footer
            (Saltar / Siguiente / Volver) inside the body. Reserved
            for a future global control (e.g. "Cerrar asistente"). */}
        <div
          className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/10 text-xs text-slate-400"
          data-testid="wizard-footer-status"
        >
          Paso {state.currentStep} de 4 — {canAdvance ? 'Listo para avanzar' : 'Selecciona al menos un paciente'}
        </div>
      </div>
    </div>
  );
}
