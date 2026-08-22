import * as mssql from 'mssql';

import type {
  CobranzaEnvioHistorial,
  RegistroEnvioCobranzaInput,
} from '../../domain/entities';
import type { ICobranzaEnviosHistorialRepository } from '../../domain/ports';

/**
 * Raw `dbo.CobranzaEnviosHistorial` row shape as returned by mssql.
 * `fechaEnvio` is a `DATETIME2(3)` column that comes back as a JS
 * `Date` and is converted to an ISO-8601 UTC string at the boundary
 * so the entity contract stays string-based (EmpresaContacto
 * precedent). `destinatarios`/`copias` are stored JSON array strings
 * decoded here.
 */
interface HistorialRow {
  id: number;
  ruc: string;
  razonSocial: string | null;
  destinatarios: string;
  copias: string | null;
  asunto: string;
  montoReclamado: number | null;
  moneda: string | null;
  comprobantesCount: number | null;
  estadoEnvio: string;
  errorDetalle: string | null;
  enviadoPor: string;
  fechaEnvio: Date;
}

/** Max stored length of `razonSocial` (NVARCHAR(255) column). */
const RAZON_SOCIAL_MAX = 255;

/**
 * Parse a stored JSON array string. `null` for a null/missing column
 * or malformed/`non-array` JSON — callers decide the fallback
 * (`[]` for the NOT NULL `destinatarios`, `null` for `copias`).
 */
function parseJsonStringArray(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return null;
  }
}

/** Map a `dbo.CobranzaEnviosHistorial` row to the read entity. */
function rowToEnvio(row: HistorialRow): CobranzaEnvioHistorial {
  return {
    id: Number(row.id),
    ruc: row.ruc,
    razonSocial: row.razonSocial,
    destinatarios: parseJsonStringArray(row.destinatarios) ?? [],
    copias: parseJsonStringArray(row.copias),
    asunto: row.asunto,
    montoReclamado: row.montoReclamado === null ? null : Number(row.montoReclamado),
    moneda: row.moneda,
    comprobantesCount:
      row.comprobantesCount === null ? null : Number(row.comprobantesCount),
    // estadoEnvio is CHECK-constrained to 'SUCCESS' | 'FAILED' (DDL);
    // the cast only refines the driver's string to the union.
    estadoEnvio: row.estadoEnvio as CobranzaEnvioHistorial['estadoEnvio'],
    errorDetalle: row.errorDetalle,
    enviadoPor: row.enviadoPor,
    fechaEnvio: row.fechaEnvio.toISOString(),
  };
}

/**
 * SQL Server adapter for the cobranza send-attempt audit log
 * (REQ-02). Implements `ICobranzaEnviosHistorialRepository` against
 * the append-only `dbo.CobranzaEnviosHistorial` table in the
 * `HOLOMEDIC` database.
 *
 * `insert` appends one immutable row per attempt with EXPLICITLY
 * TYPED parameters — `Decimal(18,2)` keeps money precision (an
 * inferred Float bind could drift), `Int` for counts and `NVarChar`
 * for JSON/LOB text. `fechaEnvio` is never sent: the column's
 * `DEFAULT SYSUTCDATETIME()` stamps it server-side in UTC (R7
 * storage convention; deliberate deviation from the REQ draft's
 * GETDATE()). There is no update/delete path by design — audit rows
 * are immutable.
 *
 * `getByRuc` reads the narrow list columns ONLY — `cuerpoResumen`
 * (NVARCHAR(MAX), full email HTML) stays off the wire — ordered
 * most-recent-first by the server.
 *
 * The adapter assumes `migrate()` has already been run against
 * `pool` (the factory in `getCobranzaHistorialDb` does this).
 */
export class SqlServerCobranzaHistorialRepository implements ICobranzaEnviosHistorialRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  /**
   * Run a statement with explicitly-typed bound `@`-parameters.
   * Values travel through `request.input(name, type, value)` — never
   * interpolated into the SQL text.
   */
  private async runQuery(
    sqlText: string,
    typedInputs: ReadonlyArray<
      readonly [string, mssql.ISqlType | (() => mssql.ISqlType), unknown]
    >,
  ): Promise<mssql.IResult<unknown>> {
    const request = this.pool.request();
    for (const [name, type, value] of typedInputs) {
      request.input(name, type, value);
    }
    return request.query(sqlText);
  }

  async insert(input: RegistroEnvioCobranzaInput): Promise<void> {
    await this.runQuery(
      `INSERT INTO dbo.CobranzaEnviosHistorial
          (ruc, razonSocial, destinatarios, copias, asunto, cuerpoResumen,
           montoReclamado, moneda, comprobantesCount, estadoEnvio, errorDetalle, enviadoPor)
        VALUES
          (@ruc, @razonSocial, @destinatarios, @copias, @asunto, @cuerpoResumen,
           @montoReclamado, @moneda, @comprobantesCount, @estadoEnvio, @errorDetalle, @enviadoPor);`,
      [
        ['ruc', mssql.VarChar(11), input.ruc],
        [
          'razonSocial',
          mssql.NVarChar(255),
          input.razonSocial === null ? null : input.razonSocial.slice(0, RAZON_SOCIAL_MAX),
        ],
        // JSON-encoded arrays mirror the envios_consolidados
        // toRecipients/ccRecipients storage convention.
        ['destinatarios', mssql.NVarChar(mssql.MAX), JSON.stringify(input.destinatarios)],
        [
          'copias',
          mssql.NVarChar(mssql.MAX),
          input.copias === null ? null : JSON.stringify(input.copias),
        ],
        ['asunto', mssql.NVarChar(500), input.asunto],
        ['cuerpoResumen', mssql.NVarChar(mssql.MAX), input.cuerpoResumen],
        ['montoReclamado', mssql.Decimal(18, 2), input.montoReclamado],
        ['moneda', mssql.VarChar(10), input.moneda],
        ['comprobantesCount', mssql.Int, input.comprobantesCount],
        ['estadoEnvio', mssql.VarChar(20), input.estadoEnvio],
        ['errorDetalle', mssql.NVarChar(mssql.MAX), input.errorDetalle],
        ['enviadoPor', mssql.NVarChar(100), input.enviadoPor],
      ],
    );
  }

  async getByRuc(ruc: string): Promise<CobranzaEnvioHistorial[]> {
    const result = await this.runQuery(
      `SELECT id, ruc, razonSocial, destinatarios, copias, asunto,
              montoReclamado, moneda, comprobantesCount, estadoEnvio, errorDetalle,
              enviadoPor, fechaEnvio
         FROM dbo.CobranzaEnviosHistorial
        WHERE ruc = @ruc
        ORDER BY fechaEnvio DESC;`,
      [['ruc', mssql.VarChar(11), ruc]],
    );
    // mssql typings make `recordset` hard to index; the SQL and the
    // row type are coupled by the same author (contact-repo pattern).
    const rows = result.recordset as unknown as HistorialRow[];
    return rows.map(rowToEnvio);
  }
}
