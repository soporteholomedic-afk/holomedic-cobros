'use client';

import { sanitizeEmailHtml } from './sanitizeEmailHtml';
import { resolveLogoCid } from '@/features/firma-correo/presentation/helpers/resolveLogoCid';
import type { EmailPreviewPanelProps } from './types';

/**
 * LEFT panel of the two-panel email composition: subject card,
 * sanitized HTML preview, template footer, and attachment/drop-zone
 * slots. Presentational only — no feature concepts, no I/O.
 *
 * The preview resolves the signature logo's `cid:holomedic-logo` to
 * the public asset path for DISPLAY ONLY (browsers cannot resolve smtp
 * Content-IDs); the html that gets stored/sent keeps the cid.
 */
export function EmailPreviewPanel({
  subject,
  html,
  emptyHint,
  templateName,
  attachmentsSlot,
  dropZoneSlot,
}: EmailPreviewPanelProps) {
  return (
    <div className="space-y-6" data-testid="email-preview-panel">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        {subject && (
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-800">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Asunto
            </div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
              {subject}
            </div>
          </div>
        )}
        <div className="p-6 min-h-[280px]">
          {html ? (
            <div
              data-testid="email-preview"
              className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(resolveLogoCid(html)) }}
            />
          ) : (
            <p className="text-slate-400 dark:text-slate-500 text-sm italic">
              {emptyHint}
            </p>
          )}
        </div>
        {templateName && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Plantilla: <span className="font-medium text-slate-700 dark:text-slate-300">{templateName}</span>
          </div>
        )}
      </div>

      {attachmentsSlot}
      {dropZoneSlot}
    </div>
  );
}
