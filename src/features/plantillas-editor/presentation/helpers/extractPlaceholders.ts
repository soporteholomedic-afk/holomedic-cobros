import type { TokenAttrs } from '../../domain/entities';
import { parseTokenPlaceholder } from './tokenParser';

/**
 * A segment produced by `extractPlaceholders`: either a plain text run or a
 * parsed token. The discriminator is the property name (`text` vs `token`).
 */
export type PlaceholderSegment =
  | { text: string }
  | { token: TokenAttrs };

/**
 * Regex matching a single `{{...}}` placeholder. The inner capture is
 * `[^}]+` (one or more non-`}` chars) so an empty `{{}}` does NOT match and
 * a malformed `{{empresa` (no closing) does NOT match — both stay as text.
 *
 * Global so `String.prototype.matchAll` walks every placeholder in order.
 */
const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

/**
 * Split a string into an ordered list of text segments and token segments.
 *
 * Walks `text` with `/\{\{([^}]+)\}\}/g`; for each match:
 *  - the text BEFORE the match is emitted as a `{ text }` segment,
 *  - the matched placeholder is parsed via `parseTokenPlaceholder`:
 *    - non-null → emitted as a `{ token }` segment,
 *    - null (matched but invalid, e.g. `{{tabla:docs}}` wrong colon count)
 *      → the matched string is emitted as a `{ text }` segment (degrade to
 *        plain text, never drop).
 * After the last match, the trailing text is emitted as a final `{ text }`
 * segment.
 *
 * Empty text segments are NOT collapsed here — that is `splitIntoSegments`'s
 * job (task 3.4). This keeps the body-load pipeline flexible: the BlockNote
 * post-processor may want to know that a token was at the very start/end of
 * a text node even when the surrounding text is empty.
 *
 * Pure: no side effects. Round-trip-tested in task 3.5.
 */
export function extractPlaceholders(text: string): PlaceholderSegment[] {
  const segments: PlaceholderSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const matched = match[0];
    const innerStart = match.index ?? 0;

    // Text before the match (may be empty — we keep it as a segment).
    if (innerStart > lastIndex) {
      segments.push({ text: text.slice(lastIndex, innerStart) });
    } else {
      segments.push({ text: '' });
    }

    const attrs = parseTokenPlaceholder(matched);
    if (attrs !== null) {
      segments.push({ token: attrs });
    } else {
      // Matched `{{...}}` but parse rejected it — degrade to plain text so
      // the round-trip preserves the bytes verbatim.
      segments.push({ text: matched });
    }

    lastIndex = innerStart + matched.length;
  }

  // Trailing text after the last match (may be empty).
  segments.push({ text: text.slice(lastIndex) });

  return segments;
}
