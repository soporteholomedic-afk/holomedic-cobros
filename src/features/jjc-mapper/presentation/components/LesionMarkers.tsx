import type { LesionPoint } from '@/types/jjc';
import { LESION_FILL, LESION_LABEL } from '@/features/jjc-mapper/domain/lesionStyles';

interface LesionMarkersProps { points: LesionPoint[] }

export function LesionMarkers({ points }: LesionMarkersProps) {
  return (
    <>
      {points.map((p) => {
        const cx = p.x * 422, cy = p.y * 279;
        return (
          <g key={p.id}>
            <circle
              data-point-id={p.id}
              cx={cx} cy={cy} r={4.2}
              fill={LESION_FILL[p.type]}
              aria-label={`${LESION_LABEL[p.type]} en ${Math.round(cx)},${Math.round(cy)}`}
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
