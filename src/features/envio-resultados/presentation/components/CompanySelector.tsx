'use client';

import { useState, useEffect } from 'react';
import { GetCompaniesUseCase } from '../../application/getCompanies';
import { MockCompanyRepo } from '../../infrastructure/mock/companyRepo';
import type { Company } from '../../domain/entities';

interface CompanySelectorProps {
  onSelect: (companyId: string) => void;
}

const getCompaniesUseCase = new GetCompaniesUseCase(new MockCompanyRepo());

export function CompanySelector({ onSelect }: CompanySelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCompaniesUseCase
      .execute()
      .then((data) => {
        if (!cancelled) {
          setCompanies(data);
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
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando empresas...</p>
        </div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">No hay empresas disponibles</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {companies.map((company) => (
        <button
          key={company.id}
          onClick={() => onSelect(company.id)}
          className="text-left p-6 rounded-xl border border-slate-200 bg-white hover:border-sky-300 hover:shadow-md hover:shadow-sky-100/50 transition-all duration-200 cursor-pointer"
        >
          <h3 className="text-lg font-semibold text-slate-800 mb-2">{company.name}</h3>
          <p className="text-sm text-slate-500 mb-1">{company.ruc}</p>
          <p className="text-sm text-sky-600">{company.email}</p>
        </button>
      ))}
    </div>
  );
}
