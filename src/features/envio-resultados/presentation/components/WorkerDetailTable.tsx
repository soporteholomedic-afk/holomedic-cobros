'use client';

import { useState, useCallback } from 'react';
import { useUnifiedResults } from '../hooks/useUnifiedResults';
import { useCompanies } from '../hooks/useCompanies';
import type { Company } from '../../domain/entities';
import type { UnifiedPerson } from '@/types/sp-result';
import type { FileNode } from '@/features/envio-resultados/domain/file-system/FileNode';
import { FilesModal } from './FilesModal';
import { EmailEditor } from './EmailEditor';
import { DocumentVerificationModal } from './DocumentVerificationModal';
import { EnvioResultadosWizard } from './EnvioResultadosWizard';
import type { WizardState } from '../hooks/useEnvioWizard';
import {
  emailViewDataFromFiles,
  type EmailViewData,
} from '../helpers/emailViewDataFromFiles';
import { useLegajosStatus, type LegajosRowStatus, type CheckLegajosItem } from '../hooks/useLegajosStatus';

interface WorkerDetailTableProps {
  companyName: string;
  fechaInicio: string;
  fechaFin: string;
}

const EM_DASH = '\u2014';

function cellValue(value: string): string {
  return value || EM_DASH;
}

/**
 * Resolve the companyId for the patient's empresa. Spec EI-2: matches
 * `Company.name === empresa`; falls back to `''` on no match. Pure — no
 * side effects, trivially testable through the component tests.
 */
function resolveCompanyId(companies: readonly Company[], empresa: string): string {
  return companies.find((c) => c.name === empresa)?.id ?? '';
}

/** State for the open FilesModal — keyed by `(dni, fichaIndex)`. */
interface ModalState {
  dni: string;
  fichaIndex: number;
}

export function WorkerDetailTable({ companyName, fechaInicio, fechaFin }: WorkerDetailTableProps) {
  const { people, loading, error } = useUnifiedResults(companyName, fechaInicio, fechaFin);
  const { companies } = useCompanies();
  const [expandedDni, setExpandedDni] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [emailViewData, setEmailViewData] = useState<EmailViewData | null>(null);
  // PR 2 — visibility flag for the aggregated DocumentVerificationModal.
  // Mounted only AFTER `checkAll()` resolves (spec REQ-1: "the modal MUST
  // open only after `checkAll()` resolves; never on rejection or while
  // pending"). Reset by the modal's `onClose` callback.
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  // PR 3 (WU-3.5a) — wizard state. The `EnvioResultadosWizard` is a
  // parallel send path that the "Enviar" button opens. The wizard
  // owns the per-patient CAMO/EMO picks; this table stores the
  // latest wizard state so the "Volver al paso 4" round-trip can
  // remount the wizard with the previous picks intact (WU-3.5b).
  const [wizardSnapshot, setWizardSnapshot] = useState<WizardState | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  // PR 3 (WU-3.5b) — back-context for the EmailEditor overlay.
  // `'wizard'` when the overlay was opened from the wizard's
  // Step 4 "Continuar al envío" (the back button reads
  // "Volver al paso 4"). `'table'` for the legacy per-row
  // "Ver Archivos" path (the back button reads "Volver a la
  // tabla").
  const [emailBackContext, setEmailBackContext] = useState<'table' | 'wizard'>('table');
  const {
    statuses,
    checkAll,
    checkRow,
    isChecking,
    error: checkingError,
  } = useLegajosStatus();

  const handleCheckAll = useCallback(() => {
    const items: CheckLegajosItem[] = [];
    for (const person of people) {
      for (const ficha of person.fichas) {
        if (ficha.idAten && ficha.nroRuc) {
          items.push({
            ruc: ficha.nroRuc,
            dni: person.dni,
            idAten: ficha.idAten,
          });
        }
      }
    }
    // PR 2 — `checkAll` returns `Promise<void>` and currently always
    // resolves (the hook catches its own errors). We still wrap the
    // open in a try/catch so the modal can NEVER mount on a rejected
    // promise, even if a future hook revision starts to reject.
    // The modal is only opened in the resolved branch — never on
    // rejection or while pending. `isChecking` also disables the
    // button, so the user cannot fire this while a run is in flight.
    const run = async (): Promise<void> => {
      try {
        await checkAll(items);
        setShowVerificationModal(true);
      } catch {
        // Spec: modal MUST NOT open on rejection. Silent by design —
        // the hook already surfaces its own error in `checkingError`.
      }
    };
    void run();
  }, [people, checkAll]);

  const closeVerificationModal = useCallback((): void => {
    setShowVerificationModal(false);
  }, []);

  const toggleExpand = useCallback((dni: string) => {
    setExpandedDni((prev) => (prev === dni ? null : dni));
  }, []);

  const openFilesModal = useCallback((dni: string, fichaIndex: number) => {
    setModalState({ dni, fichaIndex });
  }, []);

  const closeFilesModal = useCallback(() => {
    setModalState(null);
  }, []);

  /**
   * Bridge from `FilesModal.onSend(selected)` to the `EmailEditor` payload.
   * Reconstructs the patient context from the current `modalState`,
   * resolves `companyId` via `useCompanies` (spec EI-2), and stores
   * the bridged data so the EmailEditor overlay can mount in place
   * of the table.
   *
   * PR #1 — the modal now hands a `ReadonlyMap<fileRef, FileNode>`
   * (keyed by `"${folderPath}::${name}"`) so the bridge can split
   * each ref into `{ path, name }` and preserve the explorer-pane
   * folder path. The prior `::${file.name}` synth dropped the
   * folder for any selection from a subfolder.
   */
  const handleSendFromModal = useCallback(
    (selected: ReadonlyMap<string, FileNode>): void => {
      if (!modalState) return;
      const person = people.find((p) => p.dni === modalState.dni);
      if (!person) return;
      const ficha = person.fichas[modalState.fichaIndex] ?? null;
      const companyId = resolveCompanyId(companies, person.empresa);
      // PR #1 — derive both parallel arrays from the Map. Insertion
      // order is preserved by the Map contract.
      const refs = Array.from(selected.keys());
      const files = Array.from(selected.values());
      setEmailViewData(emailViewDataFromFiles(person, ficha, files, refs, companyId, companyName));
      // Close the modal so the overlay can take its place. The
      // conditional render `modalState && !emailViewData` would also
      // hide it via the emailViewData flag, but clearing modalState
      // keeps the post-send return path clean (no risk of the modal
      // re-appearing when the user clicks "Volver a la tabla").
      setModalState(null);
    },
    [modalState, people, companies, companyName],
  );

  // PR 3 (WU-3.5a) — wizard open/close + state snapshot. The
  // `onContinueToEmail` callback is a no-op in this PR; the
  // round-trip handoff to the EmailEditor overlay lands in
  // WU-3.5b (the same batch removes the wrapper back button).
  const openWizard = useCallback((): void => {
    setShowWizard(true);
  }, []);

  const closeWizard = useCallback((): void => {
    setShowWizard(false);
    setWizardSnapshot(null);
    setEmailBackContext('table');
  }, []);

  const handleWizardStateChange = useCallback((s: WizardState): void => {
    setWizardSnapshot(s);
  }, []);

  /**
   * PR 3 (WU-3.5b) — wizard → EmailEditor handoff. The wizard
   * shell composes the FULL `EmailViewData` (resolving
   * `companyId` from the page-level `companies`, taking the
   * first selected patient's `nombre`/`destino`); this table
   * stores it in `emailViewData` (which mounts the existing
   * `EmailEditor` overlay) and flips `emailBackContext` to
   * `'wizard'` so the overlay's back button reads
   * "Volver al paso 4" and the round-trip onBack reopens the
   * wizard. The wizard is unmounted (`showWizard=false`) — the
   * round-trip restoration is driven by the `wizardSnapshot`
   * stored via `onStateChange`.
   */
  const handleWizardContinueToEmail = useCallback((data: EmailViewData): void => {
    setShowWizard(false);
    setEmailBackContext('wizard');
    setEmailViewData(data);
  }, []);

  /**
   * PR 3 (WU-3.5b) — EmailEditor overlay's back button handler.
   * The behavior depends on `emailBackContext`:
   *   - `'wizard'`: reopen the wizard with the stored
   *     `wizardSnapshot` (the round-trip restoration). The
   *     overlay unmounts; the wizard remounts.
   *   - `'table'`: clear `emailViewData` (the table is back).
   *     The `wizardSnapshot` is preserved for the next
   *     round-trip in case the user reopens the wizard via
   *     "Enviar", but in practice a fresh wizard starts at
   *     step 1.
   */
  const handleEmailEditorBack = useCallback((): void => {
    if (emailBackContext === 'wizard') {
      setEmailViewData(null);
      setShowWizard(true);
    } else {
      setEmailViewData(null);
    }
  }, [emailBackContext]);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando consolidados...</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">{error}</p>
      </div>
    );
  }

  // ---- Empty state ----
  if (people.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">
          No se encontraron consolidados para esta empresa
        </p>
      </div>
    );
  }

  // ---- Data table ----
  return (
    <div>
      {!emailViewData && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold text-slate-800">{companyName}</h2>
              {checkingError && (
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
                  {checkingError}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* PR 3 (WU-3.5a) — `Enviar` opens the
                  `EnvioResultadosWizard` overlay. Sits next to
                  "Verificar documentos" per spec REQ-001. */}
              <button
                type="button"
                data-testid="enviar-wizard-btn"
                onClick={openWizard}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                Enviar
              </button>
              <button
                type="button"
                disabled={isChecking || people.length === 0}
                onClick={handleCheckAll}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white transition-colors"
              >
                {isChecking ? 'Verificando...' : 'Verificar documentos'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">Ficha</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Nombre</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Empresa</th>
                  <th className="px-4 py-3 font-medium text-slate-600">RUC</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Proyecto</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Razón Social</th>
                  <th className="px-4 py-3 font-medium text-slate-600">DNI</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Tipo de Examen</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Aptitud</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Documentos</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Archivos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map((person) => {
                  const hasMultipleFichas = person.fichas.length > 1;
                  const isExpanded = expandedDni === person.dni;

                  return (
                    <PersonRow
                      key={person.dni}
                      person={person}
                      hasMultipleFichas={hasMultipleFichas}
                      isExpanded={isExpanded}
                      onToggleExpand={hasMultipleFichas ? () => toggleExpand(person.dni) : undefined}
                      onOpenFilesModal={openFilesModal}
                      statuses={statuses}
                      onRetry={checkRow}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {modalState && !emailViewData &&
        (() => {
          const person = people.find((p) => p.dni === modalState.dni);
          if (!person) return null;
          const ficha = person.fichas[modalState.fichaIndex] ?? null;
          return (
            <FilesModal
              key={`${modalState.dni}-${modalState.fichaIndex}`}
              ruc={ficha?.nroRuc ?? ''}
              dni={person.dni}
              idAten={ficha?.idAten ?? ''}
              nombrePaciente={person.nombre}
              empresa={person.empresa}
              destino={ficha?.proyecto ?? ''}
              // PR-1 — forward fecAte from the unified ficha so the
              // future lookup SP can scope the query to the same day.
              // `''` for worker-sourced fichas (no order row).
              fecAte={ficha?.fecAte ?? ''}
              onClose={closeFilesModal}
              onSend={handleSendFromModal}
            />
          );
        })()}
      {/* PR 2 — DocumentVerificationModal mounts only after `checkAll()`
          resolves (see `handleCheckAll`). It overlays the table but does
          NOT replace it (unlike the EmailEditor overlay, which unmounts
          the table). The existing per-row CAMO/EMO badges remain
          visible underneath, per spec REQ-7 ("Existing Per-Row Badges
          Unchanged"). */}
      {showVerificationModal && (
        <DocumentVerificationModal
          statuses={statuses}
          people={people}
          onClose={closeVerificationModal}
        />
      )}
      {emailViewData && (
        <section
          data-testid="email-editor-overlay"
          className="fixed inset-0 z-50 bg-white dark:bg-slate-900 overflow-auto"
        >
          <div className="max-w-7xl mx-auto p-6 space-y-4">
            {/* PR 3 (WU-3.5b) — the wrapper back button moved into
                `EmailEditor` (the button renders conditionally on
                `onBack` being provided). `backContext` selects the
                label:
                  - `'wizard'` → "Volver al paso 4" (round-trip)
                  - `'table'`  → "Volver a la tabla" (legacy path) */}
            <EmailEditor
              companyId={emailViewData.companyId}
              companyName={emailViewData.companyName}
              selectedPatients={emailViewData.selectedPatients}
              patients={emailViewData.patients}
              // PR #3 — forward the bridged `fileRefs` (LAN-share
              // location triple + relative path + name) so the hook
              // can serialise them as the wire payload. `PatientFile`
              // (display) stays in `patients` for the AttachmentList.
              fileRefs={emailViewData.fileRefs}
              nombreCompleto={emailViewData.nombreCompleto}
              destino={emailViewData.destino}
              backContext={emailBackContext}
              onBack={handleEmailEditorBack}
            />
          </div>
        </section>
      )}
      {/* PR 3 (WU-3.5a) — `EnvioResultadosWizard` mounts when the
          "Enviar" header button fires. The handoff to the
          `EmailEditor` overlay (Step 4 "Continuar al envío") is
          wired in WU-3.5b. */}
      {showWizard && (
        <EnvioResultadosWizard
          people={people}
          companies={companies}
          companyName={companyName}
          initialState={wizardSnapshot ?? undefined}
          onClose={closeWizard}
          onStateChange={handleWizardStateChange}
          onContinueToEmail={handleWizardContinueToEmail}
        />
      )}
    </div>
  );
}

// ---- Internal: single person row + optional expanded sub-rows ----

function LegajosStatusCell({
  status,
  onRetry,
}: {
  status: LegajosRowStatus | undefined;
  onRetry?: () => void;
}) {
  if (status?.loading) {
    return (
      <div className="flex items-center gap-1.5 animate-pulse" data-testid="legajos-loading">
        <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-xs">Verificando...</span>
      </div>
    );
  }

  if (status?.error) {
    return (
      <div className="flex items-center gap-1.5" data-testid="legajos-error">
        <span className="text-red-500 text-xs font-semibold" title={status.error}>
          Error
        </span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="p-1 rounded hover:bg-slate-100 text-sky-600 hover:text-sky-800 transition-colors"
            title="Reintentar verificación"
            aria-label="Reintentar"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }

  const hasCamo = status?.hasCamo ?? false;
  const hasEmo = status?.hasEmo ?? false;

  return (
    <div className="flex items-center gap-1.5" data-testid="legajos-badges">
      <span
        data-testid="badge-camo"
        className={`px-2 py-0.5 rounded text-xs font-semibold ${
          hasCamo
            ? 'bg-green-100 text-green-800'
            : 'bg-slate-100 text-slate-400'
        }`}
      >
        CAMO
      </span>
      <span
        data-testid="badge-emo"
        className={`px-2 py-0.5 rounded text-xs font-semibold ${
          hasEmo
            ? 'bg-violet-100 text-violet-800'
            : 'bg-slate-100 text-slate-400'
        }`}
      >
        EMO
      </span>
    </div>
  );
}

interface PersonRowProps {
  person: UnifiedPerson;
  hasMultipleFichas: boolean;
  isExpanded: boolean;
  onToggleExpand: (() => void) | undefined;
  onOpenFilesModal: (dni: string, fichaIndex: number) => void;
  statuses: Record<string, LegajosRowStatus>;
  onRetry: (item: CheckLegajosItem) => void;
}

function PersonRow({
  person,
  hasMultipleFichas,
  isExpanded,
  onToggleExpand,
  onOpenFilesModal,
  statuses,
  onRetry,
}: PersonRowProps) {
  const hasFichas = person.fichas.length > 0;
  const primaryFicha = hasFichas ? person.fichas[0] : null;

  return (
    <>
      {/* Primary row */}
      <tr className="hover:bg-slate-50">
        {/* Ficha — chevron button on the left when multiple fichas */}
        <td className="px-4 py-3 text-slate-800">
          {hasMultipleFichas && onToggleExpand ? (
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1.5 cursor-pointer text-left"
              aria-label={isExpanded ? 'Colapsar fichas' : 'Expandir fichas'}
            >
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              <span>{primaryFicha ? primaryFicha.idAten : EM_DASH}</span>
            </button>
          ) : (
            <span>{primaryFicha ? primaryFicha.idAten : EM_DASH}</span>
          )}
        </td>
        <td className="px-4 py-3 text-slate-800">{cellValue(person.nombre)}</td>
        <td className="px-4 py-3 text-slate-600">{cellValue(person.empresa)}</td>
        <td className="px-4 py-3 text-slate-600">{primaryFicha ? primaryFicha.nroRuc : EM_DASH}</td>
        <td className="px-4 py-3 text-slate-600">{cellValue(person.proyecto)}</td>
        <td className="px-4 py-3 text-slate-600">{primaryFicha ? primaryFicha.nomCFa : EM_DASH}</td>
        <td className="px-4 py-3 text-slate-600">{person.dni}</td>
        <td className="px-4 py-3 text-slate-600">{cellValue(person.tipoExamen)}</td>
        <td className="px-4 py-3 text-slate-600">{cellValue(person.condic)}</td>
        <td className="px-4 py-3">
          {primaryFicha && primaryFicha.idAten ? (
            <LegajosStatusCell
              status={statuses[primaryFicha.idAten]}
              onRetry={() => {
                if (primaryFicha.nroRuc && primaryFicha.idAten) {
                  onRetry({
                    ruc: primaryFicha.nroRuc,
                    dni: person.dni,
                    idAten: primaryFicha.idAten,
                  });
                }
              }}
            />
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => onOpenFilesModal(person.dni, 0)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
          >
            Ver Archivos
          </button>
        </td>
      </tr>

      {/* Expanded sub-rows (fichas beyond the first) — same columns as primary row */}
      {hasMultipleFichas && isExpanded &&
        person.fichas.slice(1).map((ficha, idx) => (
          <tr key={`${person.dni}-alt-${idx}`} className="bg-sky-50/40 hover:bg-sky-50">
            <td className="px-4 py-2 text-slate-500 text-xs pl-10">{ficha.idAten || EM_DASH}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{cellValue(person.nombre)}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{cellValue(person.empresa)}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{ficha.nroRuc || EM_DASH}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{ficha.proyecto || cellValue(person.proyecto)}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{ficha.nomCFa || EM_DASH}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{person.dni}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{ficha.tipoExamen || cellValue(person.tipoExamen)}</td>
            <td className="px-4 py-2 text-slate-400 text-xs">{ficha.condic || cellValue(person.condic)}</td>
            <td className="px-4 py-2">
              {ficha.idAten ? (
                <LegajosStatusCell
                  status={statuses[ficha.idAten]}
                  onRetry={() => {
                    if (ficha.nroRuc && ficha.idAten) {
                      onRetry({
                        ruc: ficha.nroRuc,
                        dni: person.dni,
                        idAten: ficha.idAten,
                      });
                    }
                  }}
                />
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
            <td className="px-4 py-2">
              <button
                onClick={() => onOpenFilesModal(person.dni, idx + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
              >
                Ver Archivos
              </button>
            </td>
          </tr>
        ))}
    </>
  );
}
