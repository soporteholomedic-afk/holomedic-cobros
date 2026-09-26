'use client';

import { useState } from 'react';

import type { Empresa } from '../../domain/entities';
import { FormularioNuevaEmpresaRapida } from './FormularioNuevaEmpresaRapida';
import { ModalBase } from './ModalBase';
import { SeleccionarEmpresa } from './SeleccionarEmpresa';

/**
 * ModalAgregarEmpresa — the Cola de hoy quick-capture dialog (crm-ux
 * redesign). TWO paths behind ONE "Agregar empresa" button (product
 * decision: both options must be visible and switchable):
 *
 * - "Seleccionar existente" (default): claim a POOL empresa from the
 *   registry for the session user — avoids duplicates BEFORE they
 *   happen, which is why it opens first.
 * - "Crear nueva": the minimal registration form, auto-assigned to
 *   the session user and born with a pipeline row (origen default
 *   Inbound, T1/T6).
 *
 * Both paths end in the same place: an empresa assigned to the
 * session user, surfaced by the caller's toast (it lives in "Mi
 * cartera", not in the board columns — those are due-state derived).
 */

type Pestana = 'existente' | 'nueva';

export interface ModalAgregarEmpresaProps {
  /** Session username (session.sub) — the auto-assignment target. */
  usuario: string;
  /** Session display name (session.nombre); username fallback. */
  nombreUsuario: string | null;
  onCerrar: () => void;
  onCreada: (empresa: Empresa) => void;
  onAsignada: (empresa: Empresa) => void;
}

const PESTANAS: readonly { clave: Pestana; etiqueta: string }[] = [
  { clave: 'existente', etiqueta: 'Seleccionar existente' },
  { clave: 'nueva', etiqueta: 'Crear nueva' },
];

export function ModalAgregarEmpresa({
  usuario,
  nombreUsuario,
  onCerrar,
  onCreada,
  onAsignada,
}: ModalAgregarEmpresaProps) {
  const [pestana, setPestana] = useState<Pestana>('existente');

  return (
    <ModalBase titulo="Agregar empresa" onSalir={onCerrar}>
      <div role="tablist" aria-label="Cómo agregar la empresa" className="mb-4 grid grid-cols-2 gap-2">
        {PESTANAS.map(({ clave, etiqueta }) => {
          const activa = pestana === clave;
          return (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestana(clave)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activa
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {etiqueta}
            </button>
          );
        })}
      </div>
      {pestana === 'existente' ? (
        <SeleccionarEmpresa usuario={usuario} onAsignada={onAsignada} />
      ) : (
        <FormularioNuevaEmpresaRapida usuario={usuario} nombreUsuario={nombreUsuario} onCreada={onCreada} />
      )}
    </ModalBase>
  );
}
