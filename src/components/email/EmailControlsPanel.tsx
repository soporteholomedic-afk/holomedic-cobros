'use client';

import type { EmailControlsPanelProps } from './types';

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900 outline-none transition-colors';

/**
 * RIGHT panel of the two-panel email composition: recipients, template
 * slot, subject, body slot and the send action. Presentational only —
 * all state and send logic live in the consumer.
 */
export function EmailControlsPanel({
  to,
  onToChange,
  cc,
  onCcChange,
  subject,
  onSubjectChange,
  templateSlot,
  bodySlot,
  onSend,
  sendDisabled,
  sending,
  headerSlot,
}: EmailControlsPanelProps) {
  return (
    <div className="space-y-6" data-testid="email-controls-panel">
      {headerSlot}

      {/* Destinatario (To) */}
      <div className="space-y-1.5">
        <label htmlFor="email-to" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Destinatario
        </label>
        <input
          id="email-to"
          type="text"
          aria-label="Destinatario"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className={INPUT_CLASS}
          placeholder="correo@empresa.com, otro@empresa.com"
        />
      </div>

      {/* CC */}
      <div className="space-y-1.5">
        <label htmlFor="email-cc" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          CC
        </label>
        <input
          id="email-cc"
          type="text"
          aria-label="CC"
          value={cc}
          onChange={(e) => onCcChange(e.target.value)}
          className={INPUT_CLASS}
          placeholder="copia@empresa.com"
        />
      </div>

      {/* Template selector (and any target toggle) — consumer injected */}
      {templateSlot}

      {/* Subject */}
      <div className="space-y-1.5">
        <label htmlFor="email-subject" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Asunto
        </label>
        <input
          id="email-subject"
          type="text"
          aria-label="Asunto"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          className={INPUT_CLASS}
          placeholder="Asunto del correo"
        />
      </div>

      {/* Body editor composition — consumer injected */}
      {bodySlot}

      {/* Send */}
      <button
        onClick={onSend}
        disabled={sendDisabled || sending}
        className="w-full py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {sending && (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        Enviar
      </button>
    </div>
  );
}
