/**
 * PR envio-resultados CAMO/EMO wizard — WU-3.1.
 *
 * `buildEmailViewDataFromWizard` is the pure helper that maps the
 * wizard's per-patient picks (CAMO + EMO maps) into the
 * `{ selectedPatients, fileRefs }` shape `EmailEditor` expects.
 *
 * The helper is the wizard-path counterpart of
 * `emailViewDataFromFiles` (the per-row legacy bridge). The legacy
 * helper carries `patients: Patient[]` for the AttachmentList; the
 * wizard helper does not — the wizard's email view shows the
 * patient names from `selectedPatients` and the LAN files from
 * `fileRefs` (the AttachmentList is not exercised in the wizard
 * path; that is a known scope limitation, not a bug).
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-007 — Step 4 Resumen handoff.
 *  - REQ-009 — SelectedFileRef.tipoExamen populated on every ref.
 *  - Scenario S-011 (summary row), S-012 (handoff payload).
 */
import { describe, expect, it } from 'vitest';

import { buildEmailViewDataFromWizard } from '../buildEmailViewDataFromWizard';
import type { SelectedFileRef } from '../../../domain/entities';
import type { WizardFilePick } from '../../hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';

// ---- Fixtures ----

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'JUAN PEREZ',
    empresa: 'ACME S.A.C.',
    tipoExamen: 'CAMO',
    proyecto: 'METRO LIMA',
    condic: '',
    fichas: [
      {
        idAten: 'AT-001',
        nroRuc: '20123456789',
        nomCFa: 'ACME S.A.C.',
        proyecto: 'METRO LIMA',
        tipoExamen: 'CAMO',
        condic: '',
      },
    ],
    ...overrides,
  };
}

function camoRef(dni: string, displayName: string): SelectedFileRef {
  return {
    ruc: '20123456789',
    dni,
    idAten: 'AT-001',
    path: 'LEGAJOS',
    name: displayName,
    tipoExamen: 'CAMO',
  };
}

function emoRef(dni: string, displayName: string): SelectedFileRef {
  return {
    ruc: '20123456789',
    dni,
    idAten: 'AT-001',
    path: 'LEGAJOS',
    name: displayName,
    tipoExamen: 'EMO',
  };
}

function makePick(ref: SelectedFileRef): WizardFilePick {
  return { ref, displayName: ref.name };
}

// ================================================================

describe('buildEmailViewDataFromWizard', () => {
  it('builds selectedPatients + fileRefs for a single patient with only a CAMO pick', () => {
    const people = [makePerson()];
    const camo = makePick(camoRef('12345678', '75618561CERT.pdf'));
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: { '12345678': camo },
      emoByDni: {},
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
    });
  });

  it('builds fileRefs with tipoExamen set on each entry (CAMO and EMO both)', () => {
    const people = [
      makePerson({ dni: '11111111', nombre: 'ANA LOPEZ' }),
      makePerson({ dni: '22222222', nombre: 'BETO RUIZ' }),
    ];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['11111111', '22222222']),
      camoByDni: {
        '11111111': makePick(camoRef('11111111', '11111111CERT.pdf')),
        '22222222': makePick(camoRef('22222222', '22222222CERT.pdf')),
      },
      emoByDni: {
        '11111111': makePick(emoRef('11111111', '11111111EXPED.pdf')),
        '22222222': makePick(emoRef('22222222', '22222222EXPED.pdf')),
      },
      people,
    });
    expect(result.fileRefs).toHaveLength(4);
    // Each entry carries the correct tipoExamen
    const byTipo = (t: 'CAMO' | 'EMO') => result.fileRefs.filter((r) => r.tipoExamen === t);
    expect(byTipo('CAMO')).toHaveLength(2);
    expect(byTipo('EMO')).toHaveLength(2);
    expect(byTipo('CAMO').map((r) => r.dni).sort()).toEqual(['11111111', '22222222']);
    expect(byTipo('EMO').map((r) => r.dni).sort()).toEqual(['11111111', '22222222']);
  });

  it('skips a null CAMO pick (Saltar CAMO) — not added to fileRefs but patient stays in selectedPatients', () => {
    const people = [makePerson()];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: { '12345678': null },
      emoByDni: {},
      people,
    });
    expect(result.fileRefs).toEqual([]);
    // Patient stays — the EmailEditor surfaces the "no files" warning
    expect(result.selectedPatients).toEqual({
      '12345678': { patientName: 'JUAN PEREZ', files: [] },
    });
  });

  it('skips a patient with both picks null (skipped both) — empty fileRefs, patient still listed', () => {
    const people = [makePerson()];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: { '12345678': null },
      emoByDni: { '12345678': null },
      people,
    });
    expect(result.fileRefs).toEqual([]);
    expect(result.selectedPatients).toEqual({
      '12345678': { patientName: 'JUAN PEREZ', files: [] },
    });
  });

  it('skips a patient missing from the people array (defensive)', () => {
    // The reducer only ever sets picks for dnis in selectedDnIs, but
    // a defensive `find` miss must not throw — it just drops the
    // patient from both maps. (The reducer also guards this, but the
    // helper is a pure function and is exercised directly.)
    const people = [makePerson({ dni: '99999999', nombre: 'OTHER PERSON' })];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: {
        '12345678': makePick(camoRef('12345678', '75618561CERT.pdf')),
      },
      emoByDni: {},
      people,
    });
    // The dni 12345678 is not in people → not added to selectedPatients
    expect(result.selectedPatients).toEqual({});
    // But the fileRef still carries the dni (the ref came from the
    // pick — the helper trusts the ref shape from Step 2/3).
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]?.dni).toBe('12345678');
  });

  it('always includes the patient entry in selectedPatients even when both picks are missing', () => {
    // Triangulation: `selectedPatients` is keyed by dni, so a patient
    // with neither pick (camoByDni[dn] === undefined) MUST still
    // appear. The EmailEditor relies on this key to render the
    // patient row in the attachment panel.
    const people = [makePerson()];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: {},
      emoByDni: {},
      people,
    });
    expect(result.selectedPatients).toEqual({
      '12345678': { patientName: 'JUAN PEREZ', files: [] },
    });
    expect(result.fileRefs).toEqual([]);
  });

  it('CAMO + EMO for the same patient: two fileRefs, both filenames in `files`', () => {
    const people = [makePerson()];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: { '12345678': makePick(camoRef('12345678', 'CERT.pdf')) },
      emoByDni: { '12345678': makePick(emoRef('12345678', 'EXPED.pdf')) },
      people,
    });
    expect(result.fileRefs).toHaveLength(2);
    expect(result.selectedPatients['12345678']?.files).toEqual(['CERT.pdf', 'EXPED.pdf']);
    const dni = result.fileRefs.map((r) => r.dni);
    expect(dni).toEqual(['12345678', '12345678']);
    const tipos = result.fileRefs.map((r) => r.tipoExamen).sort();
    expect(tipos).toEqual(['CAMO', 'EMO']);
  });

  // ================================================================
  // PR-2 (nomenclatura-adicionales) — stamp preservation
  // REQ-8/S-13: `buildEmailViewDataFromWizard` MUST preserve an existing
  // `ref.tipoExamen` (e.g. 'ADICIONAL' stamped by the wizard step) and
  // NEVER overwrite it with a hardcoded 'CAMO'/'EMO'. S-14: mixed
  // CAMO+ADICIONAL refs under one nombreCompleto keep per-file prefixes.
  // ================================================================

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
      camoByDni: { '12345678': adicionalCamo },
      emoByDni: {},
      people,
    });
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]?.tipoExamen).toBe('ADICIONAL');
  });

  it('falls back to CAMO/EMO only when the pick ref has no stamp (default contract unchanged)', () => {
    const people = [makePerson()];
    const unstampedCamo = makePick({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: 'CERT.pdf',
    });
    const unstampedEmo = makePick({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: 'EXPED.pdf',
    });
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: { '12345678': unstampedCamo },
      emoByDni: { '12345678': unstampedEmo },
      people,
    });
    expect(result.fileRefs).toHaveLength(2);
    expect(result.fileRefs[0]?.tipoExamen).toBe('CAMO');
    expect(result.fileRefs[1]?.tipoExamen).toBe('EMO');
  });

  it('preserves stamps on stray (person-missing) picks too (S-13 defensive path)', () => {
    const people = [makePerson({ dni: '99999999', nombre: 'OTHER PERSON' })];
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
      camoByDni: { '12345678': adicionalCamo },
      emoByDni: {},
      people,
    });
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]?.tipoExamen).toBe('ADICIONAL');
    expect(result.fileRefs[0]?.dni).toBe('12345678');
  });

  // ================================================================
  // fix-duplicate-attachment-names — per-ref `nombreCompleto`
  // stamping. The wizard is the ONLY multi-patient email path; the
  // bridge must stamp every resolved-person ref with THAT patient's
  // name so the use-case rename produces per-patient filenames.
  // Stray picks (dni no longer in `people`) stay UNSTAMPED — the
  // request-level name renames them (no fabrication).
  // ================================================================

  it('stamps each resolved-person ref with its own patient\'s nombreCompleto (S-1)', () => {
    const people = [
      makePerson({ dni: '11111111', nombre: 'JUAN PEREZ' }),
      makePerson({ dni: '22222222', nombre: 'MARIA LOPEZ' }),
    ];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['11111111', '22222222']),
      camoByDni: {
        '11111111': makePick(camoRef('11111111', '11111111CERT.pdf')),
        '22222222': makePick(camoRef('22222222', '22222222CERT.pdf')),
      },
      emoByDni: {
        '11111111': makePick(emoRef('11111111', '11111111EXPED.pdf')),
      },
      people,
    });
    expect(result.fileRefs).toHaveLength(3);
    const byName = (n: string) => result.fileRefs.find((r) => r.name === n);
    // Each ref carries its OWN patient's name — the per-ref stamp
    // the use-case rename prefers over the request-level scalar.
    expect(byName('11111111CERT.pdf')?.nombreCompleto).toBe('JUAN PEREZ');
    expect(byName('11111111EXPED.pdf')?.nombreCompleto).toBe('JUAN PEREZ');
    expect(byName('22222222CERT.pdf')?.nombreCompleto).toBe('MARIA LOPEZ');
  });

  it('stray pick (dni not in people) pushes the ref WITHOUT nombreCompleto — no fabrication (S-6)', () => {
    // Pin: a picked dni absent from `people` (table refetched
    // mid-wizard) cannot be stamped. The ref is still attached
    // (existing behavior) and the use-case rename falls back to the
    // request-level name. The bridge MUST NOT fabricate a name.
    const people = [makePerson({ dni: '99999999', nombre: 'OTHER PERSON' })];
    const result = buildEmailViewDataFromWizard({
      selectedDnIs: new Set(['12345678']),
      camoByDni: {
        '12345678': makePick(camoRef('12345678', '75618561CERT.pdf')),
      },
      emoByDni: {},
      people,
    });
    expect(result.fileRefs).toHaveLength(1);
    expect(result.fileRefs[0]?.dni).toBe('12345678');
    expect(result.fileRefs[0]?.nombreCompleto).toBeUndefined();
  });
});
