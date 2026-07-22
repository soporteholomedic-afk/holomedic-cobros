import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { LesionPoint } from '@/types/jjc';
import { drawLesionMarkers } from '../drawLesionMarkers';

// Minimal setup: create a PDF page that mimics the template's A4 landscape
let pdfDoc: PDFDocument;
let page: ReturnType<PDFDocument['addPage']>;

beforeAll(async () => {
  pdfDoc = await PDFDocument.create();
  page = pdfDoc.addPage([595.44, 841.92]);
});

describe('drawLesionMarkers', () => {
  it('does nothing when points array is empty', () => {
    expect(() => drawLesionMarkers({ page, points: [] })).not.toThrow();
  });

  it('draws a single marker in face region without errors', () => {
    const points: LesionPoint[] = [
      { id: 'p1', type: 'L', x: 0.3, y: 0.5 },
    ];
    expect(() => drawLesionMarkers({ page, points })).not.toThrow();
  });

  it('draws four markers of different types including ears without errors', () => {
    const points: LesionPoint[] = [
      { id: 'p1', type: 'L', x: 0.3, y: 0.5 },   // face
      { id: 'p2', type: 'P', x: 0.6, y: 0.3 },   // face
      { id: 'p3', type: 'M', x: 0.05, y: 0.7 },  // left ear
      { id: 'p4', type: 'C', x: 0.95, y: 0.4 },  // right ear
    ];
    expect(() => drawLesionMarkers({ page, points })).not.toThrow();
  });

  it('draws markers without font (falls back to no text)', () => {
    const points: LesionPoint[] = [
      { id: 'p1', type: 'L', x: 0.5, y: 0.5 },
    ];
    expect(() => drawLesionMarkers({ page, points })).not.toThrow();
  });

  it('produces a valid PDF after drawing', async () => {
    const doc = await PDFDocument.create();
    const pg = doc.addPage([595.44, 841.92]);

    const points: LesionPoint[] = [
      { id: 'p1', type: 'C', x: 0.25, y: 0.5 },
      { id: 'p2', type: 'L', x: 0.75, y: 0.6 },
    ];
    drawLesionMarkers({ page: pg, points });

    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(100);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('draws markers in all three regions (face, left ear, right ear) without errors', () => {
    const points: LesionPoint[] = [
      { id: 'p_face', type: 'L', x: 0.5, y: 0.5 },
      { id: 'p_ear_l', type: 'P', x: 0.03, y: 0.45 },
      { id: 'p_ear_r', type: 'M', x: 0.92, y: 0.55 },
    ];
    expect(() => drawLesionMarkers({ page, points })).not.toThrow();
  });
});
