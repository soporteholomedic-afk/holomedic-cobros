'use client';

import { useState, useCallback } from 'react';
import { useUnifiedResults } from '../hooks/useUnifiedResults';
import { useCompanies } from '../hooks/useCompanies';
import type { Company } from '../../domain/entities';
import type { UnifiedPerson } from '@/types/sp-result';
import type { FileNode } from '@/features/envio-resultados/domain/file-system/FileNode';
import { FilesModal } from './FilesModal';
import { EmailEditor } from './EmailEditor';
import {
  emailViewDataFromFiles,
  type EmailViewData,
} from '../helpers/emailViewDataFromFiles';

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
   * Bridge from `FilesModal.onSend(files)` to the `EmailEditor` payload.
   * Reconstructs the patient context from the current `modalState`,
   * resolves `companyId` via `useCompanies` (spec EI-2), and stores
   * the bridged data so the EmailEditor overlay can mount in place
   * of the table.
   *
   * Refs are synthesized as `::${file.name}` because the modal does
   * not emit the explorer-pane path (PR #3 deviated from the design's
   * wider signature). Within a single patient archive, file names
   * are unique, so this is functionally correct for the common case.
   */
  const handleSendFromModal = useCallback(
    (files: FileNode[]): void => {
      if (!modalState) return;
      const person = people.find((p) => p.dni === modalState.dni);
      if (!person) return;
      const ficha = person.fichas[modalState.fichaIndex] ?? null;
      const companyId = resolveCompanyId(companies, person.empresa);
      const refs = files.map((file) => `::${file.name}`);
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

  const returnToTable = useCallback((): void => {
    setEmailViewData(null);
  }, []);

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
          <h2 className="text-xl font-semibold text-slate-800 mb-4">{companyName}</h2>
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
              onClose={closeFilesModal}
              onSend={handleSendFromModal}
            />
          );
        })()}
      {emailViewData && (
        <section
          data-testid="email-editor-overlay"
          className="fixed inset-0 z-50 bg-white dark:bg-slate-900 overflow-auto"
        >
          <div className="max-w-7xl mx-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Redactar correo</h2>
              <button
                type="button"
                onClick={returnToTable}
                data-testid="email-editor-back"
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold"
              >
                Volver a la tabla
              </button>
            </div>
            <EmailEditor
              companyId={emailViewData.companyId}
              companyName={emailViewData.companyName}
              selectedPatients={emailViewData.selectedPatients}
              patients={emailViewData.patients}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// ---- Internal: single person row + optional expanded sub-rows ----

interface PersonRowProps {
  person: UnifiedPerson;
  hasMultipleFichas: boolean;
  isExpanded: boolean;
  onToggleExpand: (() => void) | undefined;
  onOpenFilesModal: (dni: string, fichaIndex: number) => void;
}

function PersonRow({
  person,
  hasMultipleFichas,
  isExpanded,
  onToggleExpand,
  onOpenFilesModal,
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
