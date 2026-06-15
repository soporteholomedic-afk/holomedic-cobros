import { describe, it, expect } from 'vitest';
import { createFileNode } from '@/features/envio-resultados/domain/file-system/FileNode';
import type { UnifiedPerson, UnifiedFicha } from '@/types/sp-result';
import { emailViewDataFromFiles, type EmailViewData } from '../emailViewDataFromFiles';

/**
 * Unit tests for the `emailViewDataFromFiles` bridge helper.
 *
 * The helper is the pure seam between the file-tree selection inside
 * `FilesModal` and the `EmailEditor` consumer rendered by
 * `WorkerDetailTable`. Every contract here is locked by the spec
 * (file-selection-and-send-handoff, Domain 4) and the design
 * (seleccion-archivos-envio, §"emailViewDataFromFiles.ts").
 *
 * These tests describe the contract; the production code must make
 * them pass without changing the assertions.
 */

const DNI = '12345678';
const NOMBRE = 'Juan Pérez';

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: DNI,
    nombre: NOMBRE,
    empresa: 'Holomedic S.A.',
    tipoExamen: 'Preocupacional',
    proyecto: 'OE-001',
    condic: 'APTO',
    fichas: [],
    ...overrides,
  };
}

function makeFicha(overrides: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten: 'AT-001',
    nroRuc: '20123456789',
    nomCFa: 'Holomedic S.A.',
    proyecto: 'OE-001',
    tipoExamen: 'Preocupacional',
    condic: 'APTO',
    ...overrides,
  };
}

describe('emailViewDataFromFiles (bridge helper)', () => {
  it('builds a single Patient with files synthesized from the selection', () => {
    const person = makePerson();
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const fileB = createFileNode({ name: 'b.pdf', sizeBytes: 200, modifiedAt: '2026-06-01T00:00:00.000Z' });

    const result: EmailViewData = emailViewDataFromFiles(
      person,
      ficha,
      [fileA, fileB],
      ['::a.pdf', '::b.pdf'],
      'uuid-company-1',
    );

    expect(result.patients).toHaveLength(1);
    expect(result.patients[0]?.id).toBe(DNI);
    expect(result.patients[0]?.dni).toBe(DNI);
    expect(result.patients[0]?.name).toBe(NOMBRE);
    expect(result.patients[0]?.files).toHaveLength(2);
  });

  it('PatientFile.id matches the fileRef passed in (no re-synthesis)', () => {
    const person = makePerson();
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const fileB = createFileNode({ name: 'b.pdf', sizeBytes: 200, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const refs = ['subdir::a.pdf', 'subdir::b.pdf'];

    const result = emailViewDataFromFiles(person, ficha, [fileA, fileB], refs, 'uuid-company-1');

    expect(result.patients[0]?.files[0]?.id).toBe('subdir::a.pdf');
    expect(result.patients[0]?.files[1]?.id).toBe('subdir::b.pdf');
    // Critically: the id is NOT regenerated as `${folderPath}::${name}`.
    // The caller controls the id; the helper must pass it through.
    expect(result.patients[0]?.files[0]?.id).not.toBe('::a.pdf');
    expect(result.patients[0]?.files[1]?.id).not.toBe('::b.pdf');
  });

  it("PatientFile.type is always 'application/pdf'", () => {
    const person = makePerson();
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const fileB = createFileNode({ name: 'subdir::b.pdf', sizeBytes: 200, modifiedAt: '2026-06-01T00:00:00.000Z' });

    const result = emailViewDataFromFiles(person, ficha, [fileA, fileB], ['::a.pdf', 'subdir::b.pdf'], 'uuid-company-1');

    expect(result.patients[0]?.files.every((f) => f.type === 'application/pdf')).toBe(true);
    expect(result.patients[0]?.files[0]?.type).toBe('application/pdf');
    expect(result.patients[0]?.files[1]?.type).toBe('application/pdf');
  });

  it('PatientFile.size is FileNode.sizeBytes verbatim', () => {
    const person = makePerson();
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 1024, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const fileB = createFileNode({ name: 'b.pdf', sizeBytes: 987_654_321, modifiedAt: '2026-06-01T00:00:00.000Z' });

    const result = emailViewDataFromFiles(person, ficha, [fileA, fileB], ['::a.pdf', '::b.pdf'], 'uuid-company-1');

    expect(result.patients[0]?.files[0]?.size).toBe(1024);
    expect(result.patients[0]?.files[1]?.size).toBe(987_654_321);
  });

  it('companyId is passed through unchanged', () => {
    const person = makePerson();
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' });

    const result = emailViewDataFromFiles(person, ficha, [fileA], ['::a.pdf'], 'uuid-company-1');

    expect(result.companyId).toBe('uuid-company-1');
  });

  it('selectedPatients is keyed by person.dni and contains patientName plus the refs', () => {
    const person = makePerson({ dni: '87654321', nombre: 'María García' });
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const fileB = createFileNode({ name: 'b.pdf', sizeBytes: 200, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const refs = ['LEGAJOS::a.pdf', 'EXAMENES::b.pdf'];

    const result = emailViewDataFromFiles(person, ficha, [fileA, fileB], refs, 'uuid-company-1');

    expect(Object.keys(result.selectedPatients)).toEqual(['87654321']);
    expect(result.selectedPatients['87654321']?.patientName).toBe('María García');
    expect(result.selectedPatients['87654321']?.files).toEqual(['LEGAJOS::a.pdf', 'EXAMENES::b.pdf']);
  });

  it('throws when selected.length !== refs.length (parallel-array contract)', () => {
    const person = makePerson();
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' });
    const fileB = createFileNode({ name: 'b.pdf', sizeBytes: 200, modifiedAt: '2026-06-01T00:00:00.000Z' });

    // refs has 1 entry but selected has 2 files → contract violation
    expect(() =>
      emailViewDataFromFiles(person, ficha, [fileA, fileB], ['::a.pdf'], 'uuid-company-1'),
    ).toThrow(/parallel|length/i);
  });

  it('uses an empty companyId when the company name does not match (degraded path)', () => {
    const person = makePerson();
    const ficha = makeFicha();
    const fileA = createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' });

    // Empty companyId → degraded path: helper must not throw and must
    // reflect the empty value verbatim in the output.
    const result = emailViewDataFromFiles(person, ficha, [fileA], ['::a.pdf'], '');

    expect(result.companyId).toBe('');
    expect(result.patients[0]?.companyId).toBe('');
  });
});
