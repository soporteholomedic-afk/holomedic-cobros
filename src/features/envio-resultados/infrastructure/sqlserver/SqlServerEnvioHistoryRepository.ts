import { randomUUID } from 'node:crypto';
import type * as mssql from 'mssql';
import { normalizeSearchText } from '@/lib/normalize-search-text';
import type {
  EnvioAttachmentSnapshot,
  EnvioHistoryInsert,
  EnvioHistoryRow,
  EnvioHistorySummary,
  EnvioSearchQuery,
  EnvioSearchResult,
  EnvioSendStatus,
} from '../../domain/entities';
import type { IEnvioHistoryRepository } from '../../domain/ports';

/** Hard cap matching the `NVARCHAR(4000)` search columns (see migrate.ts). */
const MAX_SEARCH_COL_LENGTH = 4000;

function clampSearchColumn(value: string): string {
  return value.length > MAX_SEARCH_COL_LENGTH ? value.slice(0, MAX_SEARCH_COL_LENGTH) : value;
}

type UncSnapshot = Extract<EnvioAttachmentSnapshot, { source: 'unc' }>;

/**
 * Compute the precomputed accent-stripped lowercase search columns for
 * an insert. The query side (PR2) normalizes the user term with the
 * same `normalizeSearchText`, so stored "Perú" matches "peru" and
 * vice versa regardless of collation.
 */
export function computeSearchColumns(input: EnvioHistoryInsert): {
  searchRecipients: string;
  searchCompany: string;
  searchSubject: string;
  searchPatients: string;
} {
  const recipients = [...input.toRecipients, ...input.ccRecipients].join(' ');
  const patients = input.attachments
    .filter((a): a is UncSnapshot => a.source === 'unc')
    .map((a) => `${a.dni} ${a.nombreCompleto ?? ''}`.trim())
    .join(' ');
  return {
    searchRecipients: clampSearchColumn(normalizeSearchText(recipients)),
    searchCompany: clampSearchColumn(normalizeSearchText(input.companyName)),
    searchSubject: clampSearchColumn(normalizeSearchText(input.subject)),
    searchPatients: clampSearchColumn(normalizeSearchText(patients)),
  };
}

function toDateIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function parseJsonArray<T>(raw: unknown): T[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

/** Map a raw SQL row to the full `EnvioHistoryRow` (Date→ISO, JSON columns parsed). */
export function rowToEnvioHistoryRow(row: Record<string, unknown>): EnvioHistoryRow {
  return {
    id: str(row.id),
    sentAt: toDateIso(row.sentAt),
    status: (str(row.status) || 'pendiente') as EnvioSendStatus,
    errorDetail: row.errorDetail == null ? null : String(row.errorDetail),
    sentBy: str(row.sentBy),
    destino: str(row.destino),
    companyId: str(row.companyId),
    companyName: str(row.companyName),
    nombreCompleto: str(row.nombreCompleto),
    toRecipients: parseJsonArray<string>(row.toRecipients),
    ccRecipients: parseJsonArray<string>(row.ccRecipients),
    subject: str(row.subject),
    bodyHtml: str(row.bodyHtml),
    attachments: parseJsonArray<EnvioAttachmentSnapshot>(row.attachmentsJson),
  };
}

/** Map a raw SQL row to the list summary (drops `bodyHtml` — never leaves the repository on searches). */
export function rowToEnvioHistorySummary(row: Record<string, unknown>): EnvioHistorySummary {
  const { bodyHtml: _dropped, ...summary } = rowToEnvioHistoryRow(row);
  void _dropped;
  return summary;
}

/**
 * Primary adapter for `IEnvioHistoryRepository` over the `HOLOMEDIC`
 * SQL Server pool, following the template-repository conventions
 * (parameterized `request.input`, `rowTo` mappers, no stored
 * procedures).
 *
 * PR1 ships the WRITE path (`insert` + `updateStatus`). The read path
 * (`search` + `getById`) lands in PR2 — the interim methods throw so
 * an accidental early caller fails loudly instead of silently
 * returning empty history.
 */
export class SqlServerEnvioHistoryRepository implements IEnvioHistoryRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async insert(input: EnvioHistoryInsert): Promise<string> {
    const id = randomUUID();
    const search = computeSearchColumns(input);
    const result = await this.pool
      .request()
      .input('id', id)
      .input('status', input.status)
      .input('sentBy', input.sentBy)
      .input('destino', input.destino)
      .input('companyId', input.companyId)
      .input('companyName', input.companyName)
      .input('nombreCompleto', input.nombreCompleto)
      .input('toRecipients', JSON.stringify(input.toRecipients))
      .input('ccRecipients', JSON.stringify(input.ccRecipients))
      .input('subject', input.subject)
      .input('bodyHtml', input.bodyHtml)
      .input('attachmentsJson', JSON.stringify(input.attachments))
      .input('searchRecipients', search.searchRecipients)
      .input('searchCompany', search.searchCompany)
      .input('searchSubject', search.searchSubject)
      .input('searchPatients', search.searchPatients)
      .query(`
        INSERT INTO dbo.envios_consolidados (
          id, status, sentBy, destino, companyId, companyName, nombreCompleto,
          toRecipients, ccRecipients, subject, bodyHtml, attachmentsJson,
          searchRecipients, searchCompany, searchSubject, searchPatients
        )
        OUTPUT INSERTED.id AS id
        VALUES (
          @id, @status, @sentBy, @destino, @companyId, @companyName, @nombreCompleto,
          @toRecipients, @ccRecipients, @subject, @bodyHtml, @attachmentsJson,
          @searchRecipients, @searchCompany, @searchSubject, @searchPatients
        );`);
    return String(result.recordset?.[0]?.id ?? id);
  }

  async updateStatus(
    id: string,
    status: EnvioSendStatus,
    errorDetail: string | null = null,
  ): Promise<void> {
    await this.pool
      .request()
      .input('id', id)
      .input('status', status)
      .input('errorDetail', errorDetail)
      .query(
        'UPDATE dbo.envios_consolidados SET status = @status, errorDetail = @errorDetail WHERE id = @id;',
      );
  }

  async search(_query: EnvioSearchQuery): Promise<EnvioSearchResult> {
    void _query;
    // Read path lands in PR2 (task 2.1) — write path ships first.
    throw new Error('SqlServerEnvioHistoryRepository.search is not implemented until PR2 (read path)');
  }

  async getById(_id: string): Promise<EnvioHistoryRow | null> {
    void _id;
    throw new Error('SqlServerEnvioHistoryRepository.getById is not implemented until PR2 (read path)');
  }
}
