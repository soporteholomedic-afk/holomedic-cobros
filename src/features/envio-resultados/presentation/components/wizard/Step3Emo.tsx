/**
 * Envio-resultados EMO wizard — Step 3.
 *
 * Mechanical mirror of `Step2Camo` with `tipoExamen: 'EMO'`
 * (repo mirror convention). Multi-proyecto change (REQ-102,
 * design D7): a patient with ≥2 idAten-bearing fichas renders one
 * EMO slot row per ficha — each with its proyecto label and its own
 * FilesModal binding (ruc/idAten/fecAte/tipoExamen from THAT ficha).
 * A patient with ≤1 slot renders byte-identical to the legacy
 * per-patient card (same testids, no proyecto label row).
 *
 * The "Siguiente" button is renamed to "Continuar" because step 3 is
 * the last step before the final summary (step 4). The callback
 * itself stays imperative (`onContinue`); the wizard shell wires it
 * to the same `NEXT` action as step 2.
 *
 * Spec coverage:
 *  - REQ-102 — per-ficha slots (S-102.1), legacy single-ficha (S-102.2).
 *  - REQ-103 — "Adjuntar todos los proyectos" quick action, rendered
 *    ONLY on multi-ficha cards (S-103.3), with per-slot
 *    pending/applied/ambiguous/error status (EMO slot kind).
 *  - Legacy REQ-006 — Step 3 EMO (S-010).
 */
'use client';

import { FileText, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { FilesModal } from '@/features/envio-resultados/presentation/components/FilesModal';
import { normalizeTipoExamen } from '@/features/envio-resultados/domain/ready-files/normalizeTipoExamen';
import { resolveRucEfectivo } from '@/features/envio-resultados/presentation/utils/resolveRucEfectivo';
import { pickKey, type WizardBatchPick, type WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import { useAttachAllProyectos, type QuickSlotStatus } from '@/features/envio-resultados/presentation/hooks/useAttachAllProyectos';
import { derivePickSlots } from '@/features/envio-resultados/presentation/helpers/derivePickSlots';
import type { UnifiedPerson } from '@/types/sp-result';

export interface Step3EmoProps {
  /** Already filtered by `useUnifiedResults(companyName, …)` upstream. */
  people: ReadonlyArray<UnifiedPerson>;
  /** DNIs the operator picked at Step 1 — drives the card list. */
  selectedDnIs: ReadonlySet<string>;
  /** EMO picks keyed by `pickKey(dni, idAten)`. `null` = skipped. */
  emoPicks: Readonly<Record<string, WizardFilePick>>;
  /**
   * Fired when the operator picks or skips a file for one atención.
   * The parent (wizard shell) dispatches the corresponding `SET_EMO`
   * action. `null` for skip; `{ ref, displayName }` for pick.
   */
  onPickFile: (dni: string, idAten: string, pick: WizardFilePick) => void;
  /**
   * Receives the quick action's applied picks for one patient as a
   * single batch (the shell forwards `setPicksBatch`, i.e. a
   * `SET_PICKS_BATCH` dispatch).
   */
  onBatch: (dni: string, picks: ReadonlyArray<WizardBatchPick>) => void;
  /** Fired by the "Volver" footer button (returns to step 2). */
  onBack: () => void;
  /**
   * Fired by the "Continuar" footer button. The wizard shell wires
   * this to the same `NEXT` action as step 2.
   */
  onContinue: () => void;
}

/** Slot-row pick state text: undefined = not yet picked. */
function pickLabel(pick: WizardFilePick | undefined): string {
  if (pick === undefined) return 'Sin seleccionar';
  if (pick === null) return 'Saltado';
  return pick.displayName;
}

/** Text color class for a pick label (semantic state, not styling test surface). */
function pickLabelClass(pick: WizardFilePick | undefined): string {
  if (pick === undefined) return 'text-slate-400 italic';
  if (pick === null) return 'text-slate-500';
  return 'text-slate-700 font-medium';
}

/** Operator-facing text for a quick-action slot status. */
function quickStatusText(status: QuickSlotStatus): string {
  switch (status.kind) {
    case 'pending':
      return 'Buscando…';
    case 'applied':
      return 'Adjuntado';
    case 'ambiguous':
      return 'Ambiguo — elegir manualmente';
    case 'error':
      return `Error: ${status.message}`;
  }
}

export function Step3Emo({
  people,
  selectedDnIs,
  emoPicks,
  onPickFile,
  onBatch,
  onBack,
  onContinue,
}: Step3EmoProps): ReactElement {
  // Quick action "Adjuntar todos los proyectos" (REQ-103): shared
  // hook instance for the whole step, EMO slot kind — statuses are
  // keyed by `pickKey(dni, idAten)` so every multi-ficha card reads
  // its own.
  const attachAllState = useAttachAllProyectos({ slotKind: 'emo', onBatch });
  // The FilesModal is per-slot. The component only allows one modal
  // open at a time; `activePick` identifies which patient's atención
  // modal is on screen (`null` = no modal).
  const [activePick, setActivePick] = useState<{ dni: string; idAten: string } | null>(null);
  const activePerson =
    activePick === null ? null : people.find((p) => p.dni === activePick.dni) ?? null;
  const activeFicha =
    activePerson && activePick
      ? activePerson.fichas.find((f) => f.idAten === activePick.idAten) ?? null
      : null;
  // The pick's tipoExamen is derived from THE ACTIVE FICHA's
  // tipoExamen: ADICIONALES orders pick `'ADICIONAL'`, everything
  // else keeps `'EMO'`. Per-ficha derivation also fixes the legacy
  // `fichas[0]`-only ADICIONAL limitation.
  const pickTipoExamen: 'EMO' | 'ADICIONAL' =
    normalizeTipoExamen(activeFicha?.tipoExamen) === 'ADICIONAL' ? 'ADICIONAL' : 'EMO';

  const selectedPeople = people.filter((p) => selectedDnIs.has(p.dni));

  return (
    <div className="flex flex-col h-full" data-testid="step3-emo">
      {/* Step header */}
      <header className="px-1 pb-4">
        <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
          Paso 3
        </span>
        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
          EMO por paciente
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Asigna un archivo EMO a cada paciente o marca Saltar.
        </p>
      </header>

      {/* Per-patient cards */}
      <ul
        data-testid="step3-patient-list"
        className="flex-1 overflow-y-auto space-y-2"
      >
        {selectedPeople.length === 0 ? (
          <li
            data-testid="step3-empty"
            className="px-4 py-8 text-center text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200"
          >
            No hay pacientes seleccionados.
          </li>
        ) : (
          selectedPeople.map((person) => {
            const slots = derivePickSlots(person);
            // Legacy render: ≤1 selectable atención keeps today's
            // card markup byte-identical (testids, no label row).
            const boundFicha = slots[0]?.ficha ?? person.fichas[0];
            const legacyPick = boundFicha
              ? emoPicks[pickKey(person.dni, boundFicha.idAten)]
              : undefined;
            if (slots.length < 2) {
              return (
                <li
                  key={person.dni}
                  data-testid={`step3-card-${person.dni}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {person.nombre}
                    </p>
                    <p className="text-xs text-slate-500">DNI {person.dni}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                      {legacyPick && legacyPick !== null ? (
                        <FileText className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                      ) : legacyPick === null ? (
                        <X className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      ) : null}
                      <span
                        data-testid={`step3-pick-label-${person.dni}`}
                        className={pickLabelClass(legacyPick)}
                      >
                        EMO: {pickLabel(legacyPick)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onPickFile(person.dni, boundFicha?.idAten ?? '', null)}
                      data-testid={`step3-saltar-emo`}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Saltar EMO
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePick({ dni: person.dni, idAten: boundFicha?.idAten ?? '' })}
                      data-testid={`step3-elegir-emo`}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                    >
                      Elegir EMO
                    </button>
                  </div>
                </li>
              );
            }
            // Slot render: one row per idAten-bearing ficha.
            return (
              <li
                key={person.dni}
                data-testid={`step3-card-${person.dni}`}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {person.nombre}
                    </p>
                    <p className="text-xs text-slate-500">DNI {person.dni}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => attachAllState.attachAll(person)}
                    disabled={attachAllState.isRunning}
                    data-testid={`step3-attach-all-${person.dni}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-sky-200 text-sky-600 hover:bg-sky-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    Adjuntar todos los proyectos
                  </button>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {slots.map((slot, i) => {
                    const slotPick = emoPicks[slot.key];
                    const slotStatus: QuickSlotStatus | undefined =
                      attachAllState.slotStatus[slot.key];
                    return (
                      <li
                        key={slot.key}
                        data-testid={`step3-slot-${person.dni}-${i}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            data-testid={`step3-slot-label-${person.dni}-${i}`}
                            className="text-xs font-semibold text-slate-600 truncate"
                          >
                            {slot.label}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                            {slotPick && slotPick !== null ? (
                              <FileText className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                            ) : slotPick === null ? (
                              <X className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            ) : null}
                            <span
                              data-testid={`step3-slot-pick-label-${person.dni}-${i}`}
                              className={pickLabelClass(slotPick)}
                            >
                              EMO: {pickLabel(slotPick)}
                            </span>
                            {slotStatus ? (
                              <span
                                data-testid={`step3-slot-status-${person.dni}-${i}`}
                                className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                              >
                                {quickStatusText(slotStatus)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => onPickFile(person.dni, slot.ficha.idAten, null)}
                            data-testid={`step3-slot-saltar-${person.dni}-${i}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Saltar EMO
                          </button>
                          <button
                            type="button"
                            onClick={() => setActivePick({ dni: person.dni, idAten: slot.ficha.idAten })}
                            data-testid={`step3-slot-elegir-${person.dni}-${i}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                          >
                            Elegir EMO
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })
        )}
      </ul>

      {/* Footer */}
      <footer className="pt-4 flex items-center justify-between border-t border-slate-100 mt-4">
        <button
          type="button"
          onClick={onBack}
          data-testid="step3-volver"
          className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={onContinue}
          data-testid="step3-continuar"
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 bg-emerald-600 hover:bg-emerald-700"
        >
          Continuar
        </button>
      </footer>

      {activePerson && activeFicha ? (
        <FilesModal
          ruc={resolveRucEfectivo(activeFicha.nroRuc, activePerson.dni)}
          dni={activePerson.dni}
          idAten={activeFicha.idAten}
          nombrePaciente={activePerson.nombre}
          empresa={activePerson.empresa}
          destino=""
          // Forward the attendance date so the "Generar archivos" tab
          // can resolve the order (empty fecAte would render the
          // "sin orden asociada" guard). Mirrors WorkerDetailTable.
          fecAte={activeFicha.fecAte ?? ''}
          onPickSingle={(file, folderPath) => {
            onPickFile(activePerson.dni, activeFicha.idAten, {
              ref: {
                // The ref keeps the RAW ficha nroRuc; only the modal
                // view resolves the effective RUC.
                ruc: activeFicha.nroRuc ?? '',
                dni: activePerson.dni,
                idAten: activeFicha.idAten,
                path: folderPath,
                name: file.name,
                tipoExamen: pickTipoExamen,
              },
              displayName: file.name,
            });
            setActivePick(null);
          }}
          onClose={() => setActivePick(null)}
        />
      ) : null}
    </div>
  );
}
