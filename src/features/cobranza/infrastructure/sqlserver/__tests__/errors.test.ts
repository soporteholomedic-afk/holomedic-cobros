import { describe, expect, it } from 'vitest';

import { ContactConflictError, isUniqueViolation } from '../errors';

/**
 * Unit tests for the SQL Server contact adapter's error surface
 * (T1a.4). `isUniqueViolation` mirrors the sqlServerTemplateRepository
 * pattern: mssql errors carry a numeric `number` where 2601 (duplicate
 * key row) and 2627 (UNIQUE constraint violation) are the two unique-
 * index signals. The repository maps them to `ContactConflictError`
 * so the route can answer 409 instead of leaking a raw DB error.
 */
describe('isUniqueViolation', () => {
  it('recognizes error number 2601 (duplicate key row)', () => {
    const err = Object.assign(new Error('Duplicate key'), { number: 2601 });
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('recognizes error number 2627 (UNIQUE constraint violation)', () => {
    const err = Object.assign(new Error('Violation of PRIMARY KEY constraint'), { number: 2627 });
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('rejects other mssql error numbers', () => {
    const err = Object.assign(new Error('Login failed'), { number: 18456 });
    expect(isUniqueViolation(err)).toBe(false);
  });

  it('rejects plain Error objects without a number', () => {
    expect(isUniqueViolation(new Error('no number here'))).toBe(false);
  });

  it('rejects non-object values defensively', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('2627')).toBe(false);
    expect(isUniqueViolation(2627)).toBe(false);
  });

  it('rejects objects whose number is a non-numeric type', () => {
    expect(isUniqueViolation({ number: '2627' })).toBe(false);
    expect(isUniqueViolation({ number: null })).toBe(false);
  });
});

describe('ContactConflictError', () => {
  it('carries the CONFLICT_ERROR code for the route 409 mapping', () => {
    const err = new ContactConflictError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ContactConflictError');
    expect(err.code).toBe('CONFLICT_ERROR');
    expect(err.message).toBe(
      'El contacto fue creado concurrentemente; reintentá la operación',
    );
  });

  it('accepts a custom message', () => {
    const err = new ContactConflictError('custom');
    expect(err.message).toBe('custom');
    expect(err.code).toBe('CONFLICT_ERROR');
  });
});
