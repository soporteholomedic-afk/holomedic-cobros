import { describe, it, expect } from 'vitest';
import { buildReenvioViewData } from '../buildReenvioViewData';
import {
  buildSignatureHtml,
  DEFAULT_SIGNATURE_DATA,
  stripSignatureHtml,
} from '../signatureData';
import type { EnvioHistoryRow } from '../../../domain/entities';

// historial-envios-consolidados PR4 (task 4.3, design OQ6) — the
// persisted row → EmailEditor payload mapper for the reenvío flow.

function makeRow(overrides: Partial<EnvioHistoryRow> = {}): EnvioHistoryRow {
  return {
    id: 'env-001',
    sentAt: '2026-08-20T15:30:00.000Z',
    status: 'enviado',
    errorDetail: null,
    sentBy: 'Ana Prueba',
    destino: 'PROYECTO NORTE',
    companyId: 'comp-001',
    companyName: 'Holomedic S.A.C.',
    nombreCompleto: 'María Elena García López',
    toRecipients: ['destino@empresa.com', 'segundo@empresa.com'],
    ccRecipients: ['copia@empresa.com'],
    subject: 'Resultados consolidados',
    bodyHtml: '<p>Cuerpo original</p>',
    attachments: [],
    ...overrides,
  };
}

describe('buildReenvioViewData', () => {
  it('maps unc attachments to SelectedFileRef (name = storedName) carrying rename-fidelity fields, grouped by dni', () => {
    const row = makeRow({
      attachments: [
        {
          source: 'unc',
          ruc: '20123456789',
          dni: '12345678',
          idAten: 'AT-001',
          path: 'LEGAJOS',
          storedName: '12345678CERT.pdf',
          deliveryName: 'CAMO-María Elena García López-PROYECTO NORTE.pdf',
          tipoExamen: 'CAMO',
          nombreCompleto: 'María Elena García López',
        },
        {
          source: 'unc',
          ruc: '20123456789',
          dni: '12345678',
          idAten: 'AT-001',
          path: '',
          storedName: '12345678EXPED.pdf',
          deliveryName: 'EMO-María Elena García López-PROYECTO NORTE.pdf',
        },
      ],
    });

    const { emailViewData } = buildReenvioViewData(row);

    // fileRefs: storedName becomes the ref name; rename fidelity fields
    // survive so renameReadyFile reproduces the delivery names.
    expect(emailViewData.fileRefs).toHaveLength(2);
    expect(emailViewData.fileRefs[0]).toEqual({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: '12345678CERT.pdf',
      tipoExamen: 'CAMO',
      nombreCompleto: 'María Elena García López',
    });
    expect(emailViewData.fileRefs[1]).toEqual({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: '',
      name: '12345678EXPED.pdf',
    });

    // selectedPatients keyed by dni; files are `path::storedName` refs.
    expect(emailViewData.selectedPatients['12345678']).toEqual({
      patientName: 'María Elena García López',
      files: ['LEGAJOS::12345678CERT.pdf', '::12345678EXPED.pdf'],
    });

    // patients mirror the splitFileRef contract: PatientFile.id = ref string.
    expect(emailViewData.patients).toHaveLength(1);
    expect(emailViewData.patients[0]).toMatchObject({
      id: '12345678',
      dni: '12345678',
      companyId: 'comp-001',
      name: 'María Elena García López',
    });
    expect(emailViewData.patients[0].files.map((f) => f.id)).toEqual([
      'LEGAJOS::12345678CERT.pdf',
      '::12345678EXPED.pdf',
    ]);
  });

  it('groups unc attachments by dni across multiple patients', () => {
    const row = makeRow({
      nombreCompleto: '',
      attachments: [
        { source: 'unc', ruc: 'R1', dni: '11111111', idAten: 'A1', path: '', storedName: 'f1.pdf', deliveryName: 'f1.pdf', nombreCompleto: 'Primero Paciente' },
        { source: 'unc', ruc: 'R2', dni: '22222222', idAten: 'A2', path: 'X', storedName: 'f2.pdf', deliveryName: 'f2.pdf', nombreCompleto: 'Segunda Paciente' },
        { source: 'unc', ruc: 'R2', dni: '22222222', idAten: 'A2', path: 'X', storedName: 'f3.pdf', deliveryName: 'f3.pdf', nombreCompleto: 'Segunda Paciente' },
      ],
    });

    const { emailViewData } = buildReenvioViewData(row);

    expect(Object.keys(emailViewData.selectedPatients).sort()).toEqual(['11111111', '22222222']);
    expect(emailViewData.selectedPatients['22222222'].files).toEqual(['X::f2.pdf', 'X::f3.pdf']);
    expect(emailViewData.patients).toHaveLength(2);
    expect(emailViewData.fileRefs).toHaveLength(3);
  });

  it('excludes local attachments from fileRefs and surfaces them as unavailableAttachments only (BR11)', () => {
    const row = makeRow({
      attachments: [
        { source: 'local', storedName: 'informe-local.pdf', contentType: 'application/pdf', sizeBytes: 2048 },
        { source: 'unc', ruc: 'R1', dni: '12345678', idAten: 'A1', path: '', storedName: 'cert.pdf', deliveryName: 'cert.pdf' },
      ],
    });

    const { emailViewData, unavailableAttachments } = buildReenvioViewData(row);

    expect(emailViewData.fileRefs).toHaveLength(1);
    expect(emailViewData.fileRefs[0]?.name).toBe('cert.pdf');
    expect(unavailableAttachments).toEqual([
      { filename: 'informe-local.pdf', contentType: 'application/pdf', sizeBytes: 2048 },
    ]);
  });

  it('selectedPatients is never absent — an empty object for local-only rows', () => {
    const row = makeRow({
      attachments: [
        { source: 'local', storedName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1 },
      ],
    });

    const { emailViewData } = buildReenvioViewData(row);

    expect(emailViewData.selectedPatients).toEqual({});
    expect(emailViewData.patients).toEqual([]);
    expect(emailViewData.fileRefs).toEqual([]);
  });

  it('round-trips the persisted signature: initialEmail.bodyHtml strips back to the body and re-appends verbatim (D8)', () => {
    const body = '<p>Cuerpo original</p>';
    const row = makeRow({
      bodyHtml: body + buildSignatureHtml(DEFAULT_SIGNATURE_DATA),
    });

    const { initialEmail } = buildReenvioViewData(row);

    // The helper carries the persisted body verbatim; the editor-side
    // seed strips it — the round-trip through the seam must be exact.
    expect(initialEmail.bodyHtml).toBe(row.bodyHtml);
    expect(stripSignatureHtml(initialEmail.bodyHtml)).toBe(body);
    expect(stripSignatureHtml(initialEmail.bodyHtml) + buildSignatureHtml(DEFAULT_SIGNATURE_DATA)).toBe(row.bodyHtml);
  });

  it('threads row context: recipients, subject and rename inputs', () => {
    const row = makeRow();

    const { emailViewData, initialEmail } = buildReenvioViewData(row);

    expect(emailViewData.companyId).toBe('comp-001');
    expect(emailViewData.companyName).toBe('Holomedic S.A.C.');
    expect(emailViewData.destino).toBe('PROYECTO NORTE');
    expect(emailViewData.nombreCompleto).toBe('María Elena García López');
    expect(initialEmail.to).toBe('destino@empresa.com, segundo@empresa.com');
    expect(initialEmail.cc).toBe('copia@empresa.com');
    expect(initialEmail.subject).toBe('Resultados consolidados');
  });

  it('omits cc when the original send had none', () => {
    const { initialEmail } = buildReenvioViewData(makeRow({ ccRecipients: [] }));
    expect(initialEmail.cc).toBeUndefined();
  });
});
