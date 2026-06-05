'use client';

import { useState, useEffect } from 'react';
import { GetCompaniesUseCase } from '../../application/getCompanies';
import { MockCompanyRepo } from '../../infrastructure/mock/companyRepo';
import type { Company } from '../../domain/entities';

const getCompaniesUseCase = new GetCompaniesUseCase(new MockCompanyRepo());

export interface UseCompaniesReturn {
  companies: Company[];
  selectedCompanyId: string | null;
  selectCompany: (id: string) => void;
  isLoading: boolean;
  error: string | null;
}

export function useCompanies(): UseCompaniesReturn {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCompaniesUseCase
      .execute()
      .then((data) => {
        if (!cancelled) {
          setCompanies(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar empresas');
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
  }, []);

  const selectCompany = (id: string) => {
    setSelectedCompanyId(id);
  };

  return {
    companies,
    selectedCompanyId,
    selectCompany,
    isLoading,
    error,
  };
}
