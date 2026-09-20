'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

import type { TipoEmpresa } from '../../domain/entities';
import { useEmpresas } from '../hooks/useEmpresas';

/**
 * EmpresaList — the `/crm` registry list (spec G1). Owns the filter
 * inputs (q applied on submit to avoid a fetch per keystroke; tipo
 * applies immediately) and delegates fetching to `useEmpresas`.
 * Every row links to the empresa detail page (registry → detail flow;
 * post-verify UX remediation — ColaHoy/CarteraTable precedent).
 * All labels Spanish (repo convention).
 */
export function EmpresaList() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<'' | TipoEmpresa>('');
  const { empresas, status, error, retry } = useEmpresas({ q, tipo });

  function buscar(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setQ(qInput);
  }

  function limpiar(): void {
    setQInput('');
    setQ('');
    setTipo('');
  }

  return (
    <section aria-label="Empresas" className="space-y-4">
      <form
        role="search"
        onSubmit={buscar}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input
          aria-label="Buscar empresa"
          placeholder="Buscar por razón social o RUC"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
        <select
          aria-label="Filtrar por tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as '' | TipoEmpresa)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        >
          <option value="">Todos</option>
          <option value="Cliente">Cliente</option>
          <option value="Prospecto">Prospecto</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={limpiar}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Limpiar
        </button>
      </form>

      {status === 'error' && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{error ?? 'Error al cargar las empresas'}</span>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div role="status" className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          <span className="ml-3 text-sm text-slate-500">Cargando empresas…</span>
        </div>
      )}

      {status === 'ready' && empresas.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No se encontraron empresas.
        </p>
      )}

      {status === 'ready' && empresas.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">RUC</th>
                <th scope="col" className="px-4 py-3">Razón Social</th>
                <th scope="col" className="px-4 py-3">Tipo</th>
                <th scope="col" className="px-4 py-3">Responsable</th>
                <th scope="col" className="px-4 py-3">Contactos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empresas.map((empresa) => (
                <tr key={empresa.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{empresa.ruc}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link
                      href={`/crm/empresas/${empresa.id}`}
                      className="hover:text-sky-600 hover:underline"
                    >
                      {empresa.razonSocial}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{empresa.tipo}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {empresa.responsable ?? 'Sin asignar'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{empresa.contactos.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
