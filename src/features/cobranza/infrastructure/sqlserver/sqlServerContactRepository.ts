import type * as mssql from 'mssql';

import type { EmpresaContacto, SaveContactInput } from '../../domain/entities';
import type { ICompanyContactRepository } from '../../domain/ports';

import { ContactConflictError, isUniqueViolation } from './errors';

/**
 * Raw `dbo.EmpresaContactos` row shape as returned by mssql.
 * `updatedAt` is a `DATETIME2(3)` column that comes back as a JS
 * `Date` and is converted to an ISO string at the boundary so the
 * entity contract stays string-based (template-repository precedent).
 */
interface ContactRow {
  ruc: string;
  razonSocial: string;
  emailPrincipal: string;
  emailCopia: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Convert a `Date` to an ISO-8601 string (with milliseconds). */
function dateToIso(value: Date): string {
  return value.toISOString();
}

/** Map a `dbo.EmpresaContactos` row to the `EmpresaContacto` entity. */
function rowToContact(row: ContactRow): EmpresaContacto {
  return {
    ruc: row.ruc,
    razonSocial: row.razonSocial,
    emailPrincipal: row.emailPrincipal,
    emailCopia: row.emailCopia,
    updatedAt: dateToIso(row.updatedAt),
    updatedBy: row.updatedBy,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * SQL Server adapter for the cobranza contact directory. Implements
 * the `ICompanyContactRepository` port against the `HOLOMEDIC`
 * database.
 *
 * The upsert is idempotent without MERGE (design D5): a single
 * parameterized batch runs `UPDATE … WHERE ruc = @ruc; IF @@ROWCOUNT
 * = 0 INSERT …` so a repeat call with identical data updates the one
 * existing row — never a duplicate. `updatedAt` is stamped app-side
 * as an ISO string (sqlServerTemplateRepository precedent) and
 * `updatedBy` arrives from the route (session user). A concurrent
 * first-insert race raises SQL Server 2601/2627, which is mapped to
 * `ContactConflictError` for the route's 409.
 *
 * The adapter assumes `migrate()` has already been run against `pool`
 * (the factory in `getContactDb` does this).
 */
export class SqlServerContactRepository implements ICompanyContactRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  /**
   * Run a statement with bound `@`-parameters. Values travel through
   * `request().input()` — never interpolated into the SQL text.
   */
  private async runQuery(
    sql: string,
    inputs: Record<string, unknown>,
  ): Promise<mssql.IResult<unknown>> {
    const request = this.pool.request();
    for (const [name, value] of Object.entries(inputs)) {
      request.input(name, value as mssql.ISqlType);
    }
    return request.query(sql);
  }

  async getByRuc(ruc: string): Promise<EmpresaContacto | null> {
    const result = await this.runQuery(
      `SELECT ruc, razonSocial, emailPrincipal, emailCopia, updatedAt, updatedBy
         FROM dbo.EmpresaContactos
        WHERE ruc = @ruc`,
      { ruc },
    );
    // mssql typings make `recordset` hard to index; the SQL and the
    // row type are coupled by the same author (template-repo pattern).
    const rows = result.recordset as unknown as ContactRow[];
    const row = rows[0];
    return row ? rowToContact(row) : null;
  }

  async upsert(input: SaveContactInput): Promise<EmpresaContacto> {
    const updatedAt = nowIso();
    try {
      await this.runQuery(
        `UPDATE dbo.EmpresaContactos
            SET razonSocial = @razonSocial,
                emailPrincipal = @emailPrincipal,
                emailCopia = @emailCopia,
                updatedAt = @updatedAt,
                updatedBy = @updatedBy
          WHERE ruc = @ruc;
         IF @@ROWCOUNT = 0
           INSERT INTO dbo.EmpresaContactos
             (ruc, razonSocial, emailPrincipal, emailCopia, updatedAt, updatedBy)
           VALUES
             (@ruc, @razonSocial, @emailPrincipal, @emailCopia, @updatedAt, @updatedBy);`,
        {
          ruc: input.ruc,
          razonSocial: input.razonSocial,
          emailPrincipal: input.emailPrincipal,
          emailCopia: input.emailCopia,
          updatedAt,
          updatedBy: input.updatedBy,
        },
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ContactConflictError();
      }
      throw err;
    }
    const saved = await this.getByRuc(input.ruc);
    if (!saved) {
      // Defensive only — should never happen after a successful write.
      throw new Error(`post-write row missing for ruc=${input.ruc}`);
    }
    return saved;
  }
}
