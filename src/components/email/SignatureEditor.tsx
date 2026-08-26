'use client';

import type { SignatureEditorProps } from './types';

/**
 * Structured signature editor: generic labeled fields backed by a
 * plain values record. Domain field definitions and signature
 * building stay feature-side; this component only edits values.
 */
export function SignatureEditor<K extends string = string>({
  fields,
  values,
  onChange,
}: SignatureEditorProps<K>) {
  return (
    <div
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3"
      data-testid="signature-editor"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Firma
      </h4>
      {fields.map(({ key, label }) => (
        <div key={key} className="space-y-0.5">
          <label
            htmlFor={`signature-field-${key}`}
            className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
          >
            {label}
          </label>
          <input
            id={`signature-field-${key}`}
            type="text"
            value={values[key] ?? ''}
            onChange={(e) => onChange(key, e.target.value)}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900 outline-none transition-colors"
          />
        </div>
      ))}
    </div>
  );
}
