import type { LesionType, LesionPoint } from '@/types/jjc';

const FILL: Record<LesionType, string> = { P: '#fdba74', L: '#93c5fd', M: '#86efac', C: '#d8b4fe' };
const STROKE: Record<LesionType, string> = { P: '#f97316', L: '#3b82f6', M: '#22c55e', C: '#a855f7' };
const LABELS: Record<LesionType, string> = { P: 'Pecas', L: 'Lunar', M: 'Mancha', C: 'Cicatriz' };

interface LesionMarkersProps { points: LesionPoint[] }

export function LesionMarkers({ points }: LesionMarkersProps) {
  return (
    <>
      {points.map((p) => {
        const cx = p.x * 100, cy = p.y * 100;
        return (
          <circle
            key={p.id}
            data-point-id={p.id}
            cx={cx} cy={cy} r={3.5}
            fill={FILL[p.type]}
            stroke={STROKE[p.type]}
            strokeWidth={1.5}
            aria-label={`${LABELS[p.type]} en ${Math.round(cx)}%,${Math.round(cy)}%`}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </>
  );
}
