'use client';

import { useState } from 'react';

import type { Empresa } from '../../domain/entities';
import {
  buildCrearEmpresaInput,
  partirCorreosFormulario,
  useCrearEmpresa,
  type FormularioEmpresaState,
} from '../hooks/useCrearEmpresa';

/**
 * FormularioNuevaEmpresaRapida — the quick-capture form body (crm-ux
 * redesign), extracted from the former standalone modal so the board's
 * ModalAgregarEmpresa can host it under its "Crear nueva" tab. The
 * full 11-field form stays at /crm/empresas/nueva (admin territory).
 *
 * Two domain contracts shape the defaults:
 * - `origen` defaults to Inbound because the repository only seeds
 *   the CRM_Pipeline row at birth when the registration carries an
 *   origen (T1/T6) — without it the empresa would be invisible to
 *   cartera/pipeline views.
 * - `responsable` is forced to the session user BOTH here (client)
 *   and by the API's non-admin self-assignment guard (server) — the
 *   quick capture can never create work for someone else.
 */

export interface FormularioNuevaEmpresaRapidaProps {
  /** Session username (session.sub) — the auto-assigned responsable. */
  usuario: string;
  /** Display name for the subtitle (session.nombre); username fallback. */
  nombreUsuario: string | null;
  onCreada: (empresa: Empresa) => void;
}

const ESTADO_INICIAL: FormularioEmpresaState = {
  razonSocial: '',
  ruc: '',
  tipo: 'Prospecto',
  origen: 'Inbound',
  proyectoObra: '',
  destinoComun: '',
  notas: '',
  encargado: '',
  correos: '',
  telefono: '',
  principal: true,
};

const inputClase =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none';
const labelClase = 'mb-1 block text-xs font-medium text-slate-600';

export function FormularioNuevaEmpresaRapida({
  usuario,
  nombreUsuario,
  onCreada,
}: FormularioNuevaEmpresaRapidaProps) {
  const { crear, enCurso } = useCrearEmpresa();
  const [estado, setEstado] = useState<FormularioEmpresaState>(ESTADO_INICIAL);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (campo: keyof FormularioEmpresaState, valor: string) => {
    setEstado((previo) => ({ ...previo, [campo]: valor }));
  };

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);

    if (
      estado.razonSocial.trim() === '' ||
      estado.ruc.trim() === '' ||
      estado.encargado.trim() === '' ||
      partirCorreosFormulario(estado.correos).length === 0
    ) {
      setError('Completa razón social, RUC, encargado y al menos un correo.');
      return;
    }

    try {
      const input = buildCrearEmpresaInput(estado, usuario);
      const resultado = await crear(input);
      if (resultado.ok) {
        onCreada(resultado.empresa);
      } else {
        setError(resultado.error);
      }
    } catch {
      // Only the tipo invariant can throw here (guarded by the select).
      setError('Selecciona el tipo de empresa.');
    }
  }

  return (
    <div>
      <p className="mb-4 text-xs text-slate-500">
        Queda asignada a <span className="font-medium">{nombreUsuario ?? usuario}</span> y arranca en el
        pipeline.
      </p>
      <form onSubmit={enviar} className="space-y-3" noValidate>
        <div>
          <label htmlFor="nueva-razon" className={labelClase}>
            Razón social *
          </label>
          <input
            id="nueva-razon"
            type="text"
            value={estado.razonSocial}
            onChange={(e) => cambiar('razonSocial', e.target.value)}
            className={inputClase}
            autoComplete="off"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nueva-ruc" className={labelClase}>
              RUC *
            </label>
            <input
              id="nueva-ruc"
              type="text"
              value={estado.ruc}
              onChange={(e) => cambiar('ruc', e.target.value)}
              className={inputClase}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label htmlFor="nueva-telefono" className={labelClase}>
              Teléfono
            </label>
            <input
              id="nueva-telefono"
              type="text"
              value={estado.telefono}
              onChange={(e) => cambiar('telefono', e.target.value)}
              className={inputClase}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nueva-tipo" className={labelClase}>
              Tipo *
            </label>
            <select
              id="nueva-tipo"
              value={estado.tipo}
              onChange={(e) => cambiar('tipo', e.target.value)}
              className={inputClase}
            >
              <option value="Prospecto">Prospecto</option>
              <option value="Cliente">Cliente</option>
            </select>
          </div>
          <div>
            <label htmlFor="nueva-origen" className={labelClase}>
              Origen *
            </label>
            <select
              id="nueva-origen"
              value={estado.origen}
              onChange={(e) => cambiar('origen', e.target.value)}
              className={inputClase}
            >
              <option value="Inbound">Nos contactaron</option>
              <option value="Outbound">Los buscamos</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="nueva-encargado" className={labelClase}>
            Encargado *
          </label>
          <input
            id="nueva-encargado"
            type="text"
            value={estado.encargado}
            onChange={(e) => cambiar('encargado', e.target.value)}
            className={inputClase}
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor="nueva-correos" className={labelClase}>
            Correos * <span className="font-normal text-slate-400">(separados por &quot;;&quot;)</span>
          </label>
          <input
            id="nueva-correos"
            type="text"
            value={estado.correos}
            onChange={(e) => cambiar('correos', e.target.value)}
            className={inputClase}
            autoComplete="off"
            placeholder="compras@empresa.com; gerencia@empresa.com"
            required
          />
        </div>
        {error !== null && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={enCurso}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enCurso ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  );
}
