import type { LesionPoint } from '@/types/jjc';

/**
 * Bounding box of the face image (Im1) in `public/PLANTILLA_JJC_MEDICINA.pdf`
 * in PDF user-space units (points, origin at bottom-left).
 *
 * Source: the header artifact content stream has
 *   `197.7 0 0 278.75 197.8 347.77 cm /Im1 Do`
 * which renders the image with lower-left corner at (197.8, 347.77),
 * width = 197.7 pt, height = 278.75 pt.
 *
 * If the template is edited and this box changes, the integration test
 * `faceBox.template.test.ts` must fail and force an update here.
 */
export const FACE_BOX = {
  x: 197.8,
  y: 347.77,
  w: 197.7,
  h: 278.75,
} as const;

/**
 * Left ear image (Im2) in `public/PLANTILLA_JJC_MEDICINA.pdf`.
 *
 * Source: content stream `. 50.85 0 0 73.8 79.65 447.72 cm /Im2 Do`.
 */
export const LEFT_EAR_BOX = {
  x: 79.65,
  y: 447.72,
  w: 50.85,
  h: 73.8,
} as const;

/**
 * Right ear image (Im3) in `public/PLANTILLA_JJC_MEDICINA.pdf`.
 *
 * Source: content stream `. 51.45 0 0 74.65 450.4 447.72 cm /Im3 Do`.
 */
export const RIGHT_EAR_BOX = {
  x: 450.4,
  y: 447.72,
  w: 51.45,
  h: 74.65,
} as const;

/**
 * Single SVG viewBox that encompasses all three region images (face + ears)
 * and matches the PDF layout proportions.
 *
 * Derived from the combined bounding box of Im1, Im2, Im3 in the template:
 *   x range [LEFT_EAR_BOX.x, RIGHT_EAR_BOX.x + RIGHT_EAR_BOX.w] ≈ 422.2 pt
 *   y range [FACE_BOX.y, FACE_BOX.y + FACE_BOX.h]          = 278.75 pt
 */
export const COMPOSITE_VIEWBOX = { w: 422, h: 279 } as const;

/**
 * Bands that partition the composite viewBox horizontally.
 *
 * A point's SVG x coordinate (point.x × COMPOSITE_VIEWBOX.w) determines
 * which region it falls in. Band boundaries match the visual layout
 * of the original rostro.png (1.9–15.6% ears, 26.3–73.8% face, 84.5–98.2% ear)
 * rather than the absolute PDF coordinates, so the UI and PDF mapping
 * remain aligned around the same visual boundaries.
 *
 *   - [LEFT_EAR_BAND_START, LEFT_EAR_BAND_END)   → left ear   → LEFT_EAR_BOX
 *   - [FACE_BAND_START, FACE_BAND_END)           → face       → FACE_BOX
 *   - [RIGHT_EAR_BAND_START, RIGHT_EAR_BAND_END) → right ear  → RIGHT_EAR_BOX
 *
 * Gap regions between bands are clamped to the nearest image edge.
 */
export const LEFT_EAR_BAND_START   = 8;    // 1.9 % × 422
export const LEFT_EAR_BAND_END     = 66;   // 15.6 %
export const FACE_BAND_START       = 111;  // 26.3 %
export const FACE_BAND_END         = 311;  // 73.8 %
export const RIGHT_EAR_BAND_START  = 357;  // 84.5 %
export const RIGHT_EAR_BAND_END    = 414;  // 98.2 %

/** Vertical band shared by both ears (same y range in the template). */
export const EAR_Y_START = 0.362; // 36.2 % × 279
export const EAR_Y_END   = 0.641; // 64.1 %

/**
 * Scale factor from the SVG viewBox width to the PDF face-box width.
 * Used to preserve the proportional size of markers when rendering to PDF.
 */
export const SVG_TO_PDF_SCALE = FACE_BOX.w / COMPOSITE_VIEWBOX.w;

interface ImageBox { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
interface PdfPoint { x: number; y: number }

/**
 * Map a normalized SVG point to PDF coordinates within a given PDF box.
 * SVG Y (top-down) is flipped to PDF Y (bottom-up).
 */
function mapToBox(point: LesionPoint, box: ImageBox): PdfPoint {
  return {
    x: box.x + point.x * box.w,
    y: box.y + box.h - point.y * box.h,
  };
}

/**
 * Clamp a value between lo and hi.
 */
function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Convert a normalized SVG lesion point to PDF user-space coordinates.
 *
 * The point's x determines which image region it belongs to:
 *   - SVG x ∈ [LEFT_EAR_BAND_START, LEFT_EAR_BAND_END)   → left ear   (Im2)
 *   - SVG x ∈ [FACE_BAND_START, FACE_BAND_END)           → face       (Im1)
 *   - SVG x ∈ [RIGHT_EAR_BAND_START, RIGHT_EAR_BAND_END) → right ear  (Im3)
 *
 * Within each band the point is normalized to [0,1] and mapped to the
 * corresponding PDF image box. The Y coordinate is flipped to account for
 * SVG top-down vs PDF bottom-up origin.
 *
 * Gap regions between bands are clamped to the nearest image edge.
 */
export function svgToPdfPoint(point: LesionPoint): PdfPoint {
  const svgX = point.x * COMPOSITE_VIEWBOX.w;
  const svgY = clamp(point.y, 0, 1);

  if (svgX < LEFT_EAR_BAND_END) {
    const earW = LEFT_EAR_BAND_END - LEFT_EAR_BAND_START;
    const earH = EAR_Y_END - EAR_Y_START;
    const localX = clamp((svgX - LEFT_EAR_BAND_START) / earW, 0, 1);
    const localY = clamp((svgY - EAR_Y_START) / earH, 0, 1);
    return mapToBox({ ...point, x: localX, y: localY }, LEFT_EAR_BOX);
  }

  if (svgX >= RIGHT_EAR_BAND_START) {
    const earW = RIGHT_EAR_BAND_END - RIGHT_EAR_BAND_START;
    const earH = EAR_Y_END - EAR_Y_START;
    const localX = clamp((svgX - RIGHT_EAR_BAND_START) / earW, 0, 1);
    const localY = clamp((svgY - EAR_Y_START) / earH, 0, 1);
    return mapToBox({ ...point, x: localX, y: localY }, RIGHT_EAR_BOX);
  }

  const faceW = FACE_BAND_END - FACE_BAND_START;
  const localX = clamp((svgX - FACE_BAND_START) / faceW, 0, 1);
  return mapToBox({ ...point, x: localX, y: svgY }, FACE_BOX);
}
