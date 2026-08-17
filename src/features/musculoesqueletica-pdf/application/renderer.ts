import { TemplateError } from '../domain/errors';
import type {
  PdfTokenKind,
  PdfTokenManifest,
  PdfTokenSpec,
  PdfSourceData,
} from '../domain/entities';

const TOKEN_PATTERN = /\{\{([A-Za-z]+):([A-Za-z0-9_.-]+)\}\}/g;
const KNOWN_KINDS: ReadonlySet<string> = new Set(['text', 'check', 'figure', 'image']);

/** Red X marker half-length (px in image space), matching the form. */
const X_HALF_LENGTH = 5;

/** Clamp a value to the inclusive 0..1 range. */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** HTML-escape the five characters that are significant inside text nodes. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/**
 * Resolve a dot path against a source object, touching only OWN properties.
 * Returns `undefined` for prototype members, missing segments, null
 * intermediates, or primitives.
 */
export function resolvePath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, segment)) {
      return undefined;
    }
    current = record[segment];
  }
  return current;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function checkMark(value: unknown, match: string | undefined): string {
  if (match !== undefined) {
    return value !== null && value !== undefined && String(value) === match ? 'checked' : '';
  }
  return value === true ? 'checked' : '';
}

/**
 * Extract a normalized mark list from a source value. Accepts an array of
 * `{x,y}` objects (or a single object). Non-array / null / empty resolve to
 * `[]`. Individual marks with non-finite coordinates are skipped.
 */
function toMarks(value: unknown): Array<{ x: number; y: number }> {
  if (value === null || value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  const marks: Array<{ x: number; y: number }> = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const x = record.x;
    const y = record.y;
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    marks.push({ x: clamp01(x), y: clamp01(y) });
  }
  return marks;
}

/** Build the absolutely-positioned SVG overlay drawing the red X marks. */
function renderMarksOverlay(
  marks: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number,
): string {
  const lines = marks
    .map((mark) => {
      const cx = mark.x * imageWidth;
      const cy = mark.y * imageHeight;
      return [
        `<line x1="${cx - X_HALF_LENGTH}" y1="${cy - X_HALF_LENGTH}" x2="${cx + X_HALF_LENGTH}" y2="${cy + X_HALF_LENGTH}" stroke="#cc0000" stroke-width="2"/>`,
        `<line x1="${cx + X_HALF_LENGTH}" y1="${cy - X_HALF_LENGTH}" x2="${cx - X_HALF_LENGTH}" y2="${cy + X_HALF_LENGTH}" stroke="#cc0000" stroke-width="2"/>`,
      ].join('');
    })
    .join('');
  return (
    `<svg viewBox="0 0 ${imageWidth} ${imageHeight}" preserveAspectRatio="xMidYMid meet" ` +
    `style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none">${lines}</svg>`
  );
}

function resolveToken(
  kind: PdfTokenKind,
  spec: PdfTokenSpec,
  source: PdfSourceData,
  resolveImage: (assetPath: string) => string | null,
): string {
  switch (kind) {
    case 'text':
      return escapeHtml(toText(resolvePath(source, spec.path)));
    case 'check':
      return checkMark(resolvePath(source, spec.path), spec.match);
    case 'figure':
    case 'image': {
      const dataUri = resolveImage(spec.path);
      if (dataUri === null) return '';
      const figure = `<img src="${dataUri}" alt=""${kind === 'figure' ? ' data-figure' : ''}>`;
      // Marks overlay applies to `figure` tokens only.
      if (kind !== 'figure' || !spec.marks || !spec.imageWidth || !spec.imageHeight) {
        return figure;
      }
      const marks = toMarks(resolvePath(source, spec.marks));
      if (marks.length === 0) return figure;
      return `<div style="position:relative">${figure}${renderMarksOverlay(
        marks,
        spec.imageWidth,
        spec.imageHeight,
      )}</div>`;
    }
  }
}

/**
 * Substitute every `{{kind:path}}` token in the template.
 *
 * - `text` resolves a dot path in `source`, HTML-escapes it, and treats
 *   null/undefined as empty.
 * - `check` renders the deterministic `checked` attribute (boolean true, or a
 *   manifest `match` comparison).
 * - `figure`/`image` resolve an asset path through `resolveImage` to a data
 *   URI; unresolvable assets render blank.
 *
 * Malformed tokens (unknown kind or missing manifest entry) throw
 * `TemplateError` so failures are explicit, never silently printed.
 */
export function renderTemplate(
  template: string,
  manifest: PdfTokenManifest,
  source: PdfSourceData,
  resolveImage: (assetPath: string) => string | null = () => null,
): string {
  return template.replace(TOKEN_PATTERN, (_full, kind: string, tokenName: string) => {
    if (!KNOWN_KINDS.has(kind)) {
      throw new TemplateError(`Unknown PDF token kind "${kind}"`);
    }
    const spec = manifest[tokenName];
    if (!spec) {
      throw new TemplateError(`PDF token "${tokenName}" is not declared in the page manifest`);
    }
    return resolveToken(spec.kind, spec, source, resolveImage);
  });
}