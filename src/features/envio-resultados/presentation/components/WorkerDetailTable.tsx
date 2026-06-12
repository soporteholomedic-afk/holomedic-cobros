'use client';

import { useState, useCallback } from 'react';
import { useUnifiedResults } from '../hooks/useUnifiedResults';
import type { UnifiedPerson } from '@/types/sp-result';

interface WorkerDetailTableProps {
  companyName: string;
  fechaInicio: string;
  fechaFin: string;
}

const EM_DASH = '\u2014';

function cellValue(value: string): string {
  return value || EM_DASH;
}

export function WorkerDetailTable({ companyName, fechaInicio, fechaFin }: WorkerDetailTableProps) {
  const { people, loading, error } = useUnifiedResults(companyName, fechaInicio, fechaFin);
  const [expandedDni, setExpandedDni] = useState<string | null>(null);

  const toggleExpand = useCallback((dni: string) => {
    setExpandedDni((prev) => (prev === dni ? null : dni));
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
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Internal: single person row + optional expanded sub-rows ----

interface PersonRowProps {
  person: UnifiedPerson;
  hasMultipleFichas: boolean;
  isExpanded: boolean;
  onToggleExpand: (() => void) | undefined;
}

function PersonRow({ person, hasMultipleFichas, isExpanded, onToggleExpand }: PersonRowProps) {
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
          </tr>
        ))}
    </>
  );
}
