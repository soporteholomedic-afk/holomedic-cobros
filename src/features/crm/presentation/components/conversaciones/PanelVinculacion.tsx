'use client';

import { useState } from 'react';
import { Building2, Link2, UserPlus } from 'lucide-react';

import { useCandidatosContacto, type EntradaVincularUi } from '../../hooks/useHiloConversacion';
import { useEmpresas } from '../../hooks/useEmpresas';
import { formatearTelefono } from './guards';

/**
 * PanelVinculacion (agente-ia-crm E1) — the PENDIENTE_VINCULACION
 * resolver shown INSTEAD of the composer: two actions per the E1
 * design — "Asociar contacto" (live search over
 * /api/crm/conversaciones/[id]/candidatos, click to link) and "Crear
 * contacto" (empresa search via the existing GET /api/crm/empresas?q=
 * + nombre/cargo → link creating the contacto). All fetches live in
 * hooks (useCandidatosContacto, useEmpresas); the panel only renders
 * and reports the chosen payload through `onVincular` (HiloConversacion
 * owns the POST + reload).
 */

export interface PanelVinculacionProps {
  conversacionId: number;
  telefono: string | null;
  onVincular: (entrada: EntradaVincularUi) => Promise<boolean>;
  vinculando: boolean;
  errorVinculacion: string | null;
}

type Modo = 'asociar' | 'crear';

const CLASE_INPUT =
  'w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 px-3 py-2 text-xs transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500 sm:text-sm';

export function PanelVinculacion({
  conversacionId,
  telefono,
  onVincular,
  vinculando,
  errorVinculacion,
}: PanelVinculacionProps) {
  const [modo, setModo] = useState<Modo>('asociar');
  const [busquedaContacto, setBusquedaContacto] = useState('');
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const [empresaElegida, setEmpresaElegida] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('');

  const { candidatos, status: statusCandidatos } = useCandidatosContacto(
    conversacionId,
    busquedaContacto,
  );
  const { empresas } = useEmpresas({ q: busquedaEmpresa, tipo: '' });

  const puedeCrear = empresaElegida !== null && nombre.trim() !== '';

  return (
    <div className="border-t border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Conversación sin vincular
          {telefono !== null ? ` · ${formatearTelefono(telefono)}` : ''}
        </p>
      </div>
      <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-400/80">
        Asociala a un contacto existente o creá uno nuevo para dejarla operable.
      </p>

      <div className="mt-3 flex gap-2" role="tablist" aria-label="Modo de vinculación">
        <button
          type="button"
          role="tab"
          aria-selected={modo === 'asociar'}
          onClick={() => setModo('asociar')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            modo === 'asociar'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'border border-amber-300 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
          Asociar contacto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === 'crear'}
          onClick={() => setModo('crear')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            modo === 'crear'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'border border-amber-300 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Crear contacto
        </button>
      </div>

      {modo === 'asociar' && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            aria-label="Buscar contacto"
            placeholder="Nombre del contacto o empresa (mínimo 2 letras)..."
            value={busquedaContacto}
            onChange={(evento) => setBusquedaContacto(evento.target.value)}
            className={CLASE_INPUT}
          />
          <div className="max-h-44 space-y-1 overflow-y-auto" aria-label="Candidatos a asociar">
            {statusCandidatos === 'loading' && (
              <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">Buscando…</p>
            )}
            {statusCandidatos === 'error' && (
              <p className="px-1 py-2 text-xs text-red-600 dark:text-red-400">
                No se pudo buscar contactos. Probá de nuevo.
              </p>
            )}
            {statusCandidatos === 'ready' && candidatos.length === 0 && (
              <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">
                Sin coincidencias.
              </p>
            )}
            {candidatos.map((candidato) => (
              <button
                key={candidato.contactoId}
                type="button"
                disabled={vinculando}
                onClick={() =>
                  void onVincular({ modo: 'asociar', contactoId: candidato.contactoId })
                }
                className="block w-full rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-3 py-2 text-left text-xs transition-colors hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="block font-semibold text-slate-800 dark:text-slate-200">
                  {candidato.nombreContacto}
                </span>
                <span className="block text-slate-500 dark:text-slate-400">
                  {candidato.razonSocial ?? 'Sin empresa'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {modo === 'crear' && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            aria-label="Buscar empresa"
            placeholder="Buscar empresa por razón social o RUC..."
            value={busquedaEmpresa}
            onChange={(evento) => {
              setBusquedaEmpresa(evento.target.value);
              setEmpresaElegida(null);
            }}
            className={CLASE_INPUT}
          />
          <div className="max-h-32 space-y-1 overflow-y-auto" aria-label="Empresas">
            {empresas.map((empresa) => (
              <button
                key={empresa.id}
                type="button"
                onClick={() => setEmpresaElegida(empresa.id)}
                aria-pressed={empresaElegida === empresa.id}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  empresaElegida === empresa.id
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40'
                    : 'border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900 hover:border-teal-400'
                }`}
              >
                <span className="block font-semibold text-slate-800 dark:text-slate-200">
                  {empresa.razonSocial}
                </span>
                <span className="block text-slate-500 dark:text-slate-400">RUC: {empresa.ruc}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              aria-label="Nombre del nuevo contacto"
              placeholder="Nombre y apellido"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              className={CLASE_INPUT}
            />
            <input
              type="text"
              aria-label="Cargo (opcional)"
              placeholder="Cargo (opcional)"
              value={cargo}
              onChange={(evento) => setCargo(evento.target.value)}
              className={CLASE_INPUT}
            />
          </div>
          <button
            type="button"
            disabled={!puedeCrear || vinculando}
            onClick={() => {
              if (empresaElegida === null) return; // botón deshabilitado igual
              void onVincular({
                modo: 'crear',
                nuevoContacto: {
                  empresaId: empresaElegida,
                  nombre: nombre.trim(),
                  cargo: cargo.trim() === '' ? null : cargo.trim(),
                },
              });
            }}
            className="inline-flex items-center rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          >
            {vinculando ? 'Vinculando…' : 'Crear y vincular'}
          </button>
        </div>
      )}

      {errorVinculacion !== null && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-medium text-red-700 dark:text-red-400"
        >
          {errorVinculacion}
        </p>
      )}
    </div>
  );
}
