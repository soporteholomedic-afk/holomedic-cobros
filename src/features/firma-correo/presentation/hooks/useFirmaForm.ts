'use client';

import { useState } from 'react';

import type { CampoFirma, FirmaCorreo } from '../../domain/entities';
import { validateFirmaCorreo } from '../../domain/validation';
import { saveFirmaApi } from '../helpers/saveFirmaApi';

/** Lifecycle of one save attempt (drives the form's feedback banner). */
export type FirmaFormStatus = 'idle' | 'saving' | 'success' | 'error';

export interface UseFirmaFormResult {
  values: FirmaCorreo;
  setField: (campo: CampoFirma, value: string) => void;
  errors: Partial<Record<CampoFirma, string>>;
  status: FirmaFormStatus;
  errorMessage: string | null;
  submit: () => Promise<void>;
}

/**
 * State + submit orchestration for the "Mi firma" form (editor-firmas
 * task 3.4) — the component stays a renderer; this hook owns the
 * business flow:
 *
 *  1. `submit` validates client-side with the SAME domain rules the
 *     server applies (`validateFirmaCorreo` — one validation module,
 *     design D8). Invalid → per-field errors and NO network call.
 *  2. Valid → persistence is delegated to `saveFirmaApi` (no raw
 *     fetch here). A server 400 (source of truth) maps its `fields`
 *     back onto the form; a transport failure only raises the banner.
 */
export function useFirmaForm(initial: FirmaCorreo): UseFirmaFormResult {
  const [values, setValues] = useState<FirmaCorreo>(initial);
  const [errors, setErrors] = useState<Partial<Record<CampoFirma, string>>>({});
  const [status, setStatus] = useState<FirmaFormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setField = (campo: CampoFirma, value: string): void => {
    setValues((prev) => ({ ...prev, [campo]: value }));
  };

  const submit = async (): Promise<void> => {
    const validation = validateFirmaCorreo(values);
    if (!validation.ok) {
      setErrors(validation.fields);
      setStatus('idle');
      setErrorMessage(null);
      return;
    }

    setErrors({});
    setErrorMessage(null);
    setStatus('saving');

    const result = await saveFirmaApi(values);
    if (result.ok) {
      setStatus('success');
      return;
    }

    setErrors(result.fields ?? {});
    setErrorMessage(result.error);
    setStatus('error');
  };

  return { values, setField, errors, status, errorMessage, submit };
}
