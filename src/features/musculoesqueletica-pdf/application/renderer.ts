import { TemplateError } from '../domain/errors';
import type { PdfTokenKind, PdfTokenManifest, PdfSourceData } from '../domain/entities';

const TOKEN_PATTERN = /\{\{([A-Za-z]+):([A-Za-z0-9_.-]+)\}\}/g;
const KNOWN_KINDS: ReadonlySet<string> = new Set(['text', 'check', 'figure', 'image']);

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

function resolveToken(
  kind: PdfTokenKind,
  specPath: string,
  specMatch: string | undefined,
  source: PdfSourceData,
  resolveImage: (assetPath: string) => string | null,
): string {
  switch (kind) {
    case 'text':
      return escapeHtml(toText(resolvePath(source, specPath)));
    case 'check':
      return checkMark(resolvePath(source, specPath), specMatch);
    case 'figure':
    case 'image': {
      const dataUri = resolveImage(specPath);
      if (dataUri === null) return '';
      return `<img src="${dataUri}" alt=""${kind === 'figure' ? ' data-figure' : ''}>`;
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
    return resolveToken(spec.kind, spec.path, spec.match, source, resolveImage);
  });
}