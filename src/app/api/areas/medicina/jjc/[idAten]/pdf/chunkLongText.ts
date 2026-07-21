/**
 * Splits text into chunks at word boundaries within a per-chunk character budget.
 *
 * - Each chunk is trimmed of trailing whitespace.
 * - If a chunk would end mid-word, the break is at the last whitespace within budget.
 * - If no whitespace exists within budget (or it's at position 0), the chunk is forced at budget.
 * - Empty chunks after trimming are omitted.
 */
export function chunkLongText(input: string, budget: number): string[] {
  if (!input) return [];

  const chunks: string[] = [];
  let remaining = input;

  while (remaining.length > 0) {
    if (remaining.length <= budget) {
      const trimmed = remaining.trimEnd();
      if (trimmed) chunks.push(trimmed);
      break;
    }

    // Take the first `budget` characters
    const slice = remaining.slice(0, budget);

    // Find the last whitespace within the slice (excluding position 0)
    let splitAt = -1;
    for (let i = slice.length - 1; i >= 0; i--) {
      if (slice[i] === ' ' || slice[i] === '\t' || slice[i] === '\n' || slice[i] === '\r') {
        splitAt = i;
        break;
      }
    }

    if (splitAt > 0) {
      // Break at word boundary
      const chunk = slice.slice(0, splitAt).trimEnd();
      if (chunk) chunks.push(chunk);
      remaining = remaining.slice(splitAt + 1);
    } else {
      // No suitable whitespace — force split at budget
      const chunk = slice.trimEnd();
      if (chunk) chunks.push(chunk);
      remaining = remaining.slice(budget);
    }
  }

  return chunks;
}
