import type { TokenAttrs } from '../../domain/entities';
import { encodeToken } from './tokenSerializer';
import { extractPlaceholders } from './extractPlaceholders';

/**
 * A subject-line segment: a plain text run or a token chip. The
 * discriminator is `type` (`'text'` vs `'token'`).
 *
 * The subject is a single line — it does NOT use BlockNote block structure
 * (design Decision d). Segments render inline: `<span>` for text,
 * `TokenChip` for tokens.
 */
export type SubjectSegment =
  | { type: 'text'; value: string }
  | { type: 'token'; attrs: TokenAttrs };

/**
 * Parse a subject string into ordered `SubjectSegment[]`.
 *
 * Walks the string with `extractPlaceholders` (the shared regex scanner),
 * reshapes each segment to the subject's `{type, value|attrs}` shape, and
 * COLLAPSES empty text segments — a single line doesn't need the body's
 * "token at a text-node boundary" fidelity, so `{{empresa}}` parses to a
 * single token segment (not `[emptyText, token, emptyText]`).
 *
 * Spec `email-template-editor` / "Subject round-trip": empty text segments
 * are collapsed AND `serializeSubject(splitIntoSegments(s)) === s`.
 *
 * Pure: no side effects, no React, no BlockNote.
 */
export function splitIntoSegments(subject: string): SubjectSegment[] {
  const raw = extractPlaceholders(subject);
  const segments: SubjectSegment[] = [];
  for (const seg of raw) {
    if ('token' in seg) {
      segments.push({ type: 'token', attrs: seg.token });
    } else {
      // Collapse empty text segments — they contribute nothing to the
      // serialized string, so dropping them keeps the segment list tight
      // without breaking the round-trip.
      if (seg.text.length > 0) {
        segments.push({ type: 'text', value: seg.text });
      }
    }
  }
  return segments;
}

/**
 * Serialize `SubjectSegment[]` back into the `{{token}}` Mustache string —
 * the inverse of `splitIntoSegments`.
 *
 * Text segments are concatenated verbatim; token segments are encoded via
 * `encodeToken` (so column order is preserved for table tokens). The result
 * is the same Mustache format the body uses, so a saved subject round-trips
 * through the editor load pipeline identically.
 *
 * Pure: no side effects.
 */
export function serializeSubject(segments: SubjectSegment[]): string {
  return segments
    .map((seg) => (seg.type === 'token' ? encodeToken(seg.attrs) : seg.value))
    .join('');
}
