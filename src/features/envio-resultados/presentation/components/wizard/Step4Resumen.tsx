/**
 * Envio-resultados wizard — Step 4 (read-only summary).
 *
 * Multi-proyecto change (REQ-106, design D9): the step shows the
 * live attachment count (non-null picks across both maps for the
 * selected patients) vs `MAX_FILES` from `application/sendResults`
 * (single source of truth with the API backstop). Over limit → the
 * "Continuar al envío" button is disabled and an operator-facing
 * message names the limit and instructs a manual split. The count is
 * derived during render — no state, no effect.
 *
 * `Step4Resumen` renders one row per `dni` in `selectedDnIs` with
 * the picked CAMO/EMO filenames (or "Saltado" / "—"), and hands the
 * `buildEmailViewDataFromWizard` output to `onContinueToEmail`.
 *
 * Spec coverage:
 *  - REQ-106 — S-106.1 (11 refs blocked), S-106.2 (10 enabled).
 *  - REQ-102 — per-ficha pick display.
 *  - Legacy REQ-007 — Step 4 Resumen + handoff (S-011, S-012).
 */
'use client';

import { FileText, X } from 'lucide-react';
import type { ReactElement } from 'react';

import { MAX_FILES } from '../../../application/sendResults';
import { buildEmailViewDataFromWizard, type WizardEmailViewData } from '../../helpers/buildEmailViewDataFromWizard';
import type { WizardFilePick } from '../../hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';

export interface Step4ResumenProps {
  /** The full people list (used to resolve `patientName` per dni). */
  people: ReadonlyArray<UnifiedPerson>;
  /** DNIs the operator picked at Step 1. Drives the row list. */
  selectedDnIs: ReadonlySet<string>;
  /** CAMO picks keyed by `pickKey(dni, idAten)`; `null` = Saltar. */
  camoPicks: Readonly<Record<string, WizardFilePick>>;
  /** EMO picks keyed by `pickKey(dni, idAten)`; `null` = Saltar. */
  emoPicks: Readonly<Record<string, WizardFilePick>>;
  /**
   * Fired by the "Continuar al envío" footer button. Receives the
   * partial `WizardEmailViewData` (the wizard shell enriches it
   * with `companyId`/`companyName`/`nombreCompleto`/`destino`
   * before forwarding to the EmailEditor overlay).
   */
  onContinueToEmail: (data: WizardEmailViewData) => void;
}

const EM_DASH = '\u2014';

/** All picks (including `null`s) whose composite key belongs to `dni`. */
function picksForDni(
  record: Readonly<Record<string, WizardFilePick>>,
  dni: string,
): WizardFilePick[] {
  const picks: WizardFilePick[] = [];
  const prefix = `${dni}::`;
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith(prefix)) picks.push(value);
  }
  return picks;
}

/**
 * Cell label for a slot kind. Single-ficha patients keep today's
 * exact semantics: `—` (nothing recorded), `Saltado` (null),
 * otherwise the filename. Multi-ficha patients aggregate the
 * non-skipped filenames with `', '`.
 */
function cellLabel(picks: WizardFilePick[]): string {
  if (picks.length === 0) return EM_DASH;
  const names: string[] = [];
  for (const pick of picks) {
    if (pick !== null) names.push(pick.displayName);
  }
  if (names.length === 0) return 'Saltado';
  return names.join(', ');
}

/** Count of concrete (non-null) picks for the selected patients. */
function countConcretePicks(
  selectedDnIs: ReadonlySet<string>,
  ...maps: ReadonlyArray<Readonly<Record<string, WizardFilePick>>>
): number {
  let count = 0;
  for (const dni of selectedDnIs) {
    const prefix = `${dni}::`;
    for (const map of maps) {
      for (const [key, value] of Object.entries(map)) {
        if (key.startsWith(prefix) && value !== null) count++;
      }
    }
  }
  return count;
}

export function Step4Resumen({
  people,
  selectedDnIs,
  camoPicks,
  emoPicks,
  onContinueToEmail,
}: Step4ResumenProps): ReactElement {
  // REQ-106 — live attachment count, derived during render.
  const attachmentCount = countConcretePicks(selectedDnIs, camoPicks, emoPicks);
  const overLimit = attachmentCount > MAX_FILES;

  const handleContinue = (): void => {
    // Guard belt-and-suspenders: the button is disabled over the
    // limit, but a programmatic click must not hand off either.
    if (overLimit) return;
    const data = buildEmailViewDataFromWizard({
      selectedDnIs,
      camoPicks,
      emoPicks,
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
            const camoPicksForDni = picksForDni(camoPicks, dni);
            const emoPicksForDni = picksForDni(emoPicks, dni);
            const camoLabel = cellLabel(camoPicksForDni);
            const emoLabel = cellLabel(emoPicksForDni);
            const hasCamoFile = camoPicksForDni.some((p) => p !== null);
            const hasEmoFile = emoPicksForDni.some((p) => p !== null);
            const allCamoSkipped =
              camoPicksForDni.length > 0 && camoPicksForDni.every((p) => p === null);
            const allEmoSkipped =
              emoPicksForDni.length > 0 && emoPicksForDni.every((p) => p === null);
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
                    {hasCamoFile ? (
                      <FileText className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                    ) : allCamoSkipped ? (
                      <X className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    ) : null}
                    <span
                      data-testid={`step4-camo-cell-${dni}`}
                      className={
                        camoPicksForDni.length === 0
                          ? 'text-slate-400 italic'
                          : allCamoSkipped
                            ? 'text-slate-500'
                            : 'text-slate-700 font-medium truncate max-w-[180px]'
                      }
                    >
                      CAMO: {camoLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                    {hasEmoFile ? (
                      <FileText className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                    ) : allEmoSkipped ? (
                      <X className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    ) : null}
                    <span
                      data-testid={`step4-emo-cell-${dni}`}
                      className={
                        emoPicksForDni.length === 0
                          ? 'text-slate-400 italic'
                          : allEmoSkipped
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
      <footer className="pt-4 flex flex-col gap-2 border-t border-slate-100 mt-4">
        {overLimit ? (
          <p
            data-testid="step4-over-limit"
            className="text-xs font-semibold text-rose-600"
          >
            Límite de {MAX_FILES} archivos superado ({attachmentCount}). Desselecciona
            archivos y divide el envío manualmente en dos o más envíos.
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-4">
          <span
            data-testid="step4-count"
            className={
              overLimit
                ? 'text-xs font-bold text-rose-600'
                : 'text-xs font-semibold text-slate-500'
            }
          >
            {attachmentCount}/{MAX_FILES} archivos
          </span>
          <button
            type="button"
            onClick={handleContinue}
            disabled={overLimit}
            data-testid="step4-continuar"
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continuar al envío
          </button>
        </div>
      </footer>
    </div>
  );
}
