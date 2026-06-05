'use client';

import { useState, useCallback } from 'react';
import type { EmailAttachment } from '../../domain/entities';

export interface UseSendResultsArgs {
  to: string[];
  subject: string;
  html: string;
  attachments: EmailAttachment[];
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
      const response = await fetch('/api/consolidados/send-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: args.to,
          subject: args.subject,
          html: args.html,
          attachments: args.attachments,
        }),
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
  }, [args.to, args.subject, args.html, args.attachments]);

  return {
    send,
    isSending,
    result,
    error,
  };
}
