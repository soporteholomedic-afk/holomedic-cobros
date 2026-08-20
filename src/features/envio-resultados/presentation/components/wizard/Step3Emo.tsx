/**
 * PR envio-resultados CAMO/EMO wizard — WU-2b.1.
 *
 * `Step3Emo` is the per-patient EMO picker. It is the mechanical
 * mirror of `Step2Camo` with `pickType='EMO'` (regex `\d+EXPED\.pdf$`)
 * instead of `pickType='CAMO'`. The component renders one card per
 * `dni` in `selectedDnIs` and, on demand, opens a
 * `FilesModal mode='pick-single' pickType='EMO'` overlay so the
 * operator can pick (or skip) the EMO file for that patient.
 *
 * The card state (filename or "Saltado") is derived from the
 * `emoByDni` map owned by `useEnvioWizard`. The component is a
 * thin orchestrator: it never owns the picks — only the local
 * "which patient's modal is open" flag.
 *
 * The "Siguiente" footer button is renamed to "Continuar" (and
 * its callback to `onContinue`) because step 3 is the last
 * editable step before the final summary (step 4). The wizard
 * shell wires the same `NEXT` action behind it.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-006 — Step 3 EMO.
 *  - Scenarios S-010.
 */
'use client';

import { FileText, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { FilesModal } from '@/features/envio-resultados/presentation/components/FilesModal';
import { normalizeTipoExamen } from '@/features/envio-resultados/domain/ready-files/normalizeTipoExamen';
import { resolveRucEfectivo } from '@/features/envio-resultados/presentation/utils/resolveRucEfectivo';
import type { WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';

export interface Step3EmoProps {
  /** Already filtered by `useUnifiedResults(companyName, …)` upstream. */
  people: ReadonlyArray<UnifiedPerson>;
  /** DNIs the operator picked at Step 1 — drives the card list. */
  selectedDnIs: ReadonlySet<string>;
  /** Per-dni pick state, owned by `useEnvioWizard`. `null` = skipped. */
  emoByDni: Readonly<Record<string, WizardFilePick>>;
  /**
   * Fired when the operator picks or skips a file. The parent
   * (wizard shell) dispatches the corresponding `SET_EMO`
   * action. `null` for skip; `{ ref, displayName }` for pick.
   */
  onPickFile: (dni: string, pick: WizardFilePick) => void;
  /** Fired by the "Volver" footer button (returns to step 2). */
  onBack: () => void;
  /**
   * Fired by the "Continuar" footer button. The label changes
   * from "Siguiente" because step 3 is the last editable step
   * before the summary (step 4). The wizard shell wires this
   * to the same `NEXT` action.
   */
  onContinue: () => void;
}

export function Step3Emo({
  people,
  selectedDnIs,
  emoByDni,
  onPickFile,
  onBack,
  onContinue,
}: Step3EmoProps): ReactElement {
  // The FilesModal is per-patient. The component only allows one
  // modal open at a time; `activePickDni` identifies which patient's
  // modal is on screen (`null` = no modal).
  const [activePickDni, setActivePickDni] = useState<string | null>(null);
  const activePerson =
    activePickDni === null ? null : people.find((p) => p.dni === activePickDni) ?? null;
  // PR-2 (nomenclatura-adicionales, REQ-7) — the pick's tipoExamen is
  // derived from `fichas[0].tipoExamen`: ADICIONALES orders pick
  // `'ADICIONAL'`, everything else keeps `'EMO'` as today. Limited to
  // `fichas[0]` (pre-existing multi-ficha limitation, documented).
  const pickTipoExamen: 'EMO' | 'ADICIONAL' =
    normalizeTipoExamen(activePerson?.fichas[0]?.tipoExamen) === 'ADICIONAL' ? 'ADICIONAL' : 'EMO';

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
            const pick = emoByDni[person.dni];
            const pickLabel =
              pick === undefined
                ? 'Sin seleccionar'
                : pick === null
                  ? 'Saltado'
                  : pick.displayName;
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
                    {pick && pick !== null ? (
                      <FileText className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                    ) : pick === null ? (
                      <X className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    ) : null}
                    <span
                      data-testid={`step3-pick-label-${person.dni}`}
                      className={
                        pick === undefined
                          ? 'text-slate-400 italic'
                          : pick === null
                            ? 'text-slate-500'
                            : 'text-slate-700 font-medium'
                      }
                    >
                      EMO: {pickLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onPickFile(person.dni, null)}
                    data-testid={`step3-saltar-emo`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Saltar EMO
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePickDni(person.dni)}
                    data-testid={`step3-elegir-emo`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                  >
                    Elegir EMO
                  </button>
                </div>
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

      {activePerson && activePerson.fichas[0] ? (
        <FilesModal
          ruc={resolveRucEfectivo(activePerson.fichas[0].nroRuc, activePerson.dni)}
          dni={activePerson.dni}
          idAten={activePerson.fichas[0].idAten}
          nombrePaciente={activePerson.nombre}
          empresa={activePerson.empresa}
          destino=""
          // Forward the attendance date so the "Generar archivos" tab
          // can resolve the order (empty fecAte would render the
          // "sin orden asociada" guard). Mirrors WorkerDetailTable.
          fecAte={activePerson.fichas[0]?.fecAte ?? ''}
          onPickSingle={(file, folderPath) => {
            onPickFile(activePerson.dni, {
              ref: {
                ruc: activePerson.fichas[0]?.nroRuc ?? '',
                dni: activePerson.dni,
                idAten: activePerson.fichas[0]?.idAten ?? '',
                path: folderPath,
                name: file.name,
                tipoExamen: pickTipoExamen,
              },
              displayName: file.name,
            });
            setActivePickDni(null);
          }}
          onClose={() => setActivePickDni(null)}
        />
      ) : null}
    </div>
  );
}
