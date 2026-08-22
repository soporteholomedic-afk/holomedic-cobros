/**
 * useCompanyContact(ruc, razonSocial) — client hook that resolves and
 * persists the memorized `to`/`cc` contact pair for one company key
 * (REQ-01-DIR-01 / REQ-01-DIR-03).
 *
 * Status machine (useSpitches state-machine model, one extra state):
 *   'loading'   — GET /api/cobranza/contactos?ruc= in flight
 *   'populated' — 200 with a stored contact (prefill source)
 *   'empty'     — 200 with `contacto: null` (no record — fields stay empty)
 *   'error'     — non-OK response, unexpected shape or network failure
 *   'skipped'   — `esClaveDirectorioValida` failed: junk keys never hit
 *                 the API at all (design D10 client-side skip; the send
 *                 itself is never blocked).
 *
 * `saveContact(input)` PUTs the idempotent upsert and resolves with the
 * persisted contact, or throws with the API error message so the caller
 * (EmailComposerModal.doSend) can surface the failure and abort the send
 * (REQ-01-DIR-07 persist-before-dispatch).
 *
 * Design contract: fetch-only — the API route is the boundary; no
 * repository is imported here (hexagonal, useSpitches precedent).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { esClaveDirectorioValida, type EmpresaContacto } from '../../domain/entities';

export type CompanyContactStatus = 'loading' | 'populated' | 'empty' | 'error' | 'skipped';

/** PUT body — `updatedBy` is resolved server-side from the JWT session. */
export interface SaveContactPayload {
  ruc: string;
  razonSocial: string;
  emailPrincipal: string;
  emailCopia: string | null;
}

export interface UseCompanyContactResult {
  contacto: EmpresaContacto | null;
  status: CompanyContactStatus;
  error: string | null;
  retry: () => void;
  saveContact: (input: SaveContactPayload) => Promise<EmpresaContacto>;
}

interface ApiSuccess {
  success: true;
  contacto: EmpresaContacto | null;
}

interface ApiError {
  success?: false;
  error?: string;
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

function isApiSuccess(v: unknown): v is ApiSuccess {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.success === true && (obj.contacto === null || isEmpresaContacto(obj.contacto));
}

export function useCompanyContact(ruc: string, razonSocial: string): UseCompanyContactResult {
  const [contacto, setContacto] = useState<EmpresaContacto | null>(null);
  const [status, setStatus] = useState<CompanyContactStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Stable per-effect-call identity; also doubles as the retry counter
  // and invalidates in-flight responses when the key changes.
  const requestIdRef = useRef(0);
  // Track mounted state to avoid setState after unmount (useSpitches
  // precedent — defensive against the strict-mode double-invoke).
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(
    async (isRetry: boolean) => {
      const id = ++requestIdRef.current;
      // Only set `loading` when retrying — the initial fetch already
      // starts in `loading` (the mounting effect sets it explicitly for
      // the skip→valid transition, where the synchronous set is a
      // no-op on the initial mount).
      if (isRetry) {
        setStatus('loading');
      }
      setError(null);

      try {
        const url = `/api/cobranza/contactos?ruc=${encodeURIComponent(ruc.trim())}`;
        const response = await fetch(url, { method: 'GET' });
        // Bail out if a newer request was started while this one was in flight.
        if (id !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (id !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          // Extract once so the typeof guard narrows the const (a cast
          // expression is a new value on every read and never narrows).
          const apiError = (json as ApiError).error;
          const message = typeof apiError === 'string' ? apiError : `HTTP ${response.status}`;
          setStatus('error');
          setError(message);
          setContacto(null);
          return;
        }
        if (!isApiSuccess(json)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setContacto(null);
          return;
        }
        if (json.contacto === null) {
          setStatus('empty');
          setContacto(null);
          return;
        }
        setStatus('populated');
        setContacto(json.contacto);
      } catch (err: unknown) {
        if (id !== requestIdRef.current || !mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Error de red';
        setStatus('error');
        setError(message);
        setContacto(null);
      }
    },
    [ruc],
  );

  // Initial fetch + refetch on (ruc, razonSocial) change.
  useEffect(() => {
    // The setState calls inside this data-fetching effect report the
    // result of the guard/fetch lifecycle — the documented contract of
    // this hook (useSpitches precedent). The alternative would be to
    // inline the entire fetch body here, which would hurt readability.
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    if (!esClaveDirectorioValida(ruc, razonSocial)) {
      // D10 client-side junk-key skip: nothing to memorize, nothing to
      // fetch. Invalidate any in-flight response from a previous key.
      requestIdRef.current += 1;
      setStatus('skipped');
      setContacto(null);
      setError(null);
      return () => {
        mountedRef.current = false;
      };
    }
    // Covers the skip→valid and error→valid prop transitions (no-op on
    // the initial mount, where state is already `loading`).
    setStatus('loading');
    void fetchOnce(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce, ruc, razonSocial]);

  // Retry bumps the request id and re-invokes; junk keys stay skipped.
  const retry = useCallback(() => {
    if (!esClaveDirectorioValida(ruc, razonSocial)) return;
    void fetchOnce(true);
  }, [fetchOnce, ruc, razonSocial]);

  const saveContact = useCallback(async (input: SaveContactPayload): Promise<EmpresaContacto> => {
    const response = await fetch('/api/cobranza/contactos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof (json as ApiError).error === 'string'
          ? (json as ApiError).error
          : `HTTP ${response.status}`;
      throw new Error(message);
    }
    if (!isApiSuccess(json) || json.contacto === null) {
      throw new Error('Respuesta inesperada del servidor');
    }
    return json.contacto;
    // Deliberately NOT caught: the caller decides how to surface a
    // persist failure (DIR-07 — error surfaced, send aborted).
  }, []);

  return { contacto, status, error, retry, saveContact };
}
