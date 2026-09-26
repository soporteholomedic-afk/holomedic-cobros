'use client';

import { useEffect, useState } from 'react';

import type { Empresa } from '../../domain/entities';
import { useAsignarEmpresa } from '../hooks/useAsignarEmpresa';
import { useEmpresas } from '../hooks/useEmpresas';
import { ModalBase } from './ModalBase';

/**
 * SeleccionarEmpresa — the "empresa ya creada" half of the board's
 * quick-capture (crm-ux redesign): searches the registry (razón
 * social / RUC) and claims an empresa for the session user via the
 * self-assign API.
 *
 * Taking semantics (product decision): POOL empresas (no responsable)
 * are taken directly — nobody loses anything. OWNED empresas are also
 * takeable, but through an explicit confirmation popup that names the
 * current owner: the reassignment is deliberate, and the audit trail
 * (REASIGNADO + actor) keeps it traceable. Empresas already mine say
 * so and offer no action.
 *
 * The search debounces 300ms before hitting useEmpresas so typing
 * "constructora" fires one request, not one per keystroke.
 */

export interface SeleccionarEmpresaProps {
  /** Session username (session.sub) — the self-claim responsable. */
  usuario: string;
  onAsignada: (empresa: Empresa) => void;
}

const DEBOUNCE_MS = 300;

export function SeleccionarEmpresa({ usuario, onAsignada }: SeleccionarEmpresaProps) {
  const [consulta, setConsulta] = useState('');
  const [q, setQ] = useState('');
  const { empresas, status, error, retry } = useEmpresas({ q, tipo: '' });
  const { asignar, enCurso } = useAsignarEmpresa();
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [empresaPorConfirmar, setEmpresaPorConfirmar] = useState<Empresa | null>(null);

  // Debounce the free-text search into the effective query (300ms).
  useEffect(() => {
    const timer = setTimeout(() => setQ(consulta), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [consulta]);

  async function tomar(empresa: Empresa) {
    setErrorAsignacion(null);
    const resultado = await asignar(empresa.id, usuario);
    if (resultado.ok) {
      setEmpresaPorConfirmar(null);
      onAsignada(empresa);
    } else {
      setErrorAsignacion(resultado.error);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Busca por razón social o RUC y toma una empresa del pool — queda a tu cargo.
      </p>
      <div>
        <label htmlFor="buscar-empresa" className="mb-1 block text-xs font-medium text-slate-600">
          Buscar empresa
        </label>
        <input
          id="buscar-empresa"
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Razón social o RUC…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
          autoComplete="off"
        />
      </div>

      {status === 'error' ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <span>{error ?? 'Error al buscar empresas'}</span>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      ) : status === 'loading' ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
        </div>
      ) : empresas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
          Sin resultados. Si la empresa no existe, creala en la pestaña &quot;Crear nueva&quot;.
        </p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {empresas.map((empresa) => {
            const esMia = empresa.responsable === usuario;
            const tieneOtroDueno = empresa.responsable !== null && !esMia;
            return (
              <li
                key={empresa.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {empresa.razonSocial}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    RUC {empresa.ruc} · {empresa.tipo}
                  </span>
                </div>
                {esMia ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Ya es tuya
                  </span>
                ) : tieneOtroDueno ? (
                  <>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      De {empresa.responsable}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmpresaPorConfirmar(empresa)}
                      disabled={enCurso}
                      className="shrink-0 rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Tomar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void tomar(empresa)}
                    disabled={enCurso}
                    className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {enCurso ? 'Tomando…' : 'Tomar'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {errorAsignacion !== null && empresaPorConfirmar === null && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {errorAsignacion}
        </p>
      )}

      {empresaPorConfirmar !== null && (
        <ModalBase titulo="Tomar empresa" onSalir={() => setEmpresaPorConfirmar(null)}>
          <p className="text-sm text-slate-700">
            &laquo;{empresaPorConfirmar.razonSocial}&raquo; está asignada a{' '}
            <span className="font-semibold">{empresaPorConfirmar.responsable}</span>.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Al tomarla quedará a tu cargo. El cambio queda registrado en el historial de asignaciones.
          </p>
          {errorAsignacion !== null && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorAsignacion}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void tomar(empresaPorConfirmar)}
              disabled={enCurso}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enCurso ? 'Tomando…' : 'Sí, tomar'}
            </button>
          </div>
        </ModalBase>
      )}
    </div>
  );
}
