'use client';

import { useState, useCallback } from 'react';
import type { SelectedFileRef } from '../../domain/entities';

export interface UseSendResultsArgs {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  /**
   * PR #3 — Spec REQ-1 wire contract.
   *
   * The hook sends a single `fileRefs` JSON field on the FormData. The
   * route (PR #2) resolves each ref via `IFileRepository.read(ruc, dni,
   * idAten, path, name)` and attaches the real PDF bytes. The legacy
   * `files` `File`-part is rejected with `VALIDATION_ERROR` (400).
   *
   * Replaces the prior `files: PatientFile[]` argument; the hook no
   * longer constructs any `Blob`. `PatientFile` is still computed
   * inside `EmailEditor` for the `AttachmentList` display surface
   * (parallel lists: `selectedFiles` for display, `fileRefs` for send).
   */
  fileRefs: SelectedFileRef[];
}

export interface UseSendResultsReturn {
  send: () => Promise<void>;
  isSending: boolean;
  result: { success: boolean; messageId?: string } | null;
  error: string | null;
}

export function useSendResults(args: UseSendResultsArgs): UseSendResultsReturn {
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; messageId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    setIsSending(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('to', args.to.join(','));
      if (args.cc && args.cc.length > 0) {
        formData.append('cc', args.cc.join(','));
      }
      formData.append('subject', args.subject);
      formData.append('html', args.html);
      // PR #3 — Spec REQ-1: send the location triple + relative path
      // + name as JSON. The route resolves each ref against the UNC
      // share via `IFileRepository.read`. No bytes are constructed on
      // the client — the prior fake-blob loop is removed.
      formData.append('fileRefs', JSON.stringify(args.fileRefs));

      const response = await fetch('/api/consolidados/send-results', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult({ success: true, messageId: data.messageId });
      } else {
        setError(data.error || 'Error al enviar el correo');
        setResult({ success: false });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión al enviar el correo');
    } finally {
      setIsSending(false);
    }
  }, [args.to, args.cc, args.subject, args.html, args.fileRefs]);

  return {
    send,
    isSending,
    result,
    error,
  };
}
