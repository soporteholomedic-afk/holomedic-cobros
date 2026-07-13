/**
 * PR envio-resultados CAMO/EMO wizard — WU-2a.3.
 *
 * `Step2Camo` is the per-patient CAMO picker. It renders one card
 * per `dni` in `selectedDnIs` and, on demand, opens a
 * `FilesModal mode='pick-single' pickType='CAMO'` overlay so the
 * operator can pick (or skip) the CAMO file for that patient.
 *
 * The card state (filename or "Saltado") is derived from the
 * `camoByDni` map owned by `useEnvioWizard`. The component is a
 * thin orchestrator: it never owns the picks — only the local
 * "which patient's modal is open" flag.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-005 — Step 2 CAMO.
 *  - Scenarios S-006, S-007, S-008, S-009.
 */
'use client';

import { FileText, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { FilesModal } from '@/features/envio-resultados/presentation/components/FilesModal';
import type { WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';

export interface Step2CamoProps {
  /** Already filtered by `useUnifiedResults(companyName, …)` upstream. */
  people: ReadonlyArray<UnifiedPerson>;
  /** DNIs the operator picked at Step 1 — drives the card list. */
  selectedDnIs: ReadonlySet<string>;
  /** Per-dni pick state, owned by `useEnvioWizard`. `null` = skipped. */
  camoByDni: Readonly<Record<string, WizardFilePick>>;
  /**
   * Fired when the operator picks or skips a file. The parent
   * (wizard shell) dispatches the corresponding `SET_CAMO`
   * action. `null` for skip; `{ ref, displayName }` for pick.
   */
  onPickFile: (dni: string, pick: WizardFilePick) => void;
  /** Fired by the "Volver" footer button. */
  onBack: () => void;
  /** Fired by the "Siguiente" footer button. */
  onNext: () => void;
}

export function Step2Camo({
  people,
  selectedDnIs,
  camoByDni,
  onPickFile,
  onBack,
  onNext,
}: Step2CamoProps): ReactElement {
  // The FilesModal is per-patient. The component only allows one
  // modal open at a time; `activePickDni` identifies which patient's
  // modal is on screen (`null` = no modal).
  const [activePickDni, setActivePickDni] = useState<string | null>(null);
  const activePerson =
    activePickDni === null ? null : people.find((p) => p.dni === activePickDni) ?? null;

  const selectedPeople = people.filter((p) => selectedDnIs.has(p.dni));

  return (
    <div className="flex flex-col h-full" data-testid="step2-camo">
      {/* Step header */}
      <header className="px-1 pb-4">
        <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
          Paso 2
        </span>
        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
          CAMO por paciente
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Asigna un archivo CAMO a cada paciente o marca Saltar.
        </p>
      </header>

      {/* Per-patient cards */}
      <ul
        data-testid="step2-patient-list"
        className="flex-1 overflow-y-auto space-y-2"
      >
        {selectedPeople.length === 0 ? (
          <li
            data-testid="step2-empty"
            className="px-4 py-8 text-center text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200"
          >
            No hay pacientes seleccionados.
          </li>
        ) : (
          selectedPeople.map((person) => {
            const pick = camoByDni[person.dni];
            const pickLabel =
              pick === undefined
                ? 'Sin seleccionar'
                : pick === null
                  ? 'Saltado'
                  : pick.displayName;
            return (
              <li
                key={person.dni}
                data-testid={`step2-card-${person.dni}`}
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
                      data-testid={`step2-pick-label-${person.dni}`}
                      className={
                        pick === undefined
                          ? 'text-slate-400 italic'
                          : pick === null
                            ? 'text-slate-500'
                            : 'text-slate-700 font-medium'
                      }
                    >
                      CAMO: {pickLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onPickFile(person.dni, null)}
                    data-testid={`step2-saltar-camo`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Saltar CAMO
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePickDni(person.dni)}
                    data-testid={`step2-elegir-camo`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                  >
                    Elegir CAMO
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
          data-testid="step2-volver"
          className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={onNext}
          data-testid="step2-siguiente"
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 bg-emerald-600 hover:bg-emerald-700"
        >
          Siguiente
        </button>
      </footer>

      {/* FilesModal overlay — only one at a time. Mounted with the
          active patient's identity so the modal can pre-fetch the
          LEGAJOS listing. The pick-single contract closes the modal
          and fires `onPickFile` (or `null` for skip). */}
      {activePerson && activePerson.fichas[0] ? (
        <FilesModal
          ruc={activePerson.fichas[0].nroRuc}
          dni={activePerson.dni}
          idAten={activePerson.fichas[0].idAten}
          nombrePaciente={activePerson.nombre}
          empresa={activePerson.empresa}
          destino=""
          mode="pick-single"
          pickType="CAMO"
          onPickSingle={(file) => {
            if (file === null) {
              onPickFile(activePerson.dni, null);
            } else {
              onPickFile(activePerson.dni, {
                ref: {
                  ruc: activePerson.fichas[0]?.nroRuc ?? '',
                  dni: activePerson.dni,
                  idAten: activePerson.fichas[0]?.idAten ?? '',
                  path: 'LEGAJOS',
                  name: file.name,
                  tipoExamen: 'CAMO',
                },
                displayName: file.name,
              });
            }
            setActivePickDni(null);
          }}
          onClose={() => setActivePickDni(null)}
        />
      ) : null}
    </div>
  );
}
