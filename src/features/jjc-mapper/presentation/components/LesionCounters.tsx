import type { LesionType } from '@/types/jjc';

interface LesionCountersProps {
  counters: Record<LesionType, number>;
}

const LESION_LABELS: Record<LesionType, string> = {
  P: 'Pecas',
  L: 'Lunar',
  M: 'Mancha',
  C: 'Cicatriz',
  O: 'Otras',
};

const COUNT_COLORS: Record<LesionType, string> = {
  P: 'bg-orange-100 text-orange-700 border-orange-200',
  L: 'bg-blue-100 text-blue-700 border-blue-200',
  M: 'bg-green-100 text-green-700 border-green-200',
  C: 'bg-purple-100 text-purple-700 border-purple-200',
  O: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

/**
 * Counter badge per lesion type, derived from `counters` (memoized
 * upstream via `useMemo`). Displays the count and type label.
 */
export function LesionCounters({ counters }: LesionCountersProps) {
  const types = Object.keys(counters) as LesionType[];

  return (
    <div className="flex flex-wrap gap-2">
      {types.map((type) => (
        <div
          key={type}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${COUNT_COLORS[type]}`}
        >
          <span>{LESION_LABELS[type]}</span>
          <span className="tabular-nums">{counters[type]}</span>
        </div>
      ))}
    </div>
  );
}
