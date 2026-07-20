import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  children: ReactNode;
  /** Optional: render an error message below the field */
  error?: string;
}

/**
 * Reusable form-field wrapper following the project's text-xs uppercase
 * label convention. Used throughout the JJC evaluacion form.
 */
export function FormField({ label, children, error }: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-rose-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
