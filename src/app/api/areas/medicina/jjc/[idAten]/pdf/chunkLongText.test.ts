import { describe, it, expect } from 'vitest';
import { chunkLongText } from './chunkLongText';

describe('chunkLongText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkLongText('', 10)).toEqual([]);
  });

  it('returns one chunk when input fits within budget', () => {
    const result = chunkLongText('Hello World', 50);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello World');
  });

  it('returns one chunk at exact boundary', () => {
    const result = chunkLongText('12345', 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('12345');
  });

  it('splits beyond boundary at last whitespace in budget', () => {
    // "hello world foo" at budget 9
    // first 9 chars: "hello wor" → last whitespace is at pos 5
    // chunk 1: "hello", remaining: " world foo"
    const result = chunkLongText('hello world foo', 9);
    expect(result[0]).toBe('hello');
    expect(result[1]).toBe('world foo');
  });

  it('splits mid-word when no whitespace in budget window', () => {
    // "abcdefghij" budget 5, no whitespace → force split at 5
    const result = chunkLongText('abcdefghij', 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('abcde');
    expect(result[1]).toBe('fghij');
  });

  it('preserves leading whitespace when window starts with space and no word boundary found', () => {
    // "abcde fghij" budget 5
    // chunk 1: "abcde" (first 5, no whitespace)
    // chunk 2: " fghi" (window " fghi", whitespace at pos 0 → can't break there, force at 5)
    // chunk 3: "j" (remaining ≤ budget)
    const result = chunkLongText('abcde fghij', 5);
    expect(result).toEqual(['abcde', ' fghi', 'j']);
  });

  it('trims trailing whitespace from each chunk', () => {
    // "hello world   " budget 7
    // chunk 1: "hello" (break at space at pos 5)
    // remaining: "world   "
    // chunk 2: "world" (window "world  ", last whitespace at pos 6)
    // remaining: " " → trimmed → "" → skip
    // Result: ["hello", "world"]
    const result = chunkLongText('hello world   ', 7);
    expect(result).toEqual(['hello', 'world']);
    // No trailing spaces on any chunk
    for (const chunk of result) {
      expect(chunk).toBe(chunk.trimEnd());
    }
  });

  it('produces multiple chunks for long input, each within budget', () => {
    const input = 'Lorem ipsum dolor sit amet consectetur adipiscing elit';
    const budget = 15;
    const result = chunkLongText(input, budget);

    // Each chunk must be <= budget and have no trailing space
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(budget);
      expect(chunk).toBe(chunk.trimEnd());
    }

    // Multiple chunks
    expect(result.length).toBeGreaterThan(1);

    // All content preserved (reconstructed with spaces)
    const all = result.join(' ').replace(/\s+/g, ' ').trim();
    expect(all).toBe(input);
  });

  it('handles input shorter than budget', () => {
    const result = chunkLongText('Hi', 100);
    expect(result).toEqual(['Hi']);
  });

  it('handles single character budget', () => {
    const result = chunkLongText('ab c', 1);
    // budget 1: 'a' → no whitespace, chunk 'a'
    // remaining 'b c': 'b' → no whitespace, chunk 'b'
    // remaining ' c': ' ' → last whitespace pos 0, force take budget=1, chunk ' ' → trim→ ''
    // Actually, trimmed to '' — skip
    // remaining 'c': 'c' → chunk 'c'
    expect(result).toEqual(['a', 'b', 'c']);
  });
});
