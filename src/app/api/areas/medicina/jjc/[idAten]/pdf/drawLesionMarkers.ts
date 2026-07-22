import type { PDFPage, PDFFont } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { LesionPoint } from '@/types/jjc';
import { LESION_FILL } from '@/features/jjc-mapper/domain/lesionStyles';
import { SVG_TO_PDF_SCALE, svgToPdfPoint } from './faceBox';

const MARKER_RADIUS = 4.2 * SVG_TO_PDF_SCALE;
const MARKER_SIZE = MARKER_RADIUS * 2;
const TEXT_SIZE = 6 * SVG_TO_PDF_SCALE;
const TEXT_COLOR = rgb(0.06, 0.09, 0.16);

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: Number.parseInt(h.slice(0, 2), 16) / 255,
    g: Number.parseInt(h.slice(2, 4), 16) / 255,
    b: Number.parseInt(h.slice(4, 6), 16) / 255,
  };
}

export interface DrawLesionMarkersParams {
  page: PDFPage;
  points: LesionPoint[];
  font?: PDFFont;
}

export function drawLesionMarkers({ page, points, font }: DrawLesionMarkersParams): void {
  if (points.length === 0) return;

  for (const point of points) {
    const { x, y } = svgToPdfPoint(point);
    const fill = hexToRgb(LESION_FILL[point.type]);
    const border = hexToRgb('#0f172a');

    page.drawCircle({
      x,
      y,
      size: MARKER_SIZE,
      color: rgb(fill.r, fill.g, fill.b),
      borderColor: rgb(border.r, border.g, border.b),
      borderWidth: 0.4,
    });

    if (font) {
      const text = point.type;
      const textWidth = font.widthOfTextAtSize(text, TEXT_SIZE);
      page.drawText(text, {
        x: x - textWidth / 2,
        y: y - TEXT_SIZE * 0.32,
        font,
        size: TEXT_SIZE,
        color: TEXT_COLOR,
      });
    }
  }
}
