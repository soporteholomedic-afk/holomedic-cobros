'use client';

import Image from 'next/image';
import { useCallback, type KeyboardEvent, type PointerEvent } from 'react';
import type { FigureAreaMark } from '@/types/entrevista-osteomuscular';

export interface ContainedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rectángulo que ocupa una imagen con `object-contain` dentro de una caja:
 * conserva la proporción y centra la imagen en el espacio sobrante
 * (bandas de letterbox). Los clics fuera de este rectángulo se ignoran.
 */
export function getContainedRect(
  boxWidth: number,
  boxHeight: number,
  imageWidth: number,
  imageHeight: number,
): ContainedRect {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
}

/** Acota un valor al rango inclusivo 0..1. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function generateMarkId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `marca-${crypto.randomUUID()}`;
  }
  return `marca-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface FigureAreaMarkingProps {
  imageSrc: string;
  imageAlt: string;
  ariaLabel: string;
  /** Dimensiones intrínsecas del asset (px). */
  imageWidth: number;
  imageHeight: number;
  marks: FigureAreaMark[];
  onMarksChange: (marks: FigureAreaMark[]) => void;
  className?: string;
  sizes?: string;
}

/** Radio (en píxeles de imagen) del área táctil de cada X. */
const MARK_HIT_RADIUS = 10;
const X_HALF_LENGTH = 5;

export function FigureAreaMarking({
  imageSrc,
  imageAlt,
  ariaLabel,
  imageWidth,
  imageHeight,
  marks,
  onMarksChange,
  className,
  sizes = '150px',
}: FigureAreaMarkingProps) {
  const removeMark = useCallback(
    (id: string) => {
      onMarksChange(marks.filter((mark) => mark.id !== id));
    },
    [marks, onMarksChange],
  );

  const addMark = useCallback(
    (x: number, y: number) => {
      onMarksChange([...marks, { id: generateMarkId(), x, y }]);
    },
    [marks, onMarksChange],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!event.isPrimary) return;

      // Clic sobre una X existente: se remueve solo esa marca.
      const markElement = (event.target as Element).closest?.('[data-mark-id]');
      if (markElement) {
        const id = markElement.getAttribute('data-mark-id');
        if (id) removeMark(id);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const contained = getContainedRect(rect.width, rect.height, imageWidth, imageHeight);
      if (contained.width <= 0 || contained.height <= 0) return;

      const pointX = event.clientX - rect.left;
      const pointY = event.clientY - rect.top;

      // Clics en las bandas de letterbox: se ignoran.
      if (
        pointX < contained.x ||
        pointX > contained.x + contained.width ||
        pointY < contained.y ||
        pointY > contained.y + contained.height
      ) {
        return;
      }

      addMark(
        clamp01((pointX - contained.x) / contained.width),
        clamp01((pointY - contained.y) / contained.height),
      );
    },
    [addMark, removeMark, imageWidth, imageHeight],
  );

  const handleMarkKeyDown = useCallback(
    (event: KeyboardEvent<SVGGElement>, id: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        removeMark(id);
      }
    },
    [removeMark],
  );

  return (
    <div className={`relative ${className ?? ''}`}>
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        className="object-contain"
        sizes={sizes}
      />
      {/*
        viewBox con las dimensiones intrínsecas: el espacio de coordenadas del
        SVG coincide exactamente con el plano de la imagen (mismo letterbox que
        object-contain), por lo que las marcas normalizadas 0..1 se traducen
        directo a cx/cy y sobreviven cualquier cambio de tamaño de la caja.
      */}
      <svg
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
      >
        {marks.map((mark, index) => (
          <g
            key={mark.id}
            data-mark-id={mark.id}
            role="button"
            tabIndex={0}
            aria-label={`Eliminar marca ${index + 1} en ${imageAlt}`}
            onKeyDown={(e) => handleMarkKeyDown(e, mark.id)}
          >
            <circle cx={mark.x * imageWidth} cy={mark.y * imageHeight} r={MARK_HIT_RADIUS} fill="transparent" />
            <line
              x1={mark.x * imageWidth - X_HALF_LENGTH}
              y1={mark.y * imageHeight - X_HALF_LENGTH}
              x2={mark.x * imageWidth + X_HALF_LENGTH}
              y2={mark.y * imageHeight + X_HALF_LENGTH}
              stroke="#cc0000"
              strokeWidth={2}
            />
            <line
              x1={mark.x * imageWidth + X_HALF_LENGTH}
              y1={mark.y * imageHeight - X_HALF_LENGTH}
              x2={mark.x * imageWidth - X_HALF_LENGTH}
              y2={mark.y * imageHeight + X_HALF_LENGTH}
              stroke="#cc0000"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
