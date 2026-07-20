import { describe, it, expect } from 'vitest';
import { createLesionPoint, parseFototipo, FOTOTIPO_VALUES } from '../entities';
import type { LesionType } from '@/types/jjc';

describe('createLesionPoint', () => {
  it('creates a point with coordinates clamped to [0, 1]', () => {
    const point = createLesionPoint('p1', 'P', 0.5, 0.3);
    expect(point).toEqual({ id: 'p1', type: 'P', x: 0.5, y: 0.3 });
  });

  it('clamps x > 1 to 1', () => {
    const point = createLesionPoint('p1', 'L', 1.5, 0.5);
    expect(point!.x).toBe(1);
    expect(point!.y).toBe(0.5);
  });

  it('clamps y > 1 to 1', () => {
    const point = createLesionPoint('p1', 'M', 0.5, 2.0);
    expect(point!.x).toBe(0.5);
    expect(point!.y).toBe(1);
  });

  it('returns null for NaN coordinates', () => {
    expect(createLesionPoint('p1', 'C', NaN, 0.5)).toBeNull();
    expect(createLesionPoint('p1', 'C', 0.5, NaN)).toBeNull();
  });

  it('returns null for negative coordinates', () => {
    expect(createLesionPoint('p1', 'P', -0.1, 0.5)).toBeNull();
    expect(createLesionPoint('p1', 'P', 0.5, -0.1)).toBeNull();
  });

  it('accepts all four lesion types', () => {
    const types: LesionType[] = ['P', 'L', 'M', 'C'];
    for (const t of types) {
      const point = createLesionPoint(`p-${t}`, t, 0.5, 0.5);
      expect(point?.type).toBe(t);
    }
  });

  it('accepts exact boundary 0', () => {
    const point = createLesionPoint('p1', 'P', 0, 0);
    expect(point).toEqual({ id: 'p1', type: 'P', x: 0, y: 0 });
  });

  it('accepts exact boundary 1', () => {
    const point = createLesionPoint('p1', 'L', 1, 1);
    expect(point).toEqual({ id: 'p1', type: 'L', x: 1, y: 1 });
  });
});

describe('parseFototipo', () => {
  it('parses "I-II"', () => {
    expect(parseFototipo('I-II')).toBe('I-II');
  });

  it('parses "III-IV"', () => {
    expect(parseFototipo('III-IV')).toBe('III-IV');
  });

  it('parses "V-VI"', () => {
    expect(parseFototipo('V-VI')).toBe('V-VI');
  });

  it('returns null for invalid values', () => {
    expect(parseFototipo('I')).toBeNull();
    expect(parseFototipo('')).toBeNull();
    expect(parseFototipo('VII-VIII')).toBeNull();
  });
});

describe('FOTOTIPO_VALUES', () => {
  it('contains exactly 3 values', () => {
    expect(FOTOTIPO_VALUES).toHaveLength(3);
    expect(FOTOTIPO_VALUES).toContain('I-II');
    expect(FOTOTIPO_VALUES).toContain('III-IV');
    expect(FOTOTIPO_VALUES).toContain('V-VI');
  });
});
