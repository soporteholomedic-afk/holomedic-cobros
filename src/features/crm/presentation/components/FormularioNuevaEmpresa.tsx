'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { Empresa } from '../../domain/entities';
import { normalizarRuc } from '../../domain/normalizar';
import {
  buildCrearEmpresaInput,
  partirCorreosFormulario,
  useCrearEmpresa,
  type FormularioEmpresaState,
} from '../hooks/useCrearEmpresa';

/**
 * FormularioNuevaEmpresa — manual empresa registration (post-verify UX
 * remediation; the inbound flow's literal first step: "Registramos los
 * datos de contacto: Correo, RUC, Encargado, Proyecto/Obra, Destino
 * Común, Teléfono"). Page-scale by design (ModalBase is scoped to 1–2
 * field confirmations): both registration paths — existing client OR
 * new prospect — are choosable via the required Tipo radio.
 *
 * Validation is client-side with Spanish messages; the RUC check
 * reuses the domain normalizer (normalizarRuc) under the same 8–11
 * digit rule the import domain enforces. Server errors surface through
 * useCrearEmpresa (409 → friendly RUC duplicado, others verbatim) and
 * keep the form open. Success navigates to the created empresa's
 * detail page — the pipeline's natural next step.
 */

/** 8–11 digits after normalization (validarImportacion's PATRON_RUC rule — module-private there). */
const PATRON_RUC = /^\d{8,11}$/;

export interface ErroresFormulario {
  razonSocial?: string;
  ruc?: string;
  tipo?: string;
  encargado?: string;
  correos?: string;
}

/** Pure — required-field validation with Spanish messages (submit-time). */
export function validarFormularioEmpresa(estado: FormularioEmpresaState): ErroresFormulario {
  const errores: ErroresFormulario = {};
  if (estado.razonSocial.trim() === '') {
    errores.razonSocial = 'La razón social es obligatoria.';
  }
  const ruc = estado.ruc.trim();
  if (ruc === '') {
    errores.ruc = 'El RUC es obligatorio.';
  } else if (!PATRON_RUC.test(normalizarRuc(ruc))) {
    errores.ruc = 'RUC inválido: debe tener entre 8 y 11 dígitos (solo números).';
  }
  if (estado.tipo === '') {
    errores.tipo = 'Selecciona el tipo de empresa.';
  }
  if (estado.encargado.trim() === '') {
    errores.encargado = 'El nombre del encargado es obligatorio.';
  }
  if (partirCorreosFormulario(estado.correos).length === 0) {
    errores.correos = 'Indica al menos un correo (separa varios con ";").';
  }
  return errores;
}

const ESTADO_INICIAL: FormularioEmpresaState = {
  razonSocial: '',
  ruc: '',
  tipo: '',
  origen: '',
  proyectoObra: '',
  destinoComun: '',
  notas: '',
  encargado: '',
  correos: '',
  telefono: '',
  principal: true,
};

const inputClase =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500';
const labelClase = 'mb-1 block text-sm font-medium text-slate-700';
const errorClase = 'mt-1 text-xs font-medium text-red-600';

function CampoTexto(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  opcional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={props.id} className={labelClase}>
        {props.label}
        {props.opcional ? (
          <span className="font-normal text-slate-400"> (opcional)</span>
        ) : (
          <span aria-hidden className="text-red-500">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        id={props.id}
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        aria-invalid={props.error ? true : undefined}
        className={inputClase}
      />
      {props.error && (
        <p role="alert" className={errorClase}>
          {props.error}
        </p>
      )}
    </div>
  );
}

export function FormularioNuevaEmpresa() {
  const router = useRouter();
  const { crear, enCurso } = useCrearEmpresa();
  const [estado, setEstado] = useState<FormularioEmpresaState>(ESTADO_INICIAL);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  function actualizar<K extends keyof FormularioEmpresaState>(campo: K, valor: FormularioEmpresaState[K]): void {
    setEstado((previo) => ({ ...previo, [campo]: valor }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const hallazgos = validarFormularioEmpresa(estado);
    if (Object.keys(hallazgos).length > 0) {
      setErrores(hallazgos);
      return;
    }
    setErrores({});
    setErrorServidor(null);
    const resultado = await crear(buildCrearEmpresaInput(estado));
    if (resultado.ok) {
      const { id } = resultado.empresa as Empresa;
      router.push(`/crm/empresas/${id}`);
    } else {
      setErrorServidor(resultado.error);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <legend className="px-2 text-sm font-semibold text-slate-800">Datos de la empresa</legend>

        <CampoTexto
          id="razon-social"
          label="Empresa (razón social)"
          value={estado.razonSocial}
          onChange={(v) => actualizar('razonSocial', v)}
          error={errores.razonSocial}
          placeholder="Constructora X S.A.C."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="ruc"
            label="RUC"
            value={estado.ruc}
            onChange={(v) => actualizar('ruc', v)}
            error={errores.ruc}
            placeholder="900123456"
          />
          <div>
            <span className={labelClase} id="tipo-label">
              Tipo
              <span aria-hidden className="text-red-500">
                {' '}
                *
              </span>
            </span>
            <div role="radiogroup" aria-labelledby="tipo-label" className="mt-1 flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="tipo"
                  value="Cliente"
                  checked={estado.tipo === 'Cliente'}
                  onChange={() => actualizar('tipo', 'Cliente')}
                  aria-invalid={errores.tipo ? true : undefined}
                />
                Cliente
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="tipo"
                  value="Prospecto"
                  checked={estado.tipo === 'Prospecto'}
                  onChange={() => actualizar('tipo', 'Prospecto')}
                  aria-invalid={errores.tipo ? true : undefined}
                />
                Prospecto
              </label>
            </div>
            {errores.tipo && (
              <p role="alert" className={errorClase}>
                {errores.tipo}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="origen" className={labelClase}>
              Origen
            </label>
            <select
              id="origen"
              value={estado.origen}
              onChange={(e) => actualizar('origen', e.target.value as FormularioEmpresaState['origen'])}
              className={inputClase}
            >
              <option value="">Sin clasificar</option>
              <option value="Inbound">Inbound</option>
              <option value="Outbound">Outbound</option>
            </select>
          </div>
          <CampoTexto
            id="destino-comun"
            label="Destino común"
            value={estado.destinoComun}
            onChange={(v) => actualizar('destinoComun', v)}
            opcional
          />
        </div>

        <CampoTexto
          id="proyecto-obra"
          label="Proyecto / Obra"
          value={estado.proyectoObra}
          onChange={(v) => actualizar('proyectoObra', v)}
          opcional
        />

        <div>
          <label htmlFor="notas" className={labelClase}>
            Notas <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            id="notas"
            value={estado.notas}
            onChange={(e) => actualizar('notas', e.target.value)}
            rows={3}
            className={inputClase}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <legend className="px-2 text-sm font-semibold text-slate-800">Primer contacto</legend>

        <CampoTexto
          id="encargado"
          label="Encargado"
          value={estado.encargado}
          onChange={(v) => actualizar('encargado', v)}
          error={errores.encargado}
          placeholder="Ana Pérez"
        />

        <CampoTexto
          id="correos"
          label="Correos"
          value={estado.correos}
          onChange={(v) => actualizar('correos', v)}
          error={errores.correos}
          placeholder="ana@empresa.com; ventas@empresa.com"
        />
        <p className="-mt-2 text-xs text-slate-400">
          Separa varias direcciones con &quot;;&quot;.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="telefono"
            label="Teléfono"
            value={estado.telefono}
            onChange={(v) => actualizar('telefono', v)}
            opcional
          />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                id="principal"
                type="checkbox"
                checked={estado.principal}
                onChange={(e) => actualizar('principal', e.target.checked)}
              />
              Es el contacto principal
            </label>
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-400">
          El primer contacto registrado será el contacto principal de la empresa.
        </p>
      </fieldset>

      {errorServidor !== null && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {errorServidor}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/crm"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={enCurso}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Registrar empresa
        </button>
      </div>
    </form>
  );
}
