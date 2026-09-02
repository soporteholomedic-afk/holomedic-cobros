import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { SendResultsUseCase } from '../sendResults';
import type { IEnvioHistoryRepository, IFileRepository, IEmailService } from '../../domain/ports';
import type { EnvioHistoryInsert, SelectedFileRef } from '../../domain/entities';

/**
 * WU-3 (REQ-04/06/07 + design D6/D7) — operator delivery-name overrides
 * in the send pipeline:
 *
 * - REQ-04: precedence — the override wins over the auto rename; the
 *   snapshot records `deliveryName` (effective) AND `storedName` (disk).
 * - D7: overrides are validated BEFORE the history INSERT — an invalid
 *   override returns VALIDATION_ERROR (route → HTTP 400) with NO row,
 *   NO file I/O and NO email dispatch (a typo is input validation).
 * - D6: only override-involved collisions are rejected; auto-auto
 *   duplicates still send (legacy same-name batches keep working).
 * - REQ-06: the disk file is read by its STORED name and the html body
 *   (`{{archivos}}` tokens included) passes through verbatim.
 * - REQ-07: legacy payloads without `deliveryName` behave exactly as
 *   the pre-feature auto pipeline.
 */

// ---- Test doubles (same conventions as sendResults.history.test.ts) ----

type ReadFn = IFileRepository['read'];
type SendFn = IEmailService['sendWithAttachments'];
type InsertFn = IEnvioHistoryRepository['insert'];

const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n');

function makeMockRepo(overrides: { read?: ReturnType<typeof vi.fn<ReadFn>> } = {}): IFileRepository {
  const readFn: ReturnType<typeof vi.fn<ReadFn>> =
    overrides.read ?? vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
  return { listFolder: vi.fn().mockResolvedValue([]), read: readFn as unknown as ReadFn };
}

function makeMockEmail(overrides: { send?: ReturnType<typeof vi.fn<SendFn>> } = {}): IEmailService {
  const sendFn: ReturnType<typeof vi.fn<SendFn>> =
    overrides.send ?? vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok@mail.com>' });
  return { sendWithAttachments: sendFn as unknown as SendFn };
}

function makeMockHistory(
  overrides: { insert?: ReturnType<typeof vi.fn<InsertFn>> } = {},
): IEnvioHistoryRepository {
  return {
    insert: overrides.insert ?? vi.fn<InsertFn>().mockResolvedValue('row-001'),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(),
    getById: vi.fn(),
  };
}

/** Ready-to-send file: auto name is `CAMO-María Quispe-Proyecto Norte.pdf`. */
const READY_REF: SelectedFileRef = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  path: 'LEGAJOS',
  name: '12345678CERT.pdf',
  nombreCompleto: 'María Quispe',
  tipoExamen: 'CAMO',
};

/** CLI generated certificate: auto name is `CAMO_María Quispe.pdf`. */
const CERT_REF: SelectedFileRef = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-002',
  path: 'LEGAJOS',
  name: '75618561_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
  nombreCompleto: 'María Quispe',
};

/** Plain LAN file: NOT a ready file, NOT a generated certificate. */
const PLAIN_REF: SelectedFileRef = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-003',
  path: 'ANTIGUOS',
  name: 'notas.txt',
};

const READY_AUTO = 'CAMO-María Quispe-Proyecto Norte.pdf';
const CERT_AUTO = 'CAMO_María Quispe.pdf';

const BASE_PARAMS = {
  to: ['cliente@example.com'],
  subject: 'Resultados María',
  html: '<p>Adjuntos</p>',
  fileRefs: [READY_REF],
  nombreCompleto: 'María Quispe',
  destino: 'Proyecto Norte',
};

/** `callIndex` selects among sequential executes within one test. */
function dispatchedFilenames(send: ReturnType<typeof vi.fn<SendFn>>, callIndex = 0): string[] {
  const call = send.mock.calls[callIndex]?.[0] as { attachments: { filename: string }[] } | undefined;
  return call ? call.attachments.map((a) => a.filename) : [];
}

function snapshotUnc(insert: ReturnType<typeof vi.fn<InsertFn>>): EnvioHistoryInsert['attachments'] {
  const payload = insert.mock.calls[0]?.[0] as EnvioHistoryInsert | undefined;
  return payload ? payload.attachments : [];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ================================================================
// REQ-04 — precedence and snapshot persistence
// ================================================================

describe('SendResultsUseCase — delivery override precedence (REQ-04)', () => {
  it('override wins: dispatched filename AND snapshot deliveryName carry the override; storedName keeps the disk name', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }), makeMockHistory({ insert }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'Informe Juan.pdf' }],
    });

    expect(result.success).toBe(true);
    expect(dispatchedFilenames(send)).toEqual(['Informe Juan.pdf']);

    const unc = snapshotUnc(insert)[0];
    expect(unc).toMatchObject({ source: 'unc', storedName: '12345678CERT.pdf' });
    if (unc?.source === 'unc') {
      expect(unc.deliveryName).toBe('Informe Juan.pdf');
    }
  });

  it('missing `.pdf` is appended for a ready file; an explicit `.pdf` (any case) is kept verbatim', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }));

    const r1 = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'Informe Juan' }],
    });
    expect(r1.success).toBe(true);
    expect(dispatchedFilenames(send)[0]).toBe('Informe Juan.pdf');

    const r2 = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'INFORME JUAN.PDF' }],
    });
    expect(r2.success).toBe(true);
    expect(dispatchedFilenames(send, 1)).toEqual(['INFORME JUAN.PDF']);
  });

  it('forcePdf is scoped to the auto-rename pipeline (D5): a plain LAN file keeps a non-pdf override', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...PLAIN_REF, deliveryName: 'Informe Juan' }],
    });

    expect(result.success).toBe(true);
    expect(dispatchedFilenames(send)).toEqual(['Informe Juan']);
  });

  it('generated certificates honor the same override rules (forcePdf via looksLikeGeneratedCertificate)', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...CERT_REF, deliveryName: 'Certificado Juan' }],
    });

    expect(result.success).toBe(true);
    expect(dispatchedFilenames(send)).toEqual(['Certificado Juan.pdf']);
  });
});

// ================================================================
// REQ-03 / D7 — server-side validation BEFORE the history INSERT
// ================================================================

describe('SendResultsUseCase — override validation rejects pre-INSERT (D7)', () => {
  it('traversal override → VALIDATION_ERROR naming the file; NO history row, NO email, NO file read', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const read = vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
    const useCase = new SendResultsUseCase(makeMockRepo({ read }), makeMockEmail({ send }), makeMockHistory({ insert }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: '../../evil.pdf' }],
    });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(result.success === false && result.error).toContain('12345678CERT.pdf');
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('illegal-character override → VALIDATION_ERROR, no row', async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), makeMockHistory({ insert }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'Informe<n>.pdf' }],
    });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('non-pdf extension on a ready file → VALIDATION_ERROR, no row', async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), makeMockHistory({ insert }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'Informe Juan.txt' }],
    });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('override longer than 255 final chars → VALIDATION_ERROR, no row', async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), makeMockHistory({ insert }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'a'.repeat(256) }],
    });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('empty/whitespace override falls back to the auto name (no rejection, row created)', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }), makeMockHistory({ insert }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: '   ' }],
    });

    expect(result.success).toBe(true);
    expect(dispatchedFilenames(send)).toEqual([READY_AUTO]);
    expect(insert).toHaveBeenCalledTimes(1);
    const unc = snapshotUnc(insert)[0];
    if (unc?.source === 'unc') {
      expect(unc.deliveryName).toBe(READY_AUTO);
    }
  });
});

// ================================================================
// D6 — only override-involved collisions are rejected
// ================================================================

describe('SendResultsUseCase — batch collision policy (D6)', () => {
  it('auto-auto duplicate names (no overrides anywhere) still send', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }));

    const refs: SelectedFileRef[] = [
      { ...PLAIN_REF, idAten: 'AT-003' },
      { ...PLAIN_REF, idAten: 'AT-004', path: 'OTROS' },
    ];
    const result = await useCase.execute({ ...BASE_PARAMS, fileRefs: refs });

    expect(result.success).toBe(true);
    expect(dispatchedFilenames(send)).toEqual(['notas.txt', 'notas.txt']);
  });

  it('duplicate effective name involving an override → VALIDATION_ERROR, no row', async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), makeMockHistory({ insert }));

    const refs: SelectedFileRef[] = [
      { ...PLAIN_REF, idAten: 'AT-003' }, // auto name: notas.txt
      { ...PLAIN_REF, idAten: 'AT-004', path: 'OTROS', deliveryName: 'notas.txt' }, // override collides
    ];
    const result = await useCase.execute({ ...BASE_PARAMS, fileRefs: refs });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(result.success === false && result.error).toContain('notas.txt');
    expect(insert).not.toHaveBeenCalled();
  });

  it('override duplicates are detected case-insensitively (Windows share semantics)', async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), makeMockHistory({ insert }));

    const refs: SelectedFileRef[] = [
      { ...READY_REF, deliveryName: 'Informe.pdf' },
      { ...CERT_REF, deliveryName: 'INFORME.PDF' },
    ];
    const result = await useCase.execute({ ...BASE_PARAMS, fileRefs: refs });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(insert).not.toHaveBeenCalled();
  });
});

// ================================================================
// REQ-06 — scope exclusions
// ================================================================

describe('SendResultsUseCase — override scope exclusions (REQ-06)', () => {
  it('the disk file is read by its STORED name even when the delivery name is overridden', async () => {
    const read = vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
    const useCase = new SendResultsUseCase(makeMockRepo({ read }), makeMockEmail());

    await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'Informe Juan.pdf' }],
    });

    expect(read).toHaveBeenCalledWith('20123456789', '12345678', 'AT-001', 'LEGAJOS', '12345678CERT.pdf');
  });

  it('the html body passes through verbatim — {{archivos}} tokens are never rewritten by overrides', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }));

    await useCase.execute({
      ...BASE_PARAMS,
      html: '<p>Archivos: {{archivos}}</p>',
      fileRefs: [{ ...READY_REF, deliveryName: 'Informe Juan.pdf' }],
    });

    const call = send.mock.calls[0]?.[0] as { html: string } | undefined;
    expect(call?.html).toBe('<p>Archivos: {{archivos}}</p>');
  });
});

// ================================================================
// REQ-07 — legacy payloads without deliveryName behave exactly as today
// ================================================================

describe('SendResultsUseCase — legacy compatibility (REQ-07)', () => {
  it('no deliveryName anywhere: dispatched AND snapshot names equal the pre-feature auto pipeline', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }), makeMockHistory({ insert }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [READY_REF, CERT_REF],
    });

    expect(result.success).toBe(true);
    expect(dispatchedFilenames(send)).toEqual([READY_AUTO, CERT_AUTO]);

    const attachments = snapshotUnc(insert);
    expect(attachments.map((a) => (a.source === 'unc' ? a.deliveryName : ''))).toEqual([
      READY_AUTO,
      CERT_AUTO,
    ]);
    expect(attachments.map((a) => (a.source === 'unc' ? a.storedName : ''))).toEqual([
      '12345678CERT.pdf',
      CERT_REF.name,
    ]);
  });

  it('refs WITH deliveryName alongside legacy refs: only the overridden file changes', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }));

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...READY_REF, deliveryName: 'Informe Juan.pdf' }, CERT_REF],
    });

    expect(result.success).toBe(true);
    expect(dispatchedFilenames(send)).toEqual(['Informe Juan.pdf', CERT_AUTO]);
  });
});
