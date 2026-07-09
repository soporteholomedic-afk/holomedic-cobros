/**
 * RED tests for `aggregateDocumentStatuses` (PR 1 of the document-verification-modal
 * change).
 *
 * Acceptance criteria are pulled from the spec scenarios in
 * `sdd/verificacion-documentos-modal/spec`:
 *  - Empty batch → CAMO and EMO both VACIO.
 *  - Single patient CAMO-only → CAMO COMPLETO, EMO VACIO.
 *  - Mixed (at least one with, at least one without) → PARCIAL.
 *  - All-have-both → CAMO and EMO both COMPLETO.
 *  - Multi-ficha patient: OR-merge — patient has CAMO if ANY ficha has it.
 *  - Loading/error entries count as "without" (defensive — they appear between
 *    `checkAll` start and resolve, and a single failed row should not be
 *    silently dropped).
 *
 * The import below references production code that does NOT exist yet → real
 * RED. The GREEN task in 1.2 will introduce the helper and the exported
 * types; these tests then pass.
 */
import { describe, it, expect } from 'vitest';
import type { UnifiedPerson, UnifiedFicha } from '@/types/sp-result';
import type { LegajosRowStatus } from '@/features/envio-resultados/presentation/hooks/useLegajosStatus';
import {
  aggregateDocumentStatuses,
  type DocumentCoverageState,
  type DocumentCoverageSection,
  type AggregatedDocumentStatus,
} from '../aggregateDocumentStatuses';

// ---- Fixture helpers ----

function makeFicha(idAten: string, partial: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten,
    nroRuc: '20123456789',
    nomCFa: 'EMPRESA TEST SAC',
    proyecto: 'PROYECTO X',
    tipoExamen: 'EMO',
    condic: 'APTO',
    fecAte: '01/01/2026',
    ...partial,
  };
}

function makePerson(
  dni: string,
  nombre: string,
  fichas: UnifiedFicha[],
  partial: Partial<UnifiedPerson> = {},
): UnifiedPerson {
  return {
    dni,
    nombre,
    empresa: 'EMPRESA TEST SAC',
    tipoExamen: 'EMO',
    proyecto: 'PROYECTO X',
    condic: 'APTO',
    fichas,
    ...partial,
  };
}

function settledStatus(
  hasCamo: boolean,
  hasEmo: boolean,
  partial: Partial<LegajosRowStatus> = {},
): LegajosRowStatus {
  return { hasCamo, hasEmo, loading: false, ...partial };
}

function loadingStatus(): LegajosRowStatus {
  return { hasCamo: false, hasEmo: false, loading: true };
}

function errorStatus(message = 'boom'): LegajosRowStatus {
  return { hasCamo: false, hasEmo: false, loading: false, error: message };
}

function expectSection(
  section: DocumentCoverageSection,
  expected: {
    state: DocumentCoverageState;
    withDnis: string[];
    withoutDnis: string[];
  },
): void {
  expect(section.state).toBe(expected.state);
  expect(section.with.map((p) => p.dni)).toEqual(expected.withDnis);
  expect(section.without.map((p) => p.dni)).toEqual(expected.withoutDnis);
  // PatientCoverageEntry shape: every entry exposes dni + nombrePaciente.
  for (const entry of section.with) {
    expect(typeof entry.dni).toBe('string');
    expect(typeof entry.nombrePaciente).toBe('string');
    expect(entry.nombrePaciente.length).toBeGreaterThan(0);
  }
  for (const entry of section.without) {
    expect(typeof entry.dni).toBe('string');
    expect(typeof entry.nombrePaciente).toBe('string');
    expect(entry.nombrePaciente.length).toBeGreaterThan(0);
  }
}

describe('aggregateDocumentStatuses', () => {
  // ---- Spec scenario: empty batch ----
  it('returns VACIO / VACIO for an empty batch', () => {
    const result: AggregatedDocumentStatus = aggregateDocumentStatuses({}, []);

    expectSection(result.camo, { state: 'VACIO', withDnis: [], withoutDnis: [] });
    expectSection(result.emo, { state: 'VACIO', withDnis: [], withoutDnis: [] });
  });

  // ---- Spec scenario: single patient CAMO-only ----
  it('returns CAMO=COMPLETO, EMO=VACIO when the single patient has CAMO only', () => {
    const people = [makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')])];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(true, false),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    expectSection(result.camo, {
      state: 'COMPLETO',
      withDnis: ['11111111'],
      withoutDnis: [],
    });
    expectSection(result.emo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['11111111'],
    });
  });

  // ---- Spec scenario: single patient EMO-only ----
  it('returns CAMO=VACIO, EMO=COMPLETO when the single patient has EMO only', () => {
    const people = [makePerson('22222222', 'Beto López', [makeFicha('ATE-002')])];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-002': settledStatus(false, true),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    expectSection(result.camo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['22222222'],
    });
    expectSection(result.emo, {
      state: 'COMPLETO',
      withDnis: ['22222222'],
      withoutDnis: [],
    });
  });

  // ---- Spec scenario: PARCIAL — at least one with, at least one without ----
  it('returns PARCIAL for CAMO when only some patients have the document', () => {
    const people = [
      makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')]),
      makePerson('22222222', 'Beto López', [makeFicha('ATE-002')]),
      makePerson('33333333', 'Carla Ruiz', [makeFicha('ATE-003')]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(true, false),
      'ATE-002': settledStatus(true, true),
      'ATE-003': settledStatus(false, false),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    expectSection(result.camo, {
      state: 'PARCIAL',
      withDnis: ['11111111', '22222222'],
      withoutDnis: ['33333333'],
    });
    expectSection(result.emo, {
      state: 'PARCIAL',
      withDnis: ['22222222'],
      withoutDnis: ['11111111', '33333333'],
    });
  });

  // ---- Spec scenario: all-have-both → both COMPLETO ----
  it('returns CAMO=COMPLETO and EMO=COMPLETO when every patient has both documents', () => {
    const people = [
      makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')]),
      makePerson('22222222', 'Beto López', [makeFicha('ATE-002')]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(true, true),
      'ATE-002': settledStatus(true, true),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    expectSection(result.camo, {
      state: 'COMPLETO',
      withDnis: ['11111111', '22222222'],
      withoutDnis: [],
    });
    expectSection(result.emo, {
      state: 'COMPLETO',
      withDnis: ['11111111', '22222222'],
      withoutDnis: [],
    });
  });

  // ---- Spec scenario: nobody has a given document → VACIO ----
  it('returns CAMO=VACIO, EMO=VACIO when no ficha has either document', () => {
    const people = [
      makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')]),
      makePerson('22222222', 'Beto López', [makeFicha('ATE-002')]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(false, false),
      'ATE-002': settledStatus(false, false),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    // State is VACIO because nobody HAS the document, but both patients
    // are listed under `without` (per the design contract — `without` is
    // the list of patients lacking the document, regardless of state).
    expectSection(result.camo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['11111111', '22222222'],
    });
    expectSection(result.emo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['11111111', '22222222'],
    });
  });

  // ---- Spec scenario: OR-merge per patient across multiple fichas ----
  it('counts a multi-ficha patient as having CAMO when ANY of their fichas has it', () => {
    // Patient 11111111 has two fichas. The first is empty for CAMO; the second
    // has CAMO. The helper should OR-merge at the patient level.
    const people = [
      makePerson('11111111', 'Ana Pérez', [
        makeFicha('ATE-001', { proyecto: 'PROYECTO A' }),
        makeFicha('ATE-001B', { proyecto: 'PROYECTO B' }),
      ]),
      makePerson('22222222', 'Beto López', [
        makeFicha('ATE-002', { proyecto: 'PROYECTO C' }),
      ]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(false, false),
      'ATE-001B': settledStatus(true, false),
      'ATE-002': settledStatus(false, true),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    // Patient 11111111 collapsed to one entry; CAMO counted as "with" because
    // ficha ATE-001B has it. EMO counted as "without" (neither ficha has it).
    expectSection(result.camo, {
      state: 'PARCIAL',
      withDnis: ['11111111'],
      withoutDnis: ['22222222'],
    });
    expectSection(result.emo, {
      state: 'PARCIAL',
      withDnis: ['22222222'],
      withoutDnis: ['11111111'],
    });
  });

  // ---- Spec scenario: OR-merge per patient for EMO ----
  it('counts a multi-ficha patient as having EMO when only one of two fichas has it', () => {
    const people = [
      makePerson('33333333', 'Carla Ruiz', [
        makeFicha('ATE-010'),
        makeFicha('ATE-011'),
      ]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-010': settledStatus(false, true),
      'ATE-011': settledStatus(false, false),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    // CAMO: nobody has it → VACIO, but Carla is still in `without`.
    expectSection(result.camo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['33333333'],
    });
    expectSection(result.emo, {
      state: 'COMPLETO',
      withDnis: ['33333333'],
      withoutDnis: [],
    });
  });

  // ---- Spec scenario: loading entries count as "without" ----
  it('treats a loading status as "without" for both CAMO and EMO', () => {
    const people = [
      makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')]),
      makePerson('22222222', 'Beto López', [makeFicha('ATE-002')]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(true, true),
      'ATE-002': loadingStatus(),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    // Ana is settled with both; Beto is still loading → counted as "without"
    // for both → CAMO and EMO are PARCIAL.
    expectSection(result.camo, {
      state: 'PARCIAL',
      withDnis: ['11111111'],
      withoutDnis: ['22222222'],
    });
    expectSection(result.emo, {
      state: 'PARCIAL',
      withDnis: ['11111111'],
      withoutDnis: ['22222222'],
    });
  });

  // ---- Spec scenario: error entries count as "without" ----
  it('treats an error status as "without" for both CAMO and EMO', () => {
    const people = [
      makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')]),
      makePerson('22222222', 'Beto López', [makeFicha('ATE-002')]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(true, true),
      'ATE-002': errorStatus('No se recibió estado para esta ficha.'),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    expectSection(result.camo, {
      state: 'PARCIAL',
      withDnis: ['11111111'],
      withoutDnis: ['22222222'],
    });
    expectSection(result.emo, {
      state: 'PARCIAL',
      withDnis: ['11111111'],
      withoutDnis: ['22222222'],
    });
  });

  // ---- Defensive: missing status for a ficha (e.g., checkAll never ran for it) ----
  it('treats a ficha with no entry in the statuses map as "without" for both', () => {
    const people = [
      makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')]),
      makePerson('22222222', 'Beto López', [makeFicha('ATE-002')]),
    ];
    // Only Ana's status is present; Beto's ficha was never checked.
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(true, true),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    expectSection(result.camo, {
      state: 'PARCIAL',
      withDnis: ['11111111'],
      withoutDnis: ['22222222'],
    });
    expectSection(result.emo, {
      state: 'PARCIAL',
      withDnis: ['11111111'],
      withoutDnis: ['22222222'],
    });
  });

  // ---- Defensive: a patient with zero fichas ----
  it('produces no entries for a patient who has no fichas', () => {
    const people = [makePerson('11111111', 'Ana Pérez', [])];
    const result = aggregateDocumentStatuses({}, people);

    // A patient with no fichas has nothing → counted as "without" both
    // CAMO and EMO. State is VACIO because no one has the documents.
    expectSection(result.camo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['11111111'],
    });
    expectSection(result.emo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['11111111'],
    });
  });

  // ---- Spec: section state priority (VACIO > COMPLETO > PARCIAL) ----
  it('returns VACIO (not COMPLETO) when all fichas are loading and nobody has resolved', () => {
    const people = [
      makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')]),
      makePerson('22222222', 'Beto López', [makeFicha('ATE-002')]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': loadingStatus(),
      'ATE-002': loadingStatus(),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    // Both patients are "without" for both (defensive: loading → without).
    // State is VACIO because nobody has either document, but both
    // patients are listed under `without`.
    expectSection(result.camo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['11111111', '22222222'],
    });
    expectSection(result.emo, {
      state: 'VACIO',
      withDnis: [],
      withoutDnis: ['11111111', '22222222'],
    });
  });

  // ---- Output contract: result is fully readonly ----
  it('returns readonly arrays for `with` and `without`', () => {
    const people = [makePerson('11111111', 'Ana Pérez', [makeFicha('ATE-001')])];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-001': settledStatus(true, true),
    };

    const result = aggregateDocumentStatuses(statuses, people);

    // The structural shape is readonly; runtime check is enough to assert
    // arrays are returned.
    expect(Array.isArray(result.camo.with)).toBe(true);
    expect(Array.isArray(result.camo.without)).toBe(true);
    expect(Array.isArray(result.emo.with)).toBe(true);
    expect(Array.isArray(result.emo.without)).toBe(true);
  });
});
