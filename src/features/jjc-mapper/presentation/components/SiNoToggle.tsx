'use client';

import type { SiNo } from '@/types/jjc';

interface SiNoToggleProps {
  value: SiNo | null;
  onChange: (value: SiNo | null) => void;
}

export function SiNoToggle({ value, onChange }: SiNoToggleProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(value === 'si' ? null : 'si')}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
          value === 'si'
            ? 'border-sky-500 bg-sky-50 text-sky-700'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
        }`}
      >
        Sí
      </button>
      <button
        type="button"
        onClick={() => onChange(value === 'no' ? null : 'no')}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
          value === 'no'
            ? 'border-sky-500 bg-sky-50 text-sky-700'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
        }`}
      >
        No
      </button>
    </div>
  );
}
