import type { LesionType, LesionPoint, Fototipo, Fotoprotector } from '@/types/jjc';

/**
 * Create a `LesionPoint` with coordinates clamped to [0, 1].
 * Returns `null` when coordinates are NaN or negative (outright invalid).
 */
export function createLesionPoint(
  id: string,
  type: LesionType,
  x: number,
  y: number,
): LesionPoint | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0) return null;
  return { id, type, x: Math.min(x, 1), y: Math.min(y, 1) };
}

/** Accepted Fototipo values (validated subset). */
export const FOTOTIPO_VALUES: readonly Fototipo[] = ['I-II', 'III-IV', 'V-VI'] as const;

/** Accepted Fotoprotector values. */
export const FOTOPROTECTOR_VALUES: readonly Fotoprotector[] = [
  'FPS recomendado +90',
  'FPS recomendado +65',
  'FPS recomendado +50',
] as const;

export const FOTOPROTECTOR_POR_FOTOTIPO: Record<Fototipo, Fotoprotector> = {
  'I-II': 'FPS recomendado +90',
  'III-IV': 'FPS recomendado +65',
  'V-VI': 'FPS recomendado +50',
};

/** Parse a string into a Fototipo; returns `null` for invalid values. */
export function parseFototipo(value: string): Fototipo | null {
  if ((FOTOTIPO_VALUES as readonly string[]).includes(value)) {
    return value as Fototipo;
  }
  return null;
}

/** Parse a string into a Fotoprotector; returns `null` for invalid values. */
export function parseFotoprotector(value: string): Fotoprotector | null {
  if ((FOTOPROTECTOR_VALUES as readonly string[]).includes(value)) {
    return value as Fotoprotector;
  }
  return null;
}
