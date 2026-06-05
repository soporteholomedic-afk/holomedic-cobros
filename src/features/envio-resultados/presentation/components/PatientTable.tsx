'use client';

import { useState, useEffect, useCallback } from 'react';
import { GetPatientsByCompanyUseCase } from '../../application/getPatientsByCompany';
import { MockPatientRepo } from '../../infrastructure/mock/patientRepo';
import type { Patient, PatientFile } from '../../domain/entities';

interface SelectedPatients {
  [patientId: string]: {
    patientName: string;
    files: string[]; // selected file ids
  };
}

interface PatientTableProps {
  companyId: string;
  onSelectionChange: (selected: SelectedPatients) => void;
}

const getPatientsUseCase = new GetPatientsByCompanyUseCase(new MockPatientRepo());

export function PatientTable({ companyId, onSelectionChange }: PatientTableProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedPatients>({});

  useEffect(() => {
    let cancelled = false;

    getPatientsUseCase
      .execute(companyId)
      .then((data) => {
        if (!cancelled) {
          setPatients(data);

          // Initialize all patients with all files selected
          const initialSelected: SelectedPatients = {};
          for (const patient of data) {
            initialSelected[patient.id] = {
              patientName: patient.name,
              files: patient.files.map((f) => f.id),
            };
          }
          setSelected(initialSelected);
          onSelectionChange(initialSelected);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, onSelectionChange]);

  const toggleExpand = useCallback((patientId: string) => {
    setExpandedPatient((prev) => (prev === patientId ? null : patientId));
  }, []);

  const toggleFile = useCallback(
    (patientId: string, fileId: string) => {
      setSelected((prev) => {
        const patient = prev[patientId];
        if (!patient) return prev;

        const newFiles = patient.files.includes(fileId)
          ? patient.files.filter((f) => f !== fileId)
          : [...patient.files, fileId];

        const updated = {
          ...prev,
          [patientId]: {
            ...patient,
            files: newFiles,
          },
        };

        onSelectionChange(updated);
        return updated;
      });
    },
    [onSelectionChange],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando pacientes...</p>
        </div>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">No hay pacientes para esta empresa</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {patients.map((patient) => {
        const isExpanded = expandedPatient === patient.id;
        const patientFiles = selected[patient.id]?.files ?? [];

        return (
          <div
            key={patient.id}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            {/* Patient header — clickable to expand */}
            <button
              onClick={() => toggleExpand(patient.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors cursor-pointer text-left"
            >
              <div>
                <h3 className="font-medium text-slate-800">{patient.name}</h3>
                <p className="text-sm text-slate-500">DNI: {patient.dni}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                  {patientFiles.length} / {patient.files.length} archivos
                </span>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expandable file checkboxes */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                  Archivos
                </p>
                <div className="space-y-2">
                  {patient.files.map((file: PatientFile) => (
                    <label
                      key={file.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={patientFiles.includes(file.id)}
                        onChange={() => toggleFile(patient.id, file.id)}
                        aria-label={file.name}
                        className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm text-slate-700">{file.name}</span>
                      </div>
                      <span className="ml-auto text-xs text-slate-400">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
