/**
 * PR envio-resultados CAMO/EMO wizard — WU-3.1.
 *
 * `Step4Resumen` is the read-only summary step. It renders one
 * row per `dni` in `selectedDnIs` with the picked CAMO/EMO
 * filenames (or "Saltado" / "—"), and a "Continuar al envío"
 * footer button that calls `onContinueToEmail` with the helper
 * output (`{ selectedPatients, fileRefs }`).
 *
 * The component is a thin orchestrator: the real work lives in
 * `buildEmailViewDataFromWizard` (tested in isolation in
 * `helpers/__tests__/buildEmailViewDataFromWizard.test.ts`).
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-007 — Step 4 Resumen + handoff.
 *  - REQ-009 — SelectedFileRef.tipoExamen populated on every ref.
 *  - Scenarios S-011 (summary rows) + S-012 (handoff payload).
 */
'use client';

import { FileText, X } from 'lucide-react';
import type { ReactElement } from 'react';

import { buildEmailViewDataFromWizard, type WizardEmailViewData } from '../../helpers/buildEmailViewDataFromWizard';
import type { WizardFilePick } from '../../hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';

export interface Step4ResumenProps {
  /** The full people list (used to resolve `patientName` per dni). */
  people: ReadonlyArray<UnifiedPerson>;
  /** DNIs the operator picked at Step 1. Drives the row list. */
  selectedDnIs: ReadonlySet<string>;
  /** Per-dni CAMO pick; `null` = Saltar; `undefined` = not yet picked. */
  camoByDni: Readonly<Record<string, WizardFilePick>>;
  /** Per-dni EMO pick; `null` = Saltar; `undefined` = not yet picked. */
  emoByDni: Readonly<Record<string, WizardFilePick>>;
  /**
   * Fired by the "Continuar al envío" footer button. Receives the
   * partial `WizardEmailViewData` (the wizard shell enriches it
   * with `companyId`/`companyName`/`nombreCompleto`/`destino`
   * before forwarding to the EmailEditor overlay).
   */
  onContinueToEmail: (data: WizardEmailViewData) => void;
}

const EM_DASH = '\u2014';

function pickLabel(pick: WizardFilePick | undefined): string {
  if (pick === undefined) return EM_DASH;
  if (pick === null) return 'Saltado';
  return pick.displayName;
}

export function Step4Resumen({
  people,
  selectedDnIs,
  camoByDni,
  emoByDni,
  onContinueToEmail,
}: Step4ResumenProps): ReactElement {
  const handleContinue = (): void => {
    const data = buildEmailViewDataFromWizard({
      selectedDnIs,
      camoByDni,
      emoByDni,
      people,
    });
    onContinueToEmail(data);
  };

  return (
    <div className="flex flex-col h-full" data-testid="step4-resumen">
      {/* Step header */}
      <header className="px-1 pb-4">
        <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
          Paso 4
        </span>
        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
          Resumen
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Revisa las asignaciones y continúa al envío del correo.
        </p>
      </header>

      {/* Per-patient summary rows */}
      <ul
        data-testid="step4-patient-list"
        className="flex-1 overflow-y-auto space-y-2"
      >
        {selectedDnIs.size === 0 ? (
          <li
            data-testid="step4-empty"
            className="px-4 py-8 text-center text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200"
          >
            No hay pacientes seleccionados.
          </li>
        ) : (
          Array.from(selectedDnIs).map((dni) => {
            const person = people.find((p) => p.dni === dni);
            const camoPick = camoByDni[dni];
            const emoPick = emoByDni[dni];
            const camoLabel = pickLabel(camoPick);
            const emoLabel = pickLabel(emoPick);
            return (
              <li
                key={dni}
                data-testid={`step4-row-${dni}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {person?.nombre ?? dni}
                  </p>
                  <p className="text-xs text-slate-500">DNI {dni}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                    {camoPick && camoPick !== null ? (
                      <FileText className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                    ) : camoPick === null ? (
                      <X className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    ) : null}
                    <span
                      data-testid={`step4-camo-cell-${dni}`}
                      className={
                        camoPick === undefined
                          ? 'text-slate-400 italic'
                          : camoPick === null
                            ? 'text-slate-500'
                            : 'text-slate-700 font-medium truncate max-w-[180px]'
                      }
                    >
                      CAMO: {camoLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                    {emoPick && emoPick !== null ? (
                      <FileText className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                    ) : emoPick === null ? (
                      <X className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    ) : null}
                    <span
                      data-testid={`step4-emo-cell-${dni}`}
                      className={
                        emoPick === undefined
                          ? 'text-slate-400 italic'
                          : emoPick === null
                            ? 'text-slate-500'
                            : 'text-slate-700 font-medium truncate max-w-[180px]'
                      }
                    >
                      EMO: {emoLabel}
                    </span>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* Footer */}
      <footer className="pt-4 flex items-center justify-end border-t border-slate-100 mt-4">
        <button
          type="button"
          onClick={handleContinue}
          data-testid="step4-continuar"
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 bg-emerald-600 hover:bg-emerald-700"
        >
          Continuar al envío
        </button>
      </footer>
    </div>
  );
}
