'use client';

import Image from 'next/image';
import { useCallback, useRef, type PointerEvent } from 'react';
import type { ActiveTool } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import type { LesionPoint, LesionType } from '@/types/jjc';
import { LesionMarkers } from './LesionMarkers';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `lesion-${crypto.randomUUID()}`;
  }
  return `lesion-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    <div className="relative w-full mx-auto" style={{ aspectRatio: '422 / 279' }}>
      {/* Left ear: x 1.9%–15.6%, y 36.2%–64.1% */}
      <div
        className="absolute"
        style={{ left: '1.9%', top: '36.2%', width: '13.7%', height: '27.9%' }}
      >
        <Image
          src="/oreja-izquierda.jpg"
          alt="Oreja izquierda"
          fill
          className="object-cover"
          draggable={false}
          sizes="60px"
          priority
        />
      </div>

      {/* Face: x 26.3%–73.8%, y 0%–100% */}
      <div
        className="absolute"
        style={{ left: '26.3%', top: '0%', width: '47.5%', height: '100%' }}
      >
        <Image
          src="/rostro.jpg"
          alt="Rostro"
          fill
          className="object-contain"
          draggable={false}
          sizes="200px"
          priority
        />
      </div>

      {/* Right ear: x 84.5%–98.2%, y 36.2%–64.1% */}
      <div
        className="absolute"
        style={{ left: '84.5%', top: '36.2%', width: '13.7%', height: '27.9%' }}
      >
        <Image
          src="/oreja-derecha.jpg"
          alt="Oreja derecha"
          fill
          className="object-cover"
          draggable={false}
          sizes="60px"
          priority
        />
      </div>

      {/* SVG overlay covering the full composite, matching COMPOSITE_VIEWBOX */}
      <svg
        ref={svgRef}
        viewBox="0 0 422 279"
        preserveAspectRatio="none"
        className="absolute top-0 left-0 w-full h-full cursor-crosshair"
        onPointerDown={handlePointerDown}
        onClick={handleCircleClick}
      >
        <LesionMarkers points={points} />
      </svg>
    </div>
  );
}
