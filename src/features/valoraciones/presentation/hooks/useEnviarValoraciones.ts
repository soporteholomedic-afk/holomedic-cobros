'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { EmpresaContacto } from '@/features/cobranza/domain/entities';
import type { ValoracionesFilter } from '../../domain/entities';

/**
 * useEnviarValoraciones (REQ-03 M-R3/M-R4) — client hook behind the
 * valorizaciones email modal.
 *
 * Two independent state machines:
 *
 * 1. Prefill (`/api/valoraciones/contactos?codCli=`, useCompanyContact
 *    model): resolves `Cliente.NroRuc` by the selected client code and the
 *    REQ-01 memorized `to`/`cc` pair. States: 'loading' | 'populated' |
 *    'empty' (directory miss / no RUC) | 'error' | 'skipped' (no client
 *    selected — particulares and clientless queries degrade to manual
 *    entry; the send is never blocked).
 *
 * 2. Dispatch (`POST /api/valoraciones/send`, FormData): posts the filter
 *    DTO + composed email + PDF/Excel attachment flags (the server
 *    regenerates the attachments — no file uploads). States: 'idle' |
 *    'sending' | 'success' | 'error'.
 *
 * Design contract: fetch-only — the API routes are the boundary; no
 * repository imports here (useSpitches/useCompanyContact precedent).
 */

export type PrefillContactoStatus = 'loading' | 'populated' | 'empty' | 'error' | 'skipped';
export type EnvioValoracionesStatus = 'idle' | 'sending' | 'success' | 'error';

export interface EnviarValoracionesPayload {
  filtro: ValoracionesFilter;
  /** Comma-joined recipient list (the route splits + validates). */
  to: string;
  /** Comma-joined cc list; empty string means "no cc". */
  cc: string;
  subject: string;
  html: string;
  adjuntarPdf: boolean;
  adjuntarExcel: boolean;
}

export interface UseEnviarValoracionesResult {
  contacto: EmpresaContacto | null;
  /** The client's RUC (interpolation `{{ruc}}` source), null when unknown. */
  nroRuc: string | null;
  prefillStatus: PrefillContactoStatus;
  prefillError: string | null;
  retryPrefill: () => void;
  envioStatus: EnvioValoracionesStatus;
  envioError: string | null;
  enviar: (payload: EnviarValoracionesPayload) => Promise<boolean>;
}

interface ContactosApiSuccess {
  success: true;
  nroRuc: string | null;
  contacto: EmpresaContacto | null;
}

function isEmpresaContacto(v: unknown): v is EmpresaContacto {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.ruc === 'string' &&
    typeof obj.razonSocial === 'string' &&
    typeof obj.emailPrincipal === 'string' &&
    (obj.emailCopia === null || typeof obj.emailCopia === 'string')
  );
}

function isContactosApiSuccess(v: unknown): v is ContactosApiSuccess {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    (obj.nroRuc === null || typeof obj.nroRuc === 'string') &&
    (obj.contacto === null || isEmpresaContacto(obj.contacto))
  );
}

export function useEnviarValoraciones(codCli: number | undefined): UseEnviarValoracionesResult {
  const [contacto, setContacto] = useState<EmpresaContacto | null>(null);
  const [nroRuc, setNroRuc] = useState<string | null>(null);
  const [prefillStatus, setPrefillStatus] = useState<PrefillContactoStatus>('loading');
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [envioStatus, setEnvioStatus] = useState<EnvioValoracionesStatus>('idle');
  const [envioError, setEnvioError] = useState<string | null>(null);

  // Stable per-effect-call identity; invalidates in-flight responses when
  // the client selection changes (useCompanyContact precedent).
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(
    async (isRetry: boolean) => {
      const id = ++requestIdRef.current;
      // Only set `loading` when retrying — the mounting effect already
      // starts in `loading` (useSpitches precedent).
      if (isRetry) {
        setPrefillStatus('loading');
      }
      setPrefillError(null);

      try {
        const url = `/api/valoraciones/contactos?codCli=${encodeURIComponent(codCli!)}`;
        const response = await fetch(url, { method: 'GET' });
        if (id !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (id !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          const apiError = (json as { error?: unknown }).error;
          setPrefillStatus('error');
          setPrefillError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          setContacto(null);
          return;
        }
        if (!isContactosApiSuccess(json)) {
          setPrefillStatus('error');
          setPrefillError('Respuesta inesperada del servidor');
          setContacto(null);
          return;
        }
        setNroRuc(json.nroRuc);
        if (json.contacto === null) {
          // Directory miss or DNI-keyed particular — manual entry, NOT an
          // error (spec M-R3 "No RUC degrades to manual entry").
          setPrefillStatus('empty');
          setContacto(null);
          return;
        }
        setPrefillStatus('populated');
        setContacto(json.contacto);
      } catch (err: unknown) {
        if (id !== requestIdRef.current || !mountedRef.current) return;
        setPrefillStatus('error');
        setPrefillError(err instanceof Error ? err.message : 'Error de red');
        setContacto(null);
      }
    },
    [codCli],
  );

  useEffect(() => {
    // The setState calls report the result of the fetch lifecycle — the
    // documented contract of this hook (useCompanyContact precedent).
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    if (codCli === undefined) {
      // No client selected: nothing to look up — manual entry, no fetch.
      requestIdRef.current += 1;
      setPrefillStatus('skipped');
      setContacto(null);
      setNroRuc(null);
      setPrefillError(null);
      return () => {
        mountedRef.current = false;
      };
    }
    setPrefillStatus('loading');
    void fetchOnce(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce, codCli]);

  const retryPrefill = useCallback(() => {
    if (codCli === undefined) return;
    void fetchOnce(true);
  }, [fetchOnce, codCli]);

  const enviar = useCallback(async (payload: EnviarValoracionesPayload): Promise<boolean> => {
    setEnvioStatus('sending');
    setEnvioError(null);
    try {
      const body = new FormData();
      body.append('filtro', JSON.stringify(payload.filtro));
      body.append('to', payload.to);
      if (payload.cc.trim() !== '') {
        body.append('cc', payload.cc);
      }
      body.append('subject', payload.subject);
      body.append('html', payload.html);
      body.append('adjuntarPdf', String(payload.adjuntarPdf));
      body.append('adjuntarExcel', String(payload.adjuntarExcel));

      const res = await fetch('/api/valoraciones/send', { method: 'POST', body });
      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const apiError = (json as { error?: unknown }).error;
        setEnvioStatus('error');
        setEnvioError(typeof apiError === 'string' ? apiError : `Error del servidor (${res.status})`);
        return false;
      }
      setEnvioStatus('success');
      return true;
    } catch {
      setEnvioStatus('error');
      setEnvioError('Error de conexión al enviar el correo');
      return false;
    }
  }, []);

  return {
    contacto,
    nroRuc,
    prefillStatus,
    prefillError,
    retryPrefill,
    envioStatus,
    envioError,
    enviar,
  };
}
