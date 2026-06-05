'use client';

import { useState, useEffect, useCallback } from 'react';
import { GetPatientsByCompanyUseCase } from '../../application/getPatientsByCompany';
import { MockPatientRepo } from '../../infrastructure/mock/patientRepo';
import type { Patient } from '../../domain/entities';

interface SelectedPatientEntry {
  patientName: string;
  files: string[];
}

export interface SelectedPatients {
  [patientId: string]: SelectedPatientEntry;
}

export interface UsePatientsReturn {
  patients: Patient[];
  selectedPatients: SelectedPatients;
  togglePatient: (patientId: string) => void;
  toggleFile: (patientId: string, fileId: string) => void;
  isLoading: boolean;
  error: string | null;
}

const getPatientsUseCase = new GetPatientsByCompanyUseCase(new MockPatientRepo());

function buildInitialSelection(patients: Patient[]): SelectedPatients {
  const initial: SelectedPatients = {};
  for (const patient of patients) {
    initial[patient.id] = {
      patientName: patient.name,
      files: patient.files.map((f) => f.id),
    };
  }
  return initial;
}

export function usePatients(companyId: string): UsePatientsReturn {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatients, setSelectedPatients] = useState<SelectedPatients>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getPatientsUseCase
      .execute(companyId)
      .then((data) => {
        if (!cancelled) {
          setPatients(data);
          setSelectedPatients(buildInitialSelection(data));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar pacientes');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const togglePatient = useCallback((patientId: string) => {
    setSelectedPatients((prev) => {
      if (prev[patientId]) {
        // Remove patient from selection
        const updated = { ...prev };
        delete updated[patientId];
        return updated;
      }
      // Patient was not selected — restore with all files
      const patient = patients.find((p) => p.id === patientId);
      if (!patient) return prev;

      return {
        ...prev,
        [patientId]: {
          patientName: patient.name,
          files: patient.files.map((f) => f.id),
        },
      };
    });
  }, [patients]);

  const toggleFile = useCallback((patientId: string, fileId: string) => {
    setSelectedPatients((prev) => {
      const entry = prev[patientId];
      if (!entry) return prev;

      const newFiles = entry.files.includes(fileId)
        ? entry.files.filter((f) => f !== fileId)
        : [...entry.files, fileId];

      return {
        ...prev,
        [patientId]: {
          ...entry,
          files: newFiles,
        },
      };
    });
  }, []);

  return {
    patients,
    selectedPatients,
    togglePatient,
    toggleFile,
    isLoading,
    error,
  };
}
