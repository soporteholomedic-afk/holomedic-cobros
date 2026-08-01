import { describe, it, expect } from 'vitest';
import { parseOptionalNumber } from '../parseOptionalNumber';

describe('parseOptionalNumber', () => {
  it.each([
    ['', null],
    [' ', null],
    ['abc', null],
    [null, null],
    ['12', 12],
    [' 7 ', 7],
  ])('parseOptionalNumber(%j) returns %j', (input, expected) => {
    expect(parseOptionalNumber(input)).toBe(expected);
  });
});
