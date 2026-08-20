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

/** Fixed page size for the history buscador (design: OFFSET/FETCH 20). */
export const ENVIO_HISTORY_PAGE_SIZE = 20;

function clampSearchColumn(value: string): string {
  return value.length > MAX_SEARCH_COL_LENGTH ? value.slice(0, MAX_SEARCH_COL_LENGTH) : value;
}

/**
 * Escape the T-SQL LIKE wildcards (`%`, `_`, `[`) plus the escape
 * character itself so a user term matches literally inside a
 * `LIKE @pattern ESCAPE '\'` predicate (SQL-injection safe: the term
 * is bound as a parameter, never interpolated).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_[\[]/g, (ch) => `\\${ch}`);
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
 * Write path (PR1): `insert` + `updateStatus` back the write-then-send
 * recording. Read path (PR2): `search` + `getById` back the history
 * buscador API — summaries never select `bodyHtml` (off-row LOB,
 * PK-seek only).
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

  async search(query: EnvioSearchQuery): Promise<EnvioSearchResult> {
    const page = Math.max(1, Math.floor(query.page));
    // Identical WHERE for the page query and the twin COUNT — one
    // builder so the two can never drift apart.
    const where: string[] = ['1 = 1'];
    const params: Record<string, unknown> = {
      offset: (page - 1) * ENVIO_HISTORY_PAGE_SIZE,
      pageSize: ENVIO_HISTORY_PAGE_SIZE,
    };

    const q = query.q?.trim();
    if (q) {
      // Both sides in the same canonical space: the stored columns are
      // normalized at write time (computeSearchColumns), the term here.
      params.pattern = `%${escapeLikePattern(normalizeSearchText(q))}%`;
      const like = "LIKE @pattern ESCAPE '\\'";
      where.push(
        `(searchRecipients ${like} OR searchCompany ${like} OR searchSubject ${like} OR searchPatients ${like})`,
      );
    }
    // Inclusive end day: everything before midnight of the NEXT day.
    if (query.fechaInicio) {
      params.fechaInicio = query.fechaInicio;
      where.push('sentAt >= @fechaInicio');
    }
    if (query.fechaFin) {
      params.fechaFin = query.fechaFin;
      where.push('sentAt < DATEADD(DAY, 1, @fechaFin)');
    }
    const whereSql = where.join('\n      AND ');

    const bind = (request: mssql.Request): mssql.Request => {
      for (const [name, value] of Object.entries(params)) request.input(name, value);
      return request;
    };

    const pageResult = await bind(this.pool.request()).query(`
      SELECT id, sentAt, status, errorDetail, sentBy, destino, companyId, companyName,
             nombreCompleto, toRecipients, ccRecipients, subject, attachmentsJson
      FROM dbo.envios_consolidados
      WHERE ${whereSql}
      ORDER BY sentAt DESC, id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);

    const countResult = await bind(this.pool.request()).query(`
      SELECT COUNT(*) AS total
      FROM dbo.envios_consolidados
      WHERE ${whereSql};`);

    return {
      rows: (pageResult.recordset ?? []).map((row) => rowToEnvioHistorySummary(row as Record<string, unknown>)),
      total: Number(countResult.recordset?.[0]?.total ?? 0),
      page,
    };
  }

  async getById(id: string): Promise<EnvioHistoryRow | null> {
    const result = await this.pool
      .request()
      .input('id', id)
      .query(`
        SELECT id, sentAt, status, errorDetail, sentBy, destino, companyId, companyName,
               nombreCompleto, toRecipients, ccRecipients, subject, bodyHtml, attachmentsJson
        FROM dbo.envios_consolidados
        WHERE id = @id;`);
    const row = result.recordset?.[0];
    return row ? rowToEnvioHistoryRow(row as Record<string, unknown>) : null;
  }
}
