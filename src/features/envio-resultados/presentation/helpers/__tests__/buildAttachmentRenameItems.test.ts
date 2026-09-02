import { describe, it, expect } from 'vitest';
import { buildAttachmentRenameItems } from '../buildAttachmentRenameItems';
import type { Patient, SelectedFileRef } from '@/features/envio-resultados/domain/entities';

/**
 * Unit tests for the `buildAttachmentRenameItems` matcher helper (WU-4).
 *
 * The helper is the pure seam between what `AttachmentList` DISPLAYS
 * (per-patient file rows from `selectedPatients`/`patients`) and the
 * send-payload `SelectedFileRef[]` that carries the LAN location
 * triple and the delivery-name override. Every rename chip rendered by
 * the composer (REQ-01) is computed here, so the effective-name
 * preview MUST mirror the server precedence in `sendResults.ts`
 * (`override ?? renameReadyFile ?? renameGeneratedCertificate`, D2/D5).
 *
 * Flows covered (WU-1.4 finding):
 *  (a) FilesModal — display ids are `path::name` composites
 *      (`emailViewDataFromFiles`), `patients` populated.
 *  (b) Wizard — display rows are bare `pick.displayName` basenames and
 *      `patients: []` is passed explicitly; the matcher MUST NOT depend
 *      on `patients` being populated.
 *  (c) Reenvío — refs carry the snapshot-stamped `deliveryName` (D8).
 */

const RUC = '20123456789';
const DNI = '12345678';
const NOMBRE = 'Juan Pérez';
const ID_ATEN = 'AT-001';
const DESTINO = 'OE-001';

/** FilesModal-shaped ref (exactly what `emailViewDataFromFiles` stamps). */
function makeLanRef(overrides: Partial<SelectedFileRef> = {}): SelectedFileRef {
  return {
    ruc: RUC,
    dni: DNI,
    idAten: ID_ATEN,
    path: '',
    name: '',
    ...overrides,
  };
}

/** The single FilesModal patient, with PatientFile ids = composites. */
function makeFilesModalPatients(files: Array<{ id: string; name: string }>): Patient[] {
  return [
    {
      id: DNI,
      companyId: 'uuid-company-1',
      name: NOMBRE,
      dni: DNI,
      files: files.map((f) => ({
        id: f.id,
        patientId: DNI,
        name: f.name,
        type: 'application/pdf',
        size: 100,
      })),
    },
  ];
}

describe('buildAttachmentRenameItems — (a) FilesModal flow (`path::name` exact matching)', () => {
  const refs: SelectedFileRef[] = [
    makeLanRef({ path: 'subdir', name: '123CERT.pdf' }),
    makeLanRef({ path: '', name: '75618561EXPED.pdf' }),
  ];
  const files = ['subdir::123CERT.pdf', '::75618561EXPED.pdf'];
  const selectedPatients = { [DNI]: { patientName: NOMBRE, files } };
  const patients = makeFilesModalPatients(files.map((id, i) => ({ id, name: refs[i]!.name })));

  it('matches every display row by exact `path::name` and previews the auto delivery name', () => {
    const items = buildAttachmentRenameItems(refs, selectedPatients, patients, {}, NOMBRE, DESTINO);

    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      refKey: `${RUC}::${DNI}::${ID_ATEN}::subdir::123CERT.pdf`,
      displayName: '123CERT.pdf',
      storedName: '123CERT.pdf',
      effectiveName: 'CAMO-Juan Pérez-OE-001.pdf',
      overridden: false,
      issue: null,
    });
    expect(items[1]).toMatchObject({
      refKey: `${RUC}::${DNI}::${ID_ATEN}::::75618561EXPED.pdf`,
      displayName: '75618561EXPED.pdf',
      storedName: '75618561EXPED.pdf',
      effectiveName: 'EMO-Juan Pérez-OE-001.pdf',
      overridden: false,
      issue: null,
    });
  });

  it('effective name is the validated override with `.pdf` forced for ready files (REQ-01)', () => {
    const overrides = { [`${RUC}::${DNI}::${ID_ATEN}::subdir::123CERT.pdf`]: 'Informe Juan' };

    const items = buildAttachmentRenameItems(refs, selectedPatients, patients, overrides, NOMBRE, DESTINO);

    expect(items[0]).toMatchObject({
      storedName: '123CERT.pdf',
      effectiveName: 'Informe Juan.pdf',
      overridden: true,
      issue: null,
    });
    // The sibling row without an override keeps its auto preview.
    expect(items[1]?.effectiveName).toBe('EMO-Juan Pérez-OE-001.pdf');
    expect(items[1]?.overridden).toBe(false);
  });

  it('an empty override falls back to the auto preview and sends no override (REQ-01)', () => {
    const refKey = `${RUC}::${DNI}::${ID_ATEN}::subdir::123CERT.pdf`;
    const overrides = { [refKey]: '  ' };

    const items = buildAttachmentRenameItems(refs, selectedPatients, patients, overrides, NOMBRE, DESTINO);

    expect(items[0]).toMatchObject({
      effectiveName: 'CAMO-Juan Pérez-OE-001.pdf',
      overridden: false,
      issue: null,
    });
  });

  it('a traversal override surfaces the issue and the effective name stays the auto preview (REQ-03)', () => {
    const refKey = `${RUC}::${DNI}::${ID_ATEN}::subdir::123CERT.pdf`;
    const overrides = { [refKey]: '../../evil' };

    const items = buildAttachmentRenameItems(refs, selectedPatients, patients, overrides, NOMBRE, DESTINO);

    expect(items[0]).toMatchObject({
      effectiveName: 'CAMO-Juan Pérez-OE-001.pdf',
      overridden: false,
    });
    expect(items[0]?.issue).toMatchObject({ code: 'TRAVERSAL' });
  });

  it('does NOT force `.pdf` on a non-ready file override (D5 sanitize-only scope)', () => {
    const refsLocal = [makeLanRef({ path: 'subdir', name: 'notas.txt' })];
    const filesLocal = ['subdir::notas.txt'];
    const patientsLocal = makeFilesModalPatients([{ id: 'subdir::notas.txt', name: 'notas.txt' }]);
    const refKey = `${RUC}::${DNI}::${ID_ATEN}::subdir::notas.txt`;

    const items = buildAttachmentRenameItems(
      refsLocal,
      { [DNI]: { patientName: NOMBRE, files: filesLocal } },
      patientsLocal,
      { [refKey]: 'Informe libre' },
      NOMBRE,
      DESTINO,
    );

    expect(items[0]).toMatchObject({
      effectiveName: 'Informe libre',
      overridden: true,
      issue: null,
    });
  });

  it('previews CLI generated certificates through the generated-rename fallback (dual rename mirror)', () => {
    const cliName = '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf';
    const refsLocal = [makeLanRef({ path: 'subdir', name: cliName })];
    const filesLocal = [`subdir::${cliName}`];
    const patientsLocal = makeFilesModalPatients([{ id: `subdir::${cliName}`, name: cliName }]);

    const items = buildAttachmentRenameItems(
      refsLocal,
      { [DNI]: { patientName: NOMBRE, files: filesLocal } },
      patientsLocal,
      {},
      NOMBRE,
      DESTINO,
    );

    expect(items[0]).toMatchObject({
      storedName: cliName,
      effectiveName: 'CAMO_Juan Pérez.pdf',
      overridden: false,
      issue: null,
    });
  });
});

describe('buildAttachmentRenameItems — (b) wizard flow (bare basenames, `patients: []`)', () => {
  const DNI_WIZ = '75618561';
  const NOMBRE_WIZ = 'María Torres';
  const refs: SelectedFileRef[] = [
    {
      ruc: RUC,
      dni: DNI_WIZ,
      idAten: 'AT-900',
      path: 'LOTE 01',
      name: '75618561CERT.pdf',
      tipoExamen: 'CAMO',
      nombreCompleto: NOMBRE_WIZ,
      proyecto: 'PROY-A',
    },
    {
      ruc: RUC,
      dni: DNI_WIZ,
      idAten: 'AT-900',
      path: 'LOTE 01',
      name: '75618561EXPED.pdf',
      tipoExamen: 'EMO',
      nombreCompleto: NOMBRE_WIZ,
      // No per-ref proyecto → the request-level `destino` applies.
    },
  ];
  // Wizard shape: bare displayName basenames; `patients: []` explicit.
  const selectedPatients = { [DNI_WIZ]: { patientName: NOMBRE_WIZ, files: ['75618561CERT.pdf', '75618561EXPED.pdf'] } };

  it('matches bare basenames by ref basename fallback and honors per-ref nombre/proyecto precedence', () => {
    const items = buildAttachmentRenameItems(
      refs,
      selectedPatients,
      [], // wizard passes `patients: []` — the matcher MUST NOT depend on it
      {},
      'REQUEST-LEVEL NAME',
      'REQUEST-DEST',
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      refKey: `${RUC}::${DNI_WIZ}::AT-900::LOTE 01::75618561CERT.pdf`,
      storedName: '75618561CERT.pdf',
      // Per-ref nombreCompleto + proyecto win over the request-level scalars.
      effectiveName: 'CAMO-María Torres-PROY-A.pdf',
      overridden: false,
      issue: null,
    });
    expect(items[1]).toMatchObject({
      refKey: `${RUC}::${DNI_WIZ}::AT-900::LOTE 01::75618561EXPED.pdf`,
      // No per-ref proyecto → request-level destino fallback applies.
      effectiveName: 'EMO-María Torres-REQUEST-DEST.pdf',
      overridden: false,
      issue: null,
    });
  });
});

describe('buildAttachmentRenameItems — (c) reenvío-shaped input (stamped `deliveryName`)', () => {
  const refKey = `${RUC}::${DNI}::${ID_ATEN}::subdir::123CERT.pdf`;
  const stampedRefs: SelectedFileRef[] = [
    makeLanRef({ path: 'subdir', name: '123CERT.pdf', deliveryName: 'Informe Juan.pdf' }),
  ];
  const files = ['subdir::123CERT.pdf'];
  const selectedPatients = { [DNI]: { patientName: NOMBRE, files } };
  const patients = makeFilesModalPatients([{ id: 'subdir::123CERT.pdf', name: '123CERT.pdf' }]);

  it('a stamped `ref.deliveryName` with no live overrides shows as an overridden effective name (D8)', () => {
    const items = buildAttachmentRenameItems(stampedRefs, selectedPatients, patients, {}, NOMBRE, DESTINO);

    expect(items[0]).toMatchObject({
      refKey,
      storedName: '123CERT.pdf',
      effectiveName: 'Informe Juan.pdf',
      overridden: true,
      issue: null,
    });
  });

  it('a live cleared override beats the stamped value and falls back to the auto name (REQ-05)', () => {
    const items = buildAttachmentRenameItems(
      stampedRefs,
      selectedPatients,
      patients,
      { [refKey]: '' },
      NOMBRE,
      DESTINO,
    );

    expect(items[0]).toMatchObject({
      effectiveName: 'CAMO-Juan Pérez-OE-001.pdf',
      overridden: false,
      issue: null,
    });
  });

  it('a live override wins over the stamped value', () => {
    const items = buildAttachmentRenameItems(
      stampedRefs,
      selectedPatients,
      patients,
      { [refKey]: 'Nuevo nombre' },
      NOMBRE,
      DESTINO,
    );

    expect(items[0]).toMatchObject({
      effectiveName: 'Nuevo nombre.pdf',
      overridden: true,
      issue: null,
    });
  });
});

describe('buildAttachmentRenameItems — edge cases', () => {
  it('disambiguates duplicate bare basenames for one dni positionally (WU-1.4 finding)', () => {
    const dupRefs: SelectedFileRef[] = [
      makeLanRef({ idAten: 'AT-900', path: 'LOTE 01', name: 'informe.pdf' }),
      makeLanRef({ idAten: 'AT-901', path: 'LOTE 02', name: 'informe.pdf' }),
    ];
    // Wizard-style display: two bare basenames, no `path` information.
    const selected = { [DNI]: { patientName: NOMBRE, files: ['informe.pdf', 'informe.pdf'] } };

    const items = buildAttachmentRenameItems(dupRefs, selected, [], {}, NOMBRE, DESTINO);

    expect(items).toHaveLength(2);
    // First display row → first ref (AT-900), second row → second ref (AT-901).
    expect(items[0]?.refKey).toBe(`${RUC}::${DNI}::AT-900::LOTE 01::informe.pdf`);
    expect(items[1]?.refKey).toBe(`${RUC}::${DNI}::AT-901::LOTE 02::informe.pdf`);
    // Non-ready files keep the stored name as the auto preview.
    expect(items[0]?.effectiveName).toBe('informe.pdf');
    expect(items[1]?.effectiveName).toBe('informe.pdf');
  });

  it('surfaces a display row with no matching ref as a safe no-op item', () => {
    const refs: SelectedFileRef[] = [makeLanRef({ path: 'subdir', name: '123CERT.pdf' })];
    const files = ['subdir::123CERT.pdf', '::desconocido.pdf'];
    const selected = { [DNI]: { patientName: NOMBRE, files } };
    const patients = makeFilesModalPatients([{ id: 'subdir::123CERT.pdf', name: '123CERT.pdf' }]);

    const items = buildAttachmentRenameItems(refs, selected, patients, {}, NOMBRE, DESTINO);

    expect(items).toHaveLength(2);
    expect(items[0]?.refKey).toBe(`${RUC}::${DNI}::${ID_ATEN}::subdir::123CERT.pdf`);
    expect(items[1]).toMatchObject({
      refKey: null,
      displayName: 'desconocido.pdf',
      storedName: 'desconocido.pdf',
      effectiveName: 'desconocido.pdf',
      overridden: false,
      issue: null,
    });
  });

  it('returns [] for an empty selection', () => {
    const items = buildAttachmentRenameItems([], {}, [], {}, '', '');
    expect(items).toEqual([]);
  });
});
