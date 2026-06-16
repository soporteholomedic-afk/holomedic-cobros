import { describe, it, expect } from 'vitest';
import { MockCompanyRepo } from '../companyRepo';
import { MockPatientRepo } from '../patientRepo';
import { MockSpitchRepo } from '../spitchRepo';

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

describe('MockSpitchRepo', () => {
  const repo = new MockSpitchRepo();

  it('should return 6 company spitches', async () => {
    const spitches = await repo.getByType('company');
    expect(spitches).toHaveLength(6);
    spitches.forEach((s) => expect(s.type).toBe('company'));
  });

  it('should return 13 patient spitches', async () => {
    const spitches = await repo.getByType('patient');
    expect(spitches).toHaveLength(13);
    spitches.forEach((s) => expect(s.type).toBe('patient'));
  });

  it('should return empty array for unknown type', async () => {
    const spitches = await repo.getByType('unknown' as any);
    expect(spitches).toHaveLength(0);
  });

  it('each spitch should have valid HTML body', async () => {
    const spitches = await repo.getByType('company');
    for (const s of spitches) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.subject).toBeTruthy();
      expect(s.bodyHtml).toContain('<!DOCTYPE html>');
      expect(s.bodyHtml).toContain('</html>');
    }
  });
});
