'use client';

import { sanitizeEmailHtml } from './sanitizeEmailHtml';
import { resolveLogoCid } from '@/features/firma-correo/presentation/helpers/resolveLogoCid';
import type { EmailBodyFieldProps } from './types';

/**
 * Body field of the email controls panel: a read-only sanitized
 * preview with an "Editar" toggle that swaps in the consumer-injected
 * WYSIWYG editor element and signature composition. Controlled — the
 * consumer owns the editing state and the body html.
 */
export function EmailBodyField({
  html,
  isEditing,
  onEditingChange,
  editorSlot,
  signatureSlot,
  emptyHint,
}: EmailBodyFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Cuerpo del correo
      </label>

      {isEditing ? (
        <div className="space-y-3">
          {editorSlot}
          {signatureSlot}
          <button
            onClick={() => onEditingChange(false)}
            className="text-sm font-medium text-sky-600 hover:text-sky-700 cursor-pointer transition-colors"
          >
            Hecho
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          {html ? (
            <>
              <div
                className="p-4 text-sm text-slate-700 dark:text-slate-200 prose prose-sm dark:prose-invert max-w-none"
                data-testid="body-preview"
                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(resolveLogoCid(html)) }}
              />
              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
                <button
                  onClick={() => onEditingChange(true)}
                  className="text-xs font-medium text-sky-600 hover:text-sky-700 cursor-pointer flex items-center gap-1 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Editar
                </button>
              </div>
            </>
          ) : (
            <p className="p-4 text-sm text-slate-400 dark:text-slate-500 italic">
              {emptyHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
