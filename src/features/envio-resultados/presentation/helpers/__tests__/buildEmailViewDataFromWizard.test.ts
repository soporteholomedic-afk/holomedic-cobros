/**
 * `buildEmailViewDataFromWizard` is the pure helper that maps the
 * wizard's per-ficha picks (CAMO + EMO maps keyed `dni::idAten`)
 * into the `{ selectedPatients, fileRefs }` shape `EmailEditor`
 * expects.
 *
 * Multi-proyecto change (REQ-108, design D6): the helper iterates
 * each resolved person's `fichas` in stable order and looks up
 * `pickKey(dni, ficha.idAten)` in both maps — one patient with
 * picks on N fichas flattens into N fileRefs with distinct idAten.
 * Stray picks (person gone from `people`) pass through UNSTAMPED.
 * Proyecto stamping lands in WU-3 (not here).
 *
 * Spec coverage:
 *  - REQ-108 — S-108.1 multi-ref flattening, legacy flow unchanged.
 *  - Legacy REQ-007 — handoff payload (S-012), REQ-009 tipoExamen,
 *    ADICIONAL stamp preservation (S-13).
 */
import { describe, expect, it } from 'vitest';

import { buildEmailViewDataFromWizard } from '../buildEmailViewDataFromWizard';
import { pickKey } from '../../hooks/useEnvioWizard';
import type { SelectedFileRef } from '../../../domain/entities';
import type { WizardFilePick } from '../../hooks/useEnvioWizard';
import type { UnifiedFicha, UnifiedPerson } from '@/types/sp-result';

// ---- Fixtures ----

function makeFicha(overrides: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten: 'AT-001',
    nroRuc: '20123456789',
    nomCFa: 'ACME S.A.C.',
    proyecto: 'METRO LIMA',
    tipoExamen: 'CAMO',
    condic: '',
    ...overrides,
  };
}

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'JUAN PEREZ',
    empresa: 'ACME S.A.C.',
    tipoExamen: 'CAMO',
    proyecto: 'METRO LIMA',
    condic: '',
    fichas: [makeFicha()],
    ...overrides,
  };
}

function camoRef(dni: string, idAten: string, displayName: string): SelectedFileRef {
  return {
    ruc: '20123456789',
    dni,
    idAten,
    path: 'LEGAJOS',
    name: displayName,
    tipoExamen: 'CAMO',
  };
}

function emoRef(dni: string, idAten: string, displayName: string): SelectedFileRef {
  return {
    ruc: '20123456789',
    dni,
    idAten,
    path: 'LEGAJOS',
    name: displayName,
    tipoExamen: 'EMO',
  };
}

function makePick(ref: SelectedFileRef): WizardFilePick {
  return { ref, displayName: ref.name };
}

// ================================================================

describe('buildEmailViewDataFromWizard — legacy single-ficha characterization', () => {
  it('builds selectedPatients + fileRefs for a single patient with only a CAMO pick', () => {
    const people = [makePerson()];
    const camo = makePick(camoRef('12345678', 'AT-001', '75618561CERT.pdf'));
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: camo },
      emoPicks: {},
      people,
    });
    expect(result.selectedPatients).toEqual({
      '12345678': { patientName: 'JUAN PEREZ', files: ['75618561CERT.pdf'] },
    });
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]).toEqual({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: '75618561CERT.pdf',
      tipoExamen: 'CAMO',
      nombreCompleto: 'JUAN PEREZ',
      // REQ-104 (D6): the ficha's proyecto is stamped per ref.
      proyecto: 'METRO LIMA',
    });
  });

  it('CAMO + EMO on the same ficha: two fileRefs (CAMO then EMO), both filenames in `files`', () => {
    const people = [makePerson()];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: makePick(camoRef('12345678', 'AT-001', 'CERT.pdf')) },
      emoPicks: { [pickKey('12345678', 'AT-001')]: makePick(emoRef('12345678', 'AT-001', 'EXPED.pdf')) },
      people,
    });
    expect(result.fileRefs).toHaveLength(2);
    expect(result.fileRefs.map((r) => r.tipoExamen)).toEqual(['CAMO', 'EMO']);
    expect(result.selectedPatients['12345678']?.files).toEqual(['CERT.pdf', 'EXPED.pdf']);
  });

  it('skips null picks (Saltar) — not added to fileRefs but patient stays in selectedPatients', () => {
    const people = [makePerson()];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: null },
      emoPicks: {},
      people,
    });
    expect(result.fileRefs).toEqual([]);
    expect(result.selectedPatients).toEqual({
      '12345678': { patientName: 'JUAN PEREZ', files: [] },
    });
  });

  it('always includes the patient entry even when no picks exist at all', () => {
    const people = [makePerson()];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: {},
      emoPicks: {},
      people,
    });
    expect(result.selectedPatients).toEqual({
      '12345678': { patientName: 'JUAN PEREZ', files: [] },
    });
    expect(result.fileRefs).toEqual([]);
  });

  it('stamps each resolved-person ref with its own patient\'s nombreCompleto', () => {
    const people = [
      makePerson({ dni: '11111111', nombre: 'JUAN PEREZ' }),
      makePerson({ dni: '22222222', nombre: 'MARIA LOPEZ' }),
    ];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['11111111', '22222222']),
      camoPicks: {
        [pickKey('11111111', 'AT-001')]: makePick(camoRef('11111111', 'AT-001', '11111111CERT.pdf')),
        [pickKey('22222222', 'AT-001')]: makePick(camoRef('22222222', 'AT-001', '22222222CERT.pdf')),
      },
      emoPicks: {
        [pickKey('11111111', 'AT-001')]: makePick(emoRef('11111111', 'AT-001', '11111111EXPED.pdf')),
      },
      people,
    });
    expect(result.fileRefs).toHaveLength(3);
    const byName = (n: string) => result.fileRefs.find((r) => r.name === n);
    expect(byName('11111111CERT.pdf')?.nombreCompleto).toBe('JUAN PEREZ');
    expect(byName('11111111EXPED.pdf')?.nombreCompleto).toBe('JUAN PEREZ');
    expect(byName('22222222CERT.pdf')?.nombreCompleto).toBe('MARIA LOPEZ');
  });

  it('preserves a pre-stamped ADICIONAL ref through the email build (S-13)', () => {
    const people = [makePerson()];
    const adicionalCamo = makePick({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: '012110336CERT.pdf',
      tipoExamen: 'ADICIONAL',
    });
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: adicionalCamo },
      emoPicks: {},
      people,
    });
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]?.tipoExamen).toBe('ADICIONAL');
  });

  it('falls back to CAMO/EMO only when the pick ref has no stamp', () => {
    const people = [makePerson()];
    const unstampedCamo = makePick({
      ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: 'CERT.pdf',
    });
    const unstampedEmo = makePick({
      ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: 'EXPED.pdf',
    });
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: unstampedCamo },
      emoPicks: { [pickKey('12345678', 'AT-001')]: unstampedEmo },
      people,
    });
    expect(result.fileRefs).toHaveLength(2);
    expect(result.fileRefs[0]?.tipoExamen).toBe('CAMO');
    expect(result.fileRefs[1]?.tipoExamen).toBe('EMO');
  });

  it('stray pick (dni not in people) pushes the ref WITHOUT nombreCompleto — no fabrication', () => {
    const people = [makePerson({ dni: '99999999', nombre: 'OTHER PERSON' })];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: makePick(camoRef('12345678', 'AT-001', '75618561CERT.pdf')) },
      emoPicks: {},
      people,
    });
    expect(result.selectedPatients).toEqual({});
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]?.dni).toBe('12345678');
    expect(result.fileRefs[0]?.nombreCompleto).toBeUndefined();
  });
});

// ================================================================
// REQ-108 — multi-ref pipeline integrity (S-108.1)
// ================================================================

describe('buildEmailViewDataFromWizard — per-ficha flattening (S-108.1)', () => {
  /** Reference-case patient: 3 idAten-bearing fichas. */
  function multiPerson(): UnifiedPerson {
    return makePerson({
      dni: '00250391',
      nombre: 'MONTAÑEZ VINO JULIO',
      fichas: [
        makeFicha({ idAten: 'AT-1', proyecto: 'NEXA RESOURCES CAJAMARQUILLA' }),
        makeFicha({ idAten: 'AT-2', proyecto: 'UNACEM' }),
        makeFicha({ idAten: 'AT-3', proyecto: 'MINSUR' }),
      ],
    });
  }

  it('CAMO picked on 3 fichas: 3 fileRefs with distinct idAten in ficha order + 3 display names', () => {
    const person = multiPerson();
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['00250391']),
      camoPicks: {
        [pickKey('00250391', 'AT-1')]: makePick(camoRef('00250391', 'AT-1', 'CERT-NEXA.pdf')),
        [pickKey('00250391', 'AT-2')]: makePick(camoRef('00250391', 'AT-2', 'CERT-UNACEM.pdf')),
        [pickKey('00250391', 'AT-3')]: makePick(camoRef('00250391', 'AT-3', 'CERT-MINSUR.pdf')),
      },
      emoPicks: {},
      people: [person],
    });
    expect(result.fileRefs).toHaveLength(3);
    expect(result.fileRefs.map((r) => r.idAten)).toEqual(['AT-1', 'AT-2', 'AT-3']);
    expect(result.selectedPatients['00250391']?.files).toEqual([
      'CERT-NEXA.pdf',
      'CERT-UNACEM.pdf',
      'CERT-MINSUR.pdf',
    ]);
    // Every ref is stamped with the person's name (per-ref rename).
    for (const ref of result.fileRefs) {
      expect(ref.nombreCompleto).toBe('MONTAÑEZ VINO JULIO');
    }
  });

  it('pick on only one ficha yields only that ficha\'s ref', () => {
    const person = multiPerson();
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['00250391']),
      camoPicks: {
        [pickKey('00250391', 'AT-2')]: makePick(camoRef('00250391', 'AT-2', 'CERT-UNACEM.pdf')),
      },
      emoPicks: {},
      people: [person],
    });
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]?.idAten).toBe('AT-2');
  });

  it('mixed CAMO/EMO across fichas: per-ficha CAMO-then-EMO order', () => {
    const person = multiPerson();
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['00250391']),
      camoPicks: {
        [pickKey('00250391', 'AT-1')]: makePick(camoRef('00250391', 'AT-1', 'C1.pdf')),
        [pickKey('00250391', 'AT-3')]: makePick(camoRef('00250391', 'AT-3', 'C3.pdf')),
      },
      emoPicks: {
        [pickKey('00250391', 'AT-2')]: makePick(emoRef('00250391', 'AT-2', 'E2.pdf')),
      },
      people: [person],
    });
    expect(result.fileRefs.map((r) => r.name)).toEqual(['C1.pdf', 'E2.pdf', 'C3.pdf']);
  });

  it('stray picks spread over several composite keys all pass through unstamped', () => {
    const people = [makePerson({ dni: '99999999', nombre: 'OTHER PERSON' })];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['00250391']),
      camoPicks: {
        [pickKey('00250391', 'AT-1')]: makePick(camoRef('00250391', 'AT-1', 'C1.pdf')),
        [pickKey('00250391', 'AT-2')]: makePick(camoRef('00250391', 'AT-2', 'C2.pdf')),
      },
      emoPicks: {
        [pickKey('00250391', 'AT-1')]: makePick(emoRef('00250391', 'AT-1', 'E1.pdf')),
      },
      people,
    });
    expect(result.fileRefs).toHaveLength(3);
    for (const ref of result.fileRefs) {
      expect(ref.nombreCompleto).toBeUndefined();
      // Unstamped strays: no fabricated proyecto either.
      expect(ref.proyecto).toBeUndefined();
    }
    // Camo strays first, then emo strays (parallel to the resolved flow).
    expect(result.fileRefs.map((r) => r.name)).toEqual(['C1.pdf', 'C2.pdf', 'E1.pdf']);
  });
});

// ================================================================
// REQ-104 — proyecto stamping (D6)
// ================================================================

describe('buildEmailViewDataFromWizard — proyecto stamping (REQ-104, D6)', () => {
  /** Reference-case patient: 3 idAten-bearing fichas. */
  function multiPerson(): UnifiedPerson {
    return makePerson({
      dni: '00250391',
      nombre: 'MONTAÑEZ VINO JULIO',
      fichas: [
        makeFicha({ idAten: 'AT-1', proyecto: 'NEXA RESOURCES CAJAMARQUILLA' }),
        makeFicha({ idAten: 'AT-2', proyecto: 'UNACEM' }),
        makeFicha({ idAten: 'AT-3', proyecto: 'MINSUR' }),
      ],
    });
  }

  it('stamps each ref with ITS OWN ficha proyecto (multi-proyecto)', () => {
    const person = multiPerson();
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['00250391']),
      camoPicks: {
        [pickKey('00250391', 'AT-1')]: makePick(camoRef('00250391', 'AT-1', 'CERT-NEXA.pdf')),
        [pickKey('00250391', 'AT-2')]: makePick(camoRef('00250391', 'AT-2', 'CERT-UNACEM.pdf')),
        [pickKey('00250391', 'AT-3')]: makePick(camoRef('00250391', 'AT-3', 'CERT-MINSUR.pdf')),
      },
      emoPicks: {},
      people: [person],
    });
    const byName = (n: string) => result.fileRefs.find((r) => r.name === n);
    expect(byName('CERT-NEXA.pdf')?.proyecto).toBe('NEXA RESOURCES CAJAMARQUILLA');
    expect(byName('CERT-UNACEM.pdf')?.proyecto).toBe('UNACEM');
    expect(byName('CERT-MINSUR.pdf')?.proyecto).toBe('MINSUR');
  });

  it('stamps the EMO pick with its ficha proyecto too', () => {
    const person = multiPerson();
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['00250391']),
      camoPicks: {},
      emoPicks: {
        [pickKey('00250391', 'AT-2')]: makePick(emoRef('00250391', 'AT-2', 'EXPED-UNACEM.pdf')),
      },
      people: [person],
    });
    expect(result.fileRefs[0]?.proyecto).toBe('UNACEM');
  });

  it('single-proyecto send: per-ref proyecto equals the request-level value (S-104.3 — names identical to today)', () => {
    const people = [makePerson()]; // ficha proyecto = person proyecto = 'METRO LIMA'
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: makePick(camoRef('12345678', 'AT-001', 'CERT.pdf')) },
      emoPicks: {},
      people,
    });
    expect(result.fileRefs[0]?.proyecto).toBe('METRO LIMA');
  });

  it('empty-proyecto ficha stamps undefined (request-level destino applies downstream)', () => {
    const people = [makePerson({ fichas: [makeFicha({ proyecto: '' })] })];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoPicks: { [pickKey('12345678', 'AT-001')]: makePick(camoRef('12345678', 'AT-001', 'CERT.pdf')) },
      emoPicks: {},
      people,
    });
    expect(result.fileRefs[0]?.proyecto).toBeUndefined();
  });
});
