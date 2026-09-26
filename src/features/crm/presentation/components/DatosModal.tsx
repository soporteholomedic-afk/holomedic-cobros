'use client';

import { useState, type FormEvent } from 'react';

import { CARGOS_OPERATIVOS, type DatosOperativosInput } from '../../domain/datosOperativos';
import { useTransicion } from '../hooks/useTransicion';
import { ModalBase } from './ModalBase';

/**
 * DatosModal — captures the operational contactos requested by the
 * DatosSolicitados event (crm-ux redesign): three OPTIONAL
 * (encargado, correo) pairs — facturación, médico ocupacional,
 * administrador. All fields optional by product decision: an empty
 * submit still registers the ask.
 *
 * Filled pairs travel as STRUCTURED `datos`; the API upserts them as
 * first-class contactos with a cargo (visible in the Contactos
 * section) BEFORE firing the transition, and rides the audit motivo
 * with a compact Spanish summary so the living timeline shows what
 * was obtained, where it happened.
 */

export interface DatosModalProps {
  empresaId: number;
  onSalir: () => void;
  onExito: () => void;
}

interface ParDato {
  encargado: string;
  correo: string;
}

const inputClase =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500';

/** Client-side shape check — the domain normalizer only trims/lowercases. */
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DatosModal({ empresaId, onSalir, onExito }: DatosModalProps) {
  const { ejecutar, enCurso } = useTransicion(empresaId);
  const [pares, setPares] = useState<Record<string, ParDato>>(() =>
    Object.fromEntries(
      CARGOS_OPERATIVOS.map(({ clave }) => [clave, { encargado: '', correo: '' }]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const cambiar = (clave: string, campo: keyof ParDato, valor: string) => {
    setPares((previo) => ({ ...previo, [clave]: { ...previo[clave], [campo]: valor } }));
  };

  async function enviar(eventoForm: FormEvent<HTMLFormElement>): Promise<void> {
    eventoForm.preventDefault();
    setError(null);

    for (const { clave, etiqueta } of CARGOS_OPERATIVOS) {
      const correo = pares[clave]?.correo.trim() ?? '';
      if (correo !== '' && !PATRON_CORREO.test(correo)) {
        setError(`El correo de "${etiqueta}" no es válido.`);
        return;
      }
    }

    const datos: DatosOperativosInput = {};
    for (const { clave } of CARGOS_OPERATIVOS) {
      const { encargado, correo } = pares[clave];
      const encargadoLimpio = encargado.trim();
      const correoLimpio = correo.trim();
      if (encargadoLimpio === '' && correoLimpio === '') continue;
      datos[clave] = { encargado: encargadoLimpio, correo: correoLimpio };
    }

    const resultado = await ejecutar({
      evento: 'DatosSolicitados',
      datos,
    });
    if (resultado.ok) {
      onExito();
    } else {
      setError(resultado.error);
    }
  }

  return (
    <ModalBase titulo="Pedir datos" onSalir={onSalir}>
      <p className="mb-4 text-xs text-slate-500">
        Todos los campos son opcionales — registrá lo que tengas. Lo que completes queda como contacto de
        la empresa y en el historial del evento.
      </p>
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {CARGOS_OPERATIVOS.map(({ clave, etiqueta }) => (
          <fieldset key={clave} className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-600">{etiqueta}</legend>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`dato-${clave}-encargado`} className="mb-1 block text-xs text-slate-500">
                  Encargado
                </label>
                <input
                  id={`dato-${clave}-encargado`}
                  type="text"
                  value={pares[clave].encargado}
                  onChange={(e) => cambiar(clave, 'encargado', e.target.value)}
                  className={inputClase}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor={`dato-${clave}-correo`} className="mb-1 block text-xs text-slate-500">
                  Correo
                </label>
                <input
                  id={`dato-${clave}-correo`}
                  type="email"
                  value={pares[clave].correo}
                  onChange={(e) => cambiar(clave, 'correo', e.target.value)}
                  className={inputClase}
                  autoComplete="off"
                />
              </div>
            </div>
          </fieldset>
        ))}
        {error !== null && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={enCurso}
          className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enCurso ? 'Registrando…' : 'Pedir datos'}
        </button>
      </form>
    </ModalBase>
  );
}
