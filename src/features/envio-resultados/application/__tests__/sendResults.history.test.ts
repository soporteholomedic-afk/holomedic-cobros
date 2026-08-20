import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { SendResultsUseCase } from '../sendResults';
import type { IEnvioHistoryRepository, IFileRepository, IEmailService } from '../../domain/ports';
import type { EnvioHistoryInsert } from '../../domain/entities';

/**
 * historial-envios-consolidados PR1 — spec "Record Every Send Attempt":
 * write-then-send ordering (INSERT `pendiente` before dispatch, UPDATE
 * status after), all four status outcomes (enviado / error+detail /
 * pendiente orphan / history failure never breaks the send), and the
 * attachment snapshot contract (storedName AND deliveryName for UNC;
 * metadata-only for local drops).
 */

type ReadFn = IFileRepository['read'];
type SendFn = IEmailService['sendWithAttachments'];
type InsertFn = IEnvioHistoryRepository['insert'];
type UpdateStatusFn = IEnvioHistoryRepository['updateStatus'];

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
  overrides: { insert?: ReturnType<typeof vi.fn<InsertFn>>; updateStatus?: ReturnType<typeof vi.fn<UpdateStatusFn>> } = {},
): IEnvioHistoryRepository {
  return {
    insert: overrides.insert ?? vi.fn<InsertFn>().mockResolvedValue('row-001'),
    updateStatus: overrides.updateStatus ?? vi.fn<UpdateStatusFn>().mockResolvedValue(undefined),
    search: vi.fn(),
    getById: vi.fn(),
  };
}

const BASE_PARAMS = {
  to: ['cliente@example.com'],
  subject: 'Resultados María',
  html: '<p>Adjuntos</p>',
  fileRefs: [
    {
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: '12345678CERT.pdf',
      nombreCompleto: 'María Quispe',
      tipoExamen: 'CAMO' as const,
    },
  ],
  nombreCompleto: 'María Quispe',
  destino: 'Proyecto Norte',
};

const CONTEXT = { sentBy: 'Dra. House', companyId: 'c-001', companyName: 'Perú Contratas S.A.' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('SendResultsUseCase — history recording (write-then-send)', () => {
  it('inserts a pendiente row (full context) BEFORE dispatch, then updates to enviado', async () => {
    const order: string[] = [];
    const insert = vi.fn<InsertFn>().mockImplementation(async () => {
      order.push('insert');
      return 'row-001';
    });
    const send = vi.fn<SendFn>().mockImplementation(async () => {
      order.push('send');
      return { success: true, messageId: '<ok@mail.com>' };
    });
    const history = makeMockHistory({ insert });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }), history);

    const result = await useCase.execute({ ...BASE_PARAMS, context: CONTEXT });

    expect(result.success).toBe(true);
    // Write-then-send ordering is normative (BR3).
    expect(order).toEqual(['insert', 'send']);
    // Insert payload: interim status + full attribution + verbatim body.
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pendiente',
        sentBy: 'Dra. House',
        companyId: 'c-001',
        companyName: 'Perú Contratas S.A.',
        destino: 'Proyecto Norte',
        nombreCompleto: 'María Quispe',
        toRecipients: ['cliente@example.com'],
        ccRecipients: [],
        subject: 'Resultados María',
        bodyHtml: '<p>Adjuntos</p>',
      }),
    );
    expect(history.updateStatus).toHaveBeenCalledWith('row-001', 'enviado', null);
  });

  it('always creates the row: no context → sentBy "sistema", empty company fields', async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), makeMockHistory({ insert }));

    await useCase.execute(BASE_PARAMS);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ sentBy: 'sistema', companyId: '', companyName: '' }),
    );
  });

  it('updates to error with the SMTP detail when dispatch fails', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: false, error: 'Connection refused' });
    const history = makeMockHistory();
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }), history);

    const result = await useCase.execute({ ...BASE_PARAMS, context: CONTEXT });

    expect(result.success).toBe(false);
    expect(history.updateStatus).toHaveBeenCalledWith('row-001', 'error', 'Connection refused');
  });

  it('updates to error when a UNC file vanishes at send time (ENOENT)', async () => {
    const read = vi
      .fn<ReadFn>()
      .mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const history = makeMockHistory();
    const useCase = new SendResultsUseCase(makeMockRepo({ read }), makeMockEmail(), history);

    const result = await useCase.execute({ ...BASE_PARAMS, context: CONTEXT });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(history.updateStatus).toHaveBeenCalledWith(
      'row-001',
      'error',
      expect.stringMatching(/File not found: 12345678CERT\.pdf/),
    );
  });

  it('leaves the pendiente orphan when the process dies between INSERT and UPDATE (crash simulation)', async () => {
    const send = vi.fn<SendFn>().mockRejectedValue(new Error('process died mid-dispatch'));
    const history = makeMockHistory();
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }), history);

    // The rejection propagates (route maps it to 500) — no final UPDATE runs.
    await expect(useCase.execute({ ...BASE_PARAMS, context: CONTEXT })).rejects.toThrow(
      /process died/,
    );

    expect(history.insert).toHaveBeenCalledTimes(1);
    expect(history.updateStatus).not.toHaveBeenCalled();
  });

  it('history insert failure does NOT break the send (D4 best-effort)', async () => {
    const insert = vi.fn<InsertFn>().mockRejectedValue(new Error('db down'));
    const history = makeMockHistory({ insert });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), history);

    const result = await useCase.execute({ ...BASE_PARAMS, context: CONTEXT });

    expect(result.success).toBe(true);
    // No recordId → no update attempted.
    expect(history.updateStatus).not.toHaveBeenCalled();
  });

  it('updateStatus failure does NOT change the send result', async () => {
    const updateStatus = vi.fn<UpdateStatusFn>().mockRejectedValue(new Error('update failed'));
    const history = makeMockHistory({ updateStatus });
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail(), history);

    const result = await useCase.execute({ ...BASE_PARAMS, context: CONTEXT });

    expect(result.success).toBe(true);
    expect(updateStatus).toHaveBeenCalledTimes(1);
  });

  it('snapshot fidelity: UNC keeps storedName AND deliveryName equal to the dispatched filename; local is metadata-only', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok>' });
    const insert = vi.fn<InsertFn>().mockResolvedValue('row-001');
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail({ send }), makeMockHistory({ insert }));

    await useCase.execute({
      ...BASE_PARAMS,
      localAttachments: [
        { filename: 'foto.png', contentType: 'image/png', content: Buffer.from('12345678') },
      ],
    });

    const payload = insert.mock.calls[0]?.[0] as EnvioHistoryInsert;
    expect(payload.attachments).toHaveLength(2);
    const unc = payload.attachments[0]!;
    expect(unc).toMatchObject({ source: 'unc', storedName: '12345678CERT.pdf' });
    if (unc.source === 'unc') {
      // Precomputed rename — identical to the dispatched attachment name.
      expect(unc.deliveryName).toBe('CAMO-María Quispe-Proyecto Norte.pdf');
    }
    expect(payload.attachments[1]).toEqual({
      source: 'local',
      storedName: 'foto.png',
      contentType: 'image/png',
      sizeBytes: 8,
    });
    // Dispatch used the SAME precomputed delivery name (D5).
    const dispatched = (send.mock.calls[0]?.[0] as { attachments: { filename: string }[] })
      .attachments;
    expect(dispatched[0]!.filename).toBe('CAMO-María Quispe-Proyecto Norte.pdf');
  });

  it('still sends unrecorded when no historyRepo is injected (legacy two-arg constructor)', async () => {
    const useCase = new SendResultsUseCase(makeMockRepo(), makeMockEmail());

    const result = await useCase.execute({ ...BASE_PARAMS, context: CONTEXT });

    expect(result.success).toBe(true);
  });
});
