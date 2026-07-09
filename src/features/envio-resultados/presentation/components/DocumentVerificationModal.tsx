'use client';

import { useEffect, useMemo, type ReactElement } from 'react';
import { X } from 'lucide-react';
import type { LegajosRowStatus } from '@/features/envio-resultados/presentation/hooks/useLegajosStatus';
import type { UnifiedPerson } from '@/types/sp-result';
import {
  aggregateDocumentStatuses,
  type DocumentCoverageSection,
  type PatientCoverageEntry,
} from '../utils/aggregateDocumentStatuses';

export interface DocumentVerificationModalProps {
  statuses: Readonly<Record<string, LegajosRowStatus>>;
  people: ReadonlyArray<UnifiedPerson>;
  onClose: () => void;
}

/**
 * Document Verification Modal — shows an at-a-glance summary of CAMO and
 * EMO coverage across all patients in a batch, after the existing
 * "Verificar documentos" verification resolves.
 *
 * The modal is a thin renderer. All per-patient state logic is owned by
 * the pure `aggregateDocumentStatuses` helper (tested in isolation).
 * This component only:
 *   1. Calls the helper with the current `statuses` + `people`.
 *   2. Renders two independent sections (CAMO + EMO), each with one of
 *      COMPLETO / PARCIAL / VACIO.
 *   3. Shows a "CAMO COMPLETOS" / "EMO COMPLETOS" banner per section
 *      when that section is COMPLETO.
 *   4. Renders per-patient rows. Patients in a section's `without[]`
 *      get a clickable no-op GENERAR button; patients in `with[]` are
 *      listed without a button.
 *   5. Closes via Escape key, backdrop click, or the explicit "Cerrar"
 *      footer button — all three call the same `onClose` callback.
 *
 * The visual chrome mirrors `FilesModal` (fixed backdrop, white card,
 * header/body/footer, Escape `useEffect`, backdrop `onClick`,
 * `role="dialog"`) but the component is independent and has no tabs or
 * file-explorer dependencies.
 */
export function DocumentVerificationModal({
  statuses,
  people,
  onClose,
}: DocumentVerificationModalProps): ReactElement {
  // Derive coverage once. `useMemo` only because the helper is pure
  // and we want to keep referential stability when the parent passes
  // new `statuses`/`people` references for unrelated reasons (defensive
  // — the helper is cheap).
  const aggregated = useMemo(
    () => aggregateDocumentStatuses(statuses, people),
    [statuses, people],
  );

  // Escape-key close handler. Mirrors `FilesModal`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totalPatients = people.length;
  const headerTitle = 'Verificación de Documentos';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="verification-modal-backdrop"
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={headerTitle}
        data-testid="verification-modal"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div className="space-y-1">
            <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
              Verificación
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">
              {headerTitle}
            </h2>
            <p className="text-sm text-slate-500">
              {totalPatients === 0
                ? 'No hay pacientes en este lote.'
                : `${totalPatients} paciente${totalPatients !== 1 ? 's' : ''} en este lote.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            data-testid="verification-modal-x"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — two independent sections (CAMO, EMO), with banners. */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Both banners render independently — visible simultaneously
              when both sections are COMPLETO. */}
          {aggregated.camo.state === 'COMPLETO' && (
            <div
              data-testid="banner-camo-completo"
              className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"
            >
              CAMO COMPLETOS
            </div>
          )}
          {aggregated.emo.state === 'COMPLETO' && (
            <div
              data-testid="banner-emo-completo"
              className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800"
            >
              EMO COMPLETOS
            </div>
          )}

          <DocumentSection label="CAMO" section={aggregated.camo} />
          <DocumentSection label="EMO" section={aggregated.emo} />
        </div>

        {/* Footer — explicit close button (mirrors FilesModal). */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            data-testid="modal-close"
            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Internal: single document section ----

interface DocumentSectionProps {
  label: 'CAMO' | 'EMO';
  section: DocumentCoverageSection;
}

function DocumentSection({ label, section }: DocumentSectionProps): ReactElement {
  const id = label.toLowerCase();
  const generateLabel = label === 'CAMO' ? 'GENERAR CAMO' : 'GENERAR EMO';
  const isEmpty = section.with.length === 0 && section.without.length === 0;

  return (
    <section
      data-testid={`section-${id}`}
      className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Section header: title + state pill. The pill carries
          `data-state` so tests can assert the exact coverage state
          with a single attribute (no separate hidden markers). */}
      <header className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{label}</h3>
        <span
          data-testid={`state-${id}`}
          data-state={section.state}
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${stateClasses(
            section.state,
            label,
          )}`}
        >
          {section.state}
        </span>
      </header>

      {/* Patient list — patients in `with[]` first (no button), then
          `without[]` (with a GENERAR placeholder). When the section
          is COMPLETO, `without[]` is empty so all rows are without
          buttons. When VACIO, `with[]` is empty. */}
      {isEmpty ? (
        <p className="px-5 py-4 text-sm text-slate-500 text-center" data-testid={`empty-${id}`}>
          Sin pacientes en este lote.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {section.with.length > 0 && (
            <SubHeader label={`Con ${label} (${section.with.length})`} />
          )}
          {section.with.map((entry) => (
            <PatientRow
              key={entry.dni}
              entry={entry}
              testId={`patient-row-${entry.dni}`}
              showGenerar={false}
              generateLabel={generateLabel}
            />
          ))}
          {section.without.length > 0 && (
            <SubHeader label={`Sin ${label} (${section.without.length})`} />
          )}
          {section.without.map((entry) => (
            <PatientRow
              key={entry.dni}
              entry={entry}
              testId={`patient-row-${entry.dni}`}
              showGenerar
              generateLabel={generateLabel}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Small header for a sub-group inside a section (e.g. "Con CAMO (3)"). */
function SubHeader({ label }: { label: string }): ReactElement {
  return (
    <li className="px-5 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/30">
      {label}
    </li>
  );
}

// ---- Internal: single patient row ----

interface PatientRowProps {
  entry: PatientCoverageEntry;
  testId: string;
  showGenerar: boolean;
  generateLabel: string;
}

function PatientRow({
  entry,
  testId,
  showGenerar,
  generateLabel,
}: PatientRowProps): ReactElement {
  return (
    <li
      data-testid={testId}
      className="px-5 py-3 flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate">
          {entry.nombrePaciente}
        </p>
        <p className="text-xs text-slate-500">DNI {entry.dni}</p>
      </div>
      {showGenerar && (
        <button
          type="button"
          // No-op placeholder: GENERAR wiring is out of scope for
          // this change. Click must do nothing (not close the modal,
          // not mutate parent state). The test asserts onClose is not
          // called when this is clicked.
          onClick={() => {}}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
        >
          {generateLabel}
        </button>
      )}
    </li>
  );
}

// ---- Helpers ----

/** Tailwind classes for the state pill. Coloured to match the per-row
 *  badges in `WorkerDetailTable` (CAMO = green, EMO = violet). */
function stateClasses(state: DocumentCoverageSection['state'], label: 'CAMO' | 'EMO'): string {
  if (state === 'COMPLETO') {
    return label === 'CAMO'
      ? 'bg-green-100 text-green-800'
      : 'bg-violet-100 text-violet-800';
  }
  if (state === 'PARCIAL') {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-slate-100 text-slate-500';
}
