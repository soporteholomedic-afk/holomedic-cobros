'use client';

import type { FormEvent } from 'react';

import type { CampoFirma, FirmaCorreo } from '../../domain/entities';
import { composeSignatureHtml } from '../../domain/composeSignatureHtml';
import { resolveLogoCid } from '../helpers/resolveLogoCid';
import { useFirmaForm } from '../hooks/useFirmaForm';

export interface FirmaFormProps {
  /** Server-resolved start values: the stored signature, or the user-record prefill (task 3.1). */
  initialFirma: FirmaCorreo;
}

interface CampoDef {
  campo: CampoFirma;
  label: string;
  type: string;
  hint?: string;
}

/** The five signature fields, in editing order (spec "Signature Editing").
 *  Display label says "Móvil"; the storage key stays `telefono`
 *  (codec/storage compatibility — do NOT rename the key). */
const CAMPOS: readonly CampoDef[] = [
  { campo: 'nombre', label: 'Nombre', type: 'text' },
  { campo: 'area', label: 'Área', type: 'text' },
  { campo: 'correo', label: 'Correo', type: 'email' },
  { campo: 'telefono', label: 'Móvil', type: 'text', hint: 'Opcional' },
  { campo: 'anexo', label: 'Anexo', type: 'text', hint: 'Opcional' },
];

/**
 * The "Mi firma" editor (editor-firmas task 3.6). Pure renderer: state
 * + submit orchestration live in `useFirmaForm`, persistence in
 * `saveFirmaApi`. The live preview renders `composeSignatureHtml` —
 * the SAME pure function the send path composes with, so preview and
 * delivered body are byte-identical (design D4) — after
 * `resolveLogoCid` swaps the logo `cid:` for the public path
 * (DISPLAY ONLY: browsers cannot resolve smtp Content-IDs; the stored
 * and sent html keep the cid). Rendering it via
 * `dangerouslySetInnerHTML` is SAFE: the composer HTML-escapes every
 * user value and emits only fixed structural markup.
 */
export function FirmaForm({ initialFirma }: FirmaFormProps) {
  const { values, setField, errors, status, errorMessage, submit } = useFirmaForm(initialFirma);
  const previewHtml = resolveLogoCid(composeSignatureHtml(values));

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  // noValidate: the DOMAIN validation owns the error UX (per-field
  // messages from validateFirmaCorreo); native email/type tooltips
  // would otherwise preempt the submit event and split the two.
  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi firma</h1>
        <p className="mt-1 text-sm text-slate-500">
          Esta firma se incluirá automáticamente en los correos de cobranza y consolidados.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {CAMPOS.map(({ campo, label, type, hint }) => (
          <div key={campo}>
            <label htmlFor={`firma-${campo}`} className="block text-sm font-medium text-slate-700">
              {label}
              {hint && <span className="ml-1 font-normal text-slate-400">({hint})</span>}
            </label>
            <input
              id={`firma-${campo}`}
              type={type}
              value={values[campo]}
              onChange={(event) => setField(campo, event.target.value)}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ${
                errors[campo] ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {errors[campo] && (
              <p className="mt-1 text-xs text-red-600">{errors[campo]}</p>
            )}
          </div>
        ))}
      </div>

      {status === 'success' && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Firma guardada correctamente.
        </p>
      )}
      {status === 'error' && errorMessage && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'saving' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Vista previa</h2>
        <div
          data-testid="firma-preview"
          className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </form>
  );
}
