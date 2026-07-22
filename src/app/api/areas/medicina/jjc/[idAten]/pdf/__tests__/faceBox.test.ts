import { describe, it, expect } from 'vitest';
import { svgToPdfPoint, FACE_BOX } from '../faceBox';
import type { LesionPoint } from '@/types/jjc';

function pt(id: string, type: 'L' | 'P' | 'M' | 'C', x: number, y: number): LesionPoint {
  return { id, type, x, y };
}

describe('svgToPdfPoint', () => {
  describe('face region (x center)', () => {
    it('maps face top-left to PDF top of face area', () => {
      const result = svgToPdfPoint(pt('t1', 'L', 0.5, 0));
      expect(result.x).toBeCloseTo(296.65, 2);
      expect(result.y).toBeCloseTo(626.52, 2);
    });

    it('maps face bottom-right to PDF bottom of face area', () => {
      const result = svgToPdfPoint(pt('t2', 'L', 0.5, 1));
      expect(result.x).toBeCloseTo(296.65, 2);
      expect(result.y).toBeCloseTo(347.77, 2);
    });

    it('maps face center to PDF center of face area', () => {
      const result = svgToPdfPoint(pt('t3', 'L', 0.5, 0.5));
      expect(result.x).toBeCloseTo(296.65, 2);
      expect(result.y).toBeCloseTo(487.15, 2);
    });
  });

  describe('left ear region', () => {
    it('maps left-ear center to PDF center of left ear', () => {
      const result = svgToPdfPoint(pt('t4', 'L', 0.08, 0.5));
      expect(result.x).toBeCloseTo(102.23, 2);
      expect(result.y).toBeCloseTo(485.02, 2);
    });

    it('maps left-ear top to PDF top of left ear', () => {
      const result = svgToPdfPoint(pt('t5', 'L', 0.05, 0.38));
      expect(result.x).toBeCloseTo(91.14, 2);
      expect(result.y).toBeCloseTo(516.76, 2);
    });

    it('maps left-ear bottom to PDF bottom of left ear', () => {
      const result = svgToPdfPoint(pt('t6', 'L', 0.05, 0.62));
      expect(result.x).toBeCloseTo(91.14, 2);
      expect(result.y).toBeCloseTo(453.27, 2);
    });
  });

  describe('right ear region', () => {
    it('maps right-ear center to PDF center of right ear', () => {
      const result = svgToPdfPoint(pt('t7', 'L', 0.93, 0.5));
      expect(result.x).toBeCloseTo(482.41, 2);
      expect(result.y).toBeCloseTo(485.45, 2);
    });

    it('maps right-ear top to PDF top of right ear', () => {
      const result = svgToPdfPoint(pt('t8', 'L', 0.95, 0.38));
      expect(result.x).toBeCloseTo(490.03, 2);
      expect(result.y).toBeCloseTo(517.55, 2);
    });
  });

  describe('gap region routing', () => {
    it('clamps left-gap x to face left edge', () => {
      const result = svgToPdfPoint(pt('t9', 'L', 0.2, 0.5));
      expect(result.x).toBeCloseTo(FACE_BOX.x, 2);
    });

    it('clamps right-gap x to face right edge', () => {
      const result = svgToPdfPoint(pt('t10', 'L', 0.8, 0.5));
      expect(result.x).toBeCloseTo(FACE_BOX.x + FACE_BOX.w, 2);
    });
  });
});
