/**
 * `useSendCobranzaEmail` — client hook owning ALL cobranza send logic
 * (envio-correos-facturacion, spec "useSendCobranzaEmail Hook": the
 * composer component never calls fetch directly).
 *
 * Contract (design "Send logic placement" + route FormData contract):
 *  - Builds a FormData payload: `to` comma-joined, optional `cc`,
 *    `subject`, `html`, `purpose: 'cobranza'` and the REQ-02 audit
 *    metadata fields, plus repeated `attachments` File parts.
 *  - Persist-before-dispatch (REQ-01-DIR-07): when a directory port is
 *    injected, `save()` is awaited BEFORE the POST; a persist failure
 *    aborts the send (no POST) and surfaces the cause.
 *  - Error mapping: HTTP error → API `error` message (generic fallback),
 *    network failure → 'Error de conexión', persist failure →
 *    'No se pudo guardar el contacto: <cause>'.
 *
 * The directory port is injected so the hook stays unit-testable with a
 * fake (the composer wraps `useCompanyContact.saveContact`, which it
 * already mounts for the prefill — no double fetch).
 */
'use client';

import { useCallback, useState } from 'react';

import type { CobranzaAuditMetadata } from '../../helpers/buildCobranzaAuditMetadata';

/** Persist-before-dispatch boundary implemented by the composer. */
export interface CobranzaDirectoryPort {
  save(): Promise<void>;
}

export interface SendCobranzaEmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments: File[];
  auditMeta: CobranzaAuditMetadata;
  /** When provided, persisted BEFORE any dispatch; failure aborts. */
  directory?: CobranzaDirectoryPort;
}

export interface UseSendCobranzaEmailReturn {
  send: (input: SendCobranzaEmailInput) => Promise<boolean>;
  isSending: boolean;
  error: string | null;
}

const SEND_ENDPOINT = '/api/send-email';

function appendAuditMeta(formData: FormData, auditMeta: CobranzaAuditMetadata): void {
  formData.append('ruc', auditMeta.ruc);
  formData.append('razonSocial', auditMeta.razonSocial);
  // Null moneda/montoReclamado (empty-debt client) are omitted — the
  // route stores NULL server-side for absent fields.
  if (auditMeta.moneda !== null) {
    formData.append('moneda', auditMeta.moneda);
  }
  if (auditMeta.montoReclamado !== null) {
    formData.append('montoReclamado', String(auditMeta.montoReclamado));
  }
  formData.append('comprobantesCount', String(auditMeta.comprobantesCount));
}

export function useSendCobranzaEmail(): UseSendCobranzaEmailReturn {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (input: SendCobranzaEmailInput): Promise<boolean> => {
    setIsSending(true);
    setError(null);
    try {
      if (input.directory) {
        try {
          await input.directory.save();
        } catch (persistError) {
          // Persist failed → surface the error and DO NOT send. The
          // operator can retry once the directory is available.
          const message =
            persistError instanceof Error ? persistError.message : 'error desconocido';
          setError(`No se pudo guardar el contacto: ${message}`);
          return false;
        }
      }

      const formData = new FormData();
      formData.append('to', input.to.join(','));
      if (input.cc && input.cc.length > 0) {
        formData.append('cc', input.cc.join(','));
      }
      formData.append('subject', input.subject);
      formData.append('html', input.html);
      // REQ-01-DIR-08: 'cobranza' is the only purpose this flow emits —
      // the route only audits purpose='cobranza' rows.
      formData.append('purpose', 'cobranza');
      appendAuditMeta(formData, input.auditMeta);
      for (const file of input.attachments) {
        formData.append('attachments', file, file.name);
      }

      // No Content-Type header: the browser sets the multipart boundary.
      const res = await fetch(SEND_ENDPOINT, { method: 'POST', body: formData });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const apiError =
          typeof data === 'object' &&
          data !== null &&
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Error al enviar el correo';
        setError(apiError);
        return false;
      }
      return true;
    } catch {
      // Network error (fetch rejected, server unreachable)
      setError('Error de conexión');
      return false;
    } finally {
      setIsSending(false);
    }
  }, []);

  return { send, isSending, error };
}
