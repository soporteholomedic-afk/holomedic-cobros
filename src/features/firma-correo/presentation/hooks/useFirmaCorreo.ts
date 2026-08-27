'use client';

import { useEffect, useState } from 'react';

/** Lifecycle of the own-signature fetch (mount-time GET). */
export type FirmaCorreoStatus = 'loading' | 'ready' | 'error';

export interface UseFirmaCorreoResult {
  /**
   * Server-composed signature HTML (GET /api/plantillas/firma →
   * `firmaHtml`). Empty string when the user has no saved signature OR
   * the fetch failed — the send-path token resolver owns the
   * `[Falta configurar firma]` fallback; never duplicated here.
   */
  firmaHtml: string;
  status: FirmaCorreoStatus;
}

/** Shape guard for the GET /api/plantillas/firma success body. */
interface FirmaCorreoApiBody {
  success: true;
  firmaHtml: string;
}

function isFirmaCorreoApiBody(body: unknown): body is FirmaCorreoApiBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { success?: unknown }).success === true &&
    typeof (body as { firmaHtml?: unknown }).firmaHtml === 'string'
  );
}

/**
 * Fetch the logged-in user's server-composed signature once on mount
 * (editor-firmas task 4.1). Composers consume `firmaHtml` as
 * `ctx.firma` for token interpolation; any failure degrades to an empty
 * firma so the resolver's fallback markup applies.
 */
export function useFirmaCorreo(): UseFirmaCorreoResult {
  const [firmaHtml, setFirmaHtml] = useState('');
  const [status, setStatus] = useState<FirmaCorreoStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/plantillas/firma');
        const body: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok || !isFirmaCorreoApiBody(body)) {
          setFirmaHtml('');
          setStatus('error');
          return;
        }
        setFirmaHtml(body.firmaHtml);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setFirmaHtml('');
        setStatus('error');
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { firmaHtml, status };
}
