import { randomUUID } from 'node:crypto';

import mssql from 'mssql';

import type { FirmaCorreo } from '../../domain/entities';
import { decodeFirma, encodeFirma } from '../../domain/firmaCodec';
import type { IFirmaRepository } from '../../domain/ports';

/**
 * Reserved area constant for per-user email-signature rows. It is
 * deliberately NOT a member of the plantillas-editor `AREA_CONFIGS`
 * registry: every registered-area template query filters
 * `WHERE area = @registeredArea`, so signature rows stored under this
 * constant are invisible to template lists, trash views, and the
 * template editor (spec `email-template-store` — isolation from
 * template lists). Verified against the live catalog at apply time
 * (task 2.1): zero existing rows used this value.
 */
export const FIRMA_STORAGE_AREA = 'firma-correo';

/** Fixed descriptor columns for the guest row in `dbo.templates`. */
const FIRMA_ROW_TYPE = 'company';
const FIRMA_ROW_NAME = 'Firma de correo';
const FIRMA_ROW_SUBJECT = '';

interface BodyHtmlRow {
  bodyHtml: string;
}

interface IdRow {
  id: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * SQL Server adapter for per-user email signatures (PR2 task 2.3).
 *
 * Signature rows are GUESTS in the existing `dbo.templates` /
 * `dbo.template_versions` schema (zero migration): the five structured
 * fields are serialized as JSON in `bodyHtml` (`encodeFirma` v:1
 * envelope), keyed by `ownerId = idUsuario` under the reserved
 * `FIRMA_STORAGE_AREA`. Unlike `SqlServerTemplateRepository` (which
 * hardcodes `ownerId = NULL`), this adapter OWNS the per-user
 * semantics: rows are upserted by (area, ownerId) and every version
 * row records `editedBy = ownerId`.
 *
 * The filtered unique default index
 * (`idx_templates_default_area_type`: `WHERE isDefault = 1 AND
 * deletedAt IS NULL`) is never triggered — signature rows always carry
 * `isDefault = 0`.
 *
 * The adapter assumes the plantillas `migrate()` has already run
 * against `pool` (the `getFirmaDb` factory does this).
 */
export class SqlServerFirmaRepository implements IFirmaRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  // --- helpers ---

  /**
   * Run a single SELECT and return the first row, or `undefined`.
   * mssql typings make `recordset[0]` a `RecordSet` which TS can't
   * safely index, so we cast through `unknown` to a known row shape —
   * the SQL and the row type are coupled by the same author.
   */
  private async fetchOne<T>(sql: string, inputs: Record<string, unknown>): Promise<T | undefined> {
    const request = this.pool.request();
    for (const [name, value] of Object.entries(inputs)) {
      request.input(name, value);
    }
    const result = await request.query(sql);
    const rows = result.recordset as unknown as T[];
    return rows[0];
  }

  /**
   * Run `fn` inside an `mssql.Transaction`. On success, the transaction
   * commits; on throw, it rolls back and the original error rethrows.
   * The ROLLBACK is best-effort — if the connection is already broken
   * we swallow the secondary error so the original cause surfaces.
   */
  private async withTransaction<T>(fn: (tx: mssql.Transaction) => Promise<T>): Promise<T> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // The transaction may already be in a broken state; the rethrow
        // is what matters. Swallow the rollback error so the original
        // cause surfaces cleanly.
      }
      throw err;
    }
  }

  /** Build a `request` against an active transaction. */
  private txRequest(tx: mssql.Transaction): mssql.Request {
    return new mssql.Request(tx);
  }

  // --- IFirmaRepository ---

  async getOwnFirma(ownerId: string): Promise<FirmaCorreo | null> {
    const row = await this.fetchOne<BodyHtmlRow>(
      `SELECT TOP 1 bodyHtml
         FROM dbo.templates
        WHERE area = @area AND ownerId = @ownerId AND deletedAt IS NULL
        ORDER BY updatedAt DESC`,
      { area: FIRMA_STORAGE_AREA, ownerId },
    );
    // Unparsable or stale-rule JSON → null = no signature (TM6).
    return row ? decodeFirma(row.bodyHtml) : null;
  }

  async saveOwnFirma(ownerId: string, firma: FirmaCorreo): Promise<void> {
    const bodyHtml = encodeFirma(firma);
    const now = nowIso();
    await this.withTransaction(async (tx) => {
      // Upsert lookup INSIDE the transaction so two concurrent
      // first-saves serialize instead of double-inserting.
      const req = this.txRequest(tx);
      req.input('area', FIRMA_STORAGE_AREA);
      req.input('ownerId', ownerId);
      const lookup = await req.query(
        `SELECT TOP 1 id
           FROM dbo.templates
          WHERE area = @area AND ownerId = @ownerId AND deletedAt IS NULL
          ORDER BY updatedAt DESC`,
      );
      const existing = (lookup.recordset as unknown as IdRow[])[0];

      const versionId = randomUUID();
      // First save mints a new row id; re-save reuses the looked-up one.
      const templateId = existing ? existing.id : randomUUID();

      if (!existing) {
        // FIRST SAVE — insert the signature snapshot + its first
        // version row in one transaction so the pair never lands
        // half-applied. `isDefault = 0` keeps the filtered unique
        // default index out of the way; `subject` is an empty
        // placeholder (signatures have no subject).
        const insReq = this.txRequest(tx);
        insReq.input('id', templateId);
        insReq.input('area', FIRMA_STORAGE_AREA);
        insReq.input('type', FIRMA_ROW_TYPE);
        insReq.input('name', FIRMA_ROW_NAME);
        insReq.input('subject', FIRMA_ROW_SUBJECT);
        insReq.input('bodyHtml', bodyHtml);
        insReq.input('isDefault', 0);
        insReq.input('ownerId', ownerId);
        insReq.input('versionId', versionId);
        insReq.input('now', now);
        await insReq.query(
          `INSERT INTO dbo.templates
             (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
           VALUES
             (@id, @area, @type, @name, @subject, @bodyHtml, @isDefault, @versionId, NULL, @now, @now, @ownerId)`,
        );
      } else {
        // RE-SAVE — refresh the snapshot in place (upsert keeps a
        // single row per user) and point it at the new version. The
        // `ownerId` predicate re-asserts row ownership on the write.
        const updReq = this.txRequest(tx);
        updReq.input('bodyHtml', bodyHtml);
        updReq.input('versionId', versionId);
        updReq.input('now', now);
        updReq.input('id', existing.id);
        updReq.input('ownerId', ownerId);
        await updReq.query(
          `UPDATE dbo.templates
             SET bodyHtml = @bodyHtml,
                 currentVersionId = @versionId,
                 updatedAt = @now
           WHERE id = @id AND ownerId = @ownerId`,
        );
      }

      // Append-only version history — the same statement serves both
      // paths; `editedBy` records the OWNER (unlike the template
      // adapter, which writes NULL — per-user semantics are ours).
      const verReq = this.txRequest(tx);
      verReq.input('versionId', versionId);
      verReq.input('templateId', templateId);
      verReq.input('subject', FIRMA_ROW_SUBJECT);
      verReq.input('bodyHtml', bodyHtml);
      verReq.input('now', now);
      verReq.input('editedBy', ownerId);
      await verReq.query(
        `INSERT INTO dbo.template_versions
           (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
         VALUES
           (@versionId, @templateId, @subject, @bodyHtml, @now, @editedBy)`,
      );
    });
  }
}
