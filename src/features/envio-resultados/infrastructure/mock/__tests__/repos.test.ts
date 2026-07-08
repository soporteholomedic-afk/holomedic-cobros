import { describe, it, expect } from 'vitest';
import { MockCompanyRepo } from '../companyRepo';
import { MockPatientRepo } from '../patientRepo';

// PR 4 — `MockSpitchRepo` was removed. The send flow now obtains
// spitches from `/api/plantillas` (the SQLite-backed plantillas-editor
// store). Per spec scenario REMOVED "MockSpitchRepo hardcoded templates",
// the 19 hardcoded spitches are NOT migrated — the store starts empty
// and the user creates templates via the editor.

describe('MockCompanyRepo', () => {
  const repo = new MockCompanyRepo();

  it('should return 3 companies', async () => {
    const companies = await repo.getAll();
    expect(companies).toHaveLength(3);
  });

  it('each company should have required fields', async () => {
    const companies = await repo.getAll();
    for (const c of companies) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.ruc).toMatch(/^\d{11}$/);
      expect(c.email).toMatch(/@/);
    }
  });
});

describe('MockPatientRepo', () => {
  const repo = new MockPatientRepo();

  it('should return patients filtered by company ID', async () => {
    const sanPablo = await repo.getByCompanyId('comp-001');
    expect(sanPablo.length).toBeGreaterThanOrEqual(3);

    const lab = await repo.getByCompanyId('comp-002');
    expect(lab.length).toBeGreaterThanOrEqual(2);

    const diag = await repo.getByCompanyId('comp-003');
    expect(diag.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty array for unknown company', async () => {
    const result = await repo.getByCompanyId('comp-unknown');
    expect(result).toHaveLength(0);
  });

  it('each patient should have valid fields', async () => {
    const patients = await repo.getByCompanyId('comp-001');
    for (const p of patients) {
      expect(p.id).toBeTruthy();
      expect(p.companyId).toBe('comp-001');
      expect(p.dni).toMatch(/^\d{8}$/);
      expect(Array.isArray(p.files)).toBe(true);
    }
  });

  it('each patient file should have valid fields', async () => {
    const patients = await repo.getByCompanyId('comp-001');
    for (const p of patients) {
      for (const f of p.files) {
        expect(f.id).toBeTruthy();
        expect(f.patientId).toBe(p.id);
        expect(f.name).toMatch(/\.pdf$/i);
        expect(f.type).toBe('application/pdf');
        expect(f.size).toBeGreaterThan(0);
      }
    }
  });
});
