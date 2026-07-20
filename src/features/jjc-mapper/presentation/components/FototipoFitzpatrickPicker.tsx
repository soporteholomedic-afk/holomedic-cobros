'use client';

import type { Fototipo } from '@/types/jjc';
import { FOTOTIPO_VALUES } from '@/features/jjc-mapper/domain/entities';

interface FototipoFitzpatrickPickerProps {
  value: Fototipo | null;
  onChange: (value: Fototipo) => void;
}

const FOTOTIPO_LABELS: Record<Fototipo, string> = {
  'I-II': 'Tipo I – II',
  'III-IV': 'Tipo III – IV',
  'V-VI': 'Tipo V – VI',
};

const FOTOTIPO_DESCRIPTIONS: Record<Fototipo, string> = {
  'I-II': 'Piel clara, siempre se quema',
  'III-IV': 'Piel morena clara, se quema poco',
  'V-VI': 'Piel oscura, casi nunca se quema',
};

/**
 * Three selectable Fitzpatrick phototype cards.
 * Acts as a `role="radiogroup"` with `aria-checked` on each card.
 */
export function FototipoFitzpatrickPicker({
  value,
  onChange,
}: FototipoFitzpatrickPickerProps) {
  return (
    <div role="radiogroup" aria-label="Fototipo de Fitzpatrick" className="flex gap-3">
      {FOTOTIPO_VALUES.map((f) => {
        const isSelected = value === f;
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(f)}
            className={`flex-1 rounded-xl border-2 p-3 text-left transition-all duration-200 ${
              isSelected
                ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-200'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="block text-sm font-bold text-slate-800">
              {FOTOTIPO_LABELS[f]}
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">
              {FOTOTIPO_DESCRIPTIONS[f]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
