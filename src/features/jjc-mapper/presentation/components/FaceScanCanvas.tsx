'use client';

import Image from 'next/image';
import { useCallback, useRef, type PointerEvent } from 'react';
import type { ActiveTool } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import type { LesionPoint, LesionType } from '@/types/jjc';
import { LesionMarkers } from './LesionMarkers';

let nextId = 1;
function generateId(): string {
  return `lesion-${nextId++}`;
}

interface FaceScanCanvasProps {
  points: LesionPoint[];
  activeTool: ActiveTool;
  onAddPoint: (point: LesionPoint) => void;
  onRemovePoint: (id: string) => void;
}

export function FaceScanCanvas({
  points,
  activeTool,
  onAddPoint,
  onRemovePoint,
}: FaceScanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointerDown = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      if (activeTool !== 'delete') {
        onAddPoint({ id: generateId(), type: activeTool as LesionType, x, y });
      }
    },
    [activeTool, onAddPoint],
  );

  const handleCircleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (activeTool !== 'delete') return;
      const c = (e.target as SVGElement).closest('circle[data-point-id]') as SVGCircleElement | null;
      if (c) onRemovePoint(c.getAttribute('data-point-id')!);
    },
    [activeTool, onRemovePoint],
  );

  return (
    <div className="relative w-full mx-auto">
      <Image
        src="/rostro.png"
        alt="Rostro"
        width={300}
        height={400}
        className="w-full h-auto rounded-xl block select-none"
        draggable={false}
        priority
      />
      <svg
        ref={svgRef}
        viewBox="0 0 300 400"
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onPointerDown={handlePointerDown}
        onClick={handleCircleClick}
      >
        <LesionMarkers points={points} />
      </svg>
    </div>
  );
}
