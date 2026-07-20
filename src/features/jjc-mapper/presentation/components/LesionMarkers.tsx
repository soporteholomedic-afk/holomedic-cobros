import type { LesionType, LesionPoint } from '@/types/jjc';

const FILL: Record<LesionType, string> = { P: '#fdba74', L: '#93c5fd', M: '#86efac', C: '#d8b4fe' };
const LABELS: Record<LesionType, string> = { P: 'Pecas', L: 'Lunar', M: 'Mancha', C: 'Cicatriz' };

interface LesionMarkersProps { points: LesionPoint[] }

export function LesionMarkers({ points }: LesionMarkersProps) {
  return (
    <>
      {points.map((p) => {
        const cx = p.x * 300, cy = p.y * 400;
        return (
          <g key={p.id}>
            <circle
              data-point-id={p.id}
              cx={cx} cy={cy} r={4.2}
              fill={FILL[p.type]}
              aria-label={`${LABELS[p.type]} en ${Math.round(cx)},${Math.round(cy)}`}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
            />
            <text
              x={cx} y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={6}
              fontWeight="bold"
              fill="#0f172a"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {p.type}
            </text>
          </g>
        );
      })}
    </>
  );
}
