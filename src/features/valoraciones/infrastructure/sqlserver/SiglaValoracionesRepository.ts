import mssql from 'mssql';

import type {
  ConsolidadoAdicional,
  ConsolidadoRow,
} from '../../domain/consolidado';
import type {
  ClienteLookupItem,
  DestinoLookupItem,
  PacienteLookupItem,
  RepFacturacion,
  SedeLookupItem,
  TipoTrabajadorItem,
  ValoracionesFilter,
} from '../../domain/entities';
import type { ISiglaValoracionesRepository } from '../../domain/ports';
import { esVentaCero } from '../../domain/agrupacion';
import { estadoFromEstCob } from '../../domain/estado';

/**
 * Bind table for `SP_RPT_REPFACTURACION` — FROZEN from the task-1.0
 * smoke test (`sys.parameters` + SP source; see
 * `openspec/changes/REQ-03-valorizaciones-sigla/smoke-test-findings.md`):
 * parameter names have NO `p` prefix, `IndFac`/`InFSTA` are BIT, dates
 * are DATETIME and ids INT.
 */
export const REPFACTURACION_BINDS = {
  fecIni: { param: 'FecIni', type: mssql.DateTime },
  fecFin: { param: 'FecFin', type: mssql.DateTime },
  codCli: { param: 'CodCli', type: mssql.Int },
  codCfa: { param: 'CodCFa', type: mssql.Int },
  codDes: { param: 'CodDes', type: mssql.Int },
  codPac: { param: 'CodPac', type: mssql.Int },
  codSed: { param: 'CodSed', type: mssql.Int },
  indFac: { param: 'IndFac', type: mssql.Bit },
  tipTra: { param: 'TipTra', type: mssql.Int },
  codMon: { param: 'CodMon', type: mssql.Int },
  inFsta: { param: 'InFSTA', type: mssql.Bit },
} as const;

/**
 * Bind table for `SP_RPT_CONSOLIDADOFACTURACION` (and `_ADICIONALES` — both
 * take the same 8 parameters). Drops `CodCFa`/`CodMon`/`InFSTA` per SIGLA's
 * consolidado branch (`RptFacturacionForm.Reportar`).
 *
 * ⚠️ CONTRACT SOURCE: the live SIGLA DB does NOT contain these SPs (probe
 * 2026-08-27: "Could not find stored procedure"). Names follow the sibling
 * `SP_RPT_REPFACTURACION` convention (no prefix) and the result shape is
 * frozen from the SIGLA C# reader (`InformesD.ConsolidadoFacturacionD` /
 * `...AdicionalesD`). Re-verify against `sys.parameters` once ops deploys
 * the SPs — see apply-progress U3.
 */
export const CONSOLIDADO_BINDS = {
  fecIni: { param: 'FecIni', type: mssql.DateTime },
  fecFin: { param: 'FecFin', type: mssql.DateTime },
  codCli: { param: 'CodCli', type: mssql.Int },
  codDes: { param: 'CodDes', type: mssql.Int },
  codPac: { param: 'CodPac', type: mssql.Int },
  codSed: { param: 'CodSed', type: mssql.Int },
  indFac: { param: 'IndFac', type: mssql.Bit },
  tipTra: { param: 'TipTra', type: mssql.Int },
} as const;

/** Raw row shape returned by `SP_RPT_CONSOLIDADOFACTURACION` (C#-reader verified). */
interface ConsolidadoSpRow {
  CodCli: number;
  NomCom: string | null;
  CodDes: number | null;
  DesDes: string | null;
  IdeTCh: number | null;
  DesTCh: string | null;
  CanEva: number;
  VImpMN: number | null;
  VImpMO: number | null;
  VVtaMN: number | null;
  VVtaMO: number | null;
}

/** Raw row shape returned by `SP_RPT_CONSOLIDADOFACTURACION_ADICIONALES`. */
interface ConsolidadoAdicionalSpRow {
  CodCli: number;
  NomCom: string | null;
  CodDes: number | null;
  DesDes: string | null;
  NomSer: string | null;
  CanEva: number;
  ValImp: number | null;
  ValVta: number | null;
}

/** Map a consolidado SP row to the domain entity (trimmed names, NULL-safe amounts). */
export function rowToConsolidado(row: ConsolidadoSpRow): ConsolidadoRow {
  return {
    CodCli: row.CodCli,
    NomCom: row.NomCom?.trim() ?? '',
    CodDes: row.CodDes,
    DesDes: row.DesDes?.trim() ?? '',
    IdeTCh: row.IdeTCh,
    DesTCh: row.DesTCh?.trim() ?? '',
    CanEva: row.CanEva,
    VImpMN: row.VImpMN ?? 0,
    VImpMO: row.VImpMO ?? 0,
    VVtaMN: row.VVtaMN ?? 0,
    VVtaMO: row.VVtaMO ?? 0,
  };
}

/** Map an adicionales SP row to the domain entity. */
export function rowToConsolidadoAdicional(row: ConsolidadoAdicionalSpRow): ConsolidadoAdicional {
  return {
    CodCli: row.CodCli,
    NomCom: row.NomCom?.trim() ?? '',
    CodDes: row.CodDes,
    DesDes: row.DesDes?.trim() ?? '',
    NomSer: row.NomSer?.trim() ?? '',
    CanEva: row.CanEva,
    ValImp: row.ValImp ?? 0,
    ValVta: row.ValVta ?? 0,
  };
}

/**
 * Hardcoded tipo-trabajador fallback (design D7): verified live values
 * of `Constante WHERE CodTCo = 62` — the combo must keep working even
 * when the runtime constants query is denied.
 */
export const TIPOS_TRABAJADOR_FALLBACK: TipoTrabajadorItem[] = [
  { codTip: 620001, desTip: 'OBRERO' },
  { codTip: 620002, desTip: 'EMPLEADO' },
];

/**
 * Escape SQL Server LIKE metacharacters (`%`, `_`, `[`) with bracket
 * escaping so user input can never widen the pattern. The caller adds
 * the surrounding wildcards.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\[%_]/g, (ch) => `[${ch}]`);
}

/** NULL-safe optional id: absent or `<= 0` means "no filter". */
function nullableId(value: number | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}

function toIso(value: Date | null): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/** Raw row shape returned by the SP's `SELECT *` (45 columns; the six internal ones are optional here). */
interface RepFacturacionRow {
  NomCFa: string | null;
  NomCom: string | null;
  DesDes: string | null;
  CenCos: string | null;
  NroDId: string | null;
  Pacien: string | null;
  EdaPac: number | null;
  FecNac: Date | null;
  DesPue: string | null;
  DsTiTr: string | null;
  FecAte: Date | null;
  FecSTA: Date | null;
  DesTCh: string | null;
  NomPro: string | null;
  Result: string | null;
  Anex7D: string | null;
  CodMon: number;
  DesMon: string | null;
  Simbol: string | null;
  VImpMN: number | null;
  VImpMO: number | null;
  VVtaMN: number | null;
  VVtaMO: number | null;
  Solici: string | null;
  Admini: string | null;
  IdAten: string | null;
  ItemEx: number;
  TipDov: string | null;
  NumDov: number | null;
  EstCob: string | null;
  NomCli: string | null;
  IndCon: boolean | null;
  IdConv: string | null;
  CodSeC: number | null;
  NumCob: number | null;
  NroVal: string | null;
  NroOPe: string | null;
  CodiEM: string | null;
  FecRec: Date | null;
}

/** Map an SP row to the entity: ISO dates at the boundary, exact casing preserved. */
export function rowToRepFacturacion(row: RepFacturacionRow): RepFacturacion {
  return {
    NomCFa: row.NomCFa ?? '',
    NomCom: row.NomCom ?? '',
    DesDes: row.DesDes ?? '',
    CenCos: row.CenCos ?? '',
    NroDId: row.NroDId ?? '',
    Pacien: row.Pacien ?? '',
    EdaPac: row.EdaPac ?? 0,
    FecNac: toIso(row.FecNac),
    DesPue: row.DesPue ?? '',
    DsTiTr: row.DsTiTr ?? '',
    FecAte: toIso(row.FecAte) ?? '',
    FecSTA: toIso(row.FecSTA),
    DesTCh: row.DesTCh ?? '',
    NomPro: row.NomPro ?? '',
    Result: row.Result ?? '',
    Anex7D: row.Anex7D ?? '',
    CodMon: row.CodMon,
    DesMon: row.DesMon ?? '',
    Simbol: row.Simbol ?? '',
    VImpMN: row.VImpMN ?? 0,
    VImpMO: row.VImpMO ?? 0,
    VVtaMN: row.VVtaMN ?? 0,
    VVtaMO: row.VVtaMO ?? 0,
    Solici: row.Solici ?? '',
    Admini: row.Admini ?? '',
    IdAten: row.IdAten ?? '',
    ItemEx: row.ItemEx,
    TipDov: row.TipDov ?? '',
    NumDov: row.NumDov ?? null,
    EstCob: estadoFromEstCob(row.EstCob),
    NomCli: row.NomCli ?? '',
    IndCon: row.IndCon ?? false,
    IdConv: row.IdConv ?? '',
    CodSeC: row.CodSeC ?? null,
    NumCob: row.NumCob ?? null,
    NroVal: row.NroVal ?? '',
    NroOPe: row.NroOPe ?? '',
    CodiEM: row.CodiEM ?? '',
    FecRec: toIso(row.FecRec),
  };
}

/**
 * SQL Server adapter over the SIGLA read-only pool. Every statement uses
 * typed `request.input()` binds — user data never reaches the SQL text.
 * Lookup queries target base tables/views (verified by the smoke test);
 * only the valoraciones query executes the SP.
 */
export class SiglaValoracionesRepository implements ISiglaValoracionesRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async buscarValoraciones(filtro: ValoracionesFilter): Promise<RepFacturacion[]> {
    const request = this.pool.request();
    request.input(
      REPFACTURACION_BINDS.fecIni.param,
      REPFACTURACION_BINDS.fecIni.type,
      new Date(`${filtro.fecIni}T00:00:00`),
    );
    request.input(
      REPFACTURACION_BINDS.fecFin.param,
      REPFACTURACION_BINDS.fecFin.type,
      new Date(`${filtro.fecFin}T23:59:59`),
    );
    request.input(REPFACTURACION_BINDS.codCli.param, REPFACTURACION_BINDS.codCli.type, nullableId(filtro.codCli));
    request.input(REPFACTURACION_BINDS.codCfa.param, REPFACTURACION_BINDS.codCfa.type, nullableId(filtro.codCfa));
    request.input(REPFACTURACION_BINDS.codDes.param, REPFACTURACION_BINDS.codDes.type, nullableId(filtro.codDes));
    request.input(REPFACTURACION_BINDS.codPac.param, REPFACTURACION_BINDS.codPac.type, nullableId(filtro.codPac));
    request.input(REPFACTURACION_BINDS.codSed.param, REPFACTURACION_BINDS.codSed.type, nullableId(filtro.codSed));
    // BIT binds travel as true/false/null (tri-state: null = Todos).
    request.input(
      REPFACTURACION_BINDS.indFac.param,
      REPFACTURACION_BINDS.indFac.type,
      filtro.indFac === null ? null : filtro.indFac === 1,
    );
    request.input(REPFACTURACION_BINDS.tipTra.param, REPFACTURACION_BINDS.tipTra.type, nullableId(filtro.tipTra));
    request.input(REPFACTURACION_BINDS.codMon.param, REPFACTURACION_BINDS.codMon.type, filtro.codMon);
    request.input(REPFACTURACION_BINDS.inFsta.param, REPFACTURACION_BINDS.inFsta.type, filtro.inFsta);

    const result = await request.execute('SP_RPT_REPFACTURACION');
    const rows = result.recordset as unknown as RepFacturacionRow[];
    const mapped = rows.map(rowToRepFacturacion);
    // Opt-in zero-row suppression AFTER mapping (NULL→0 included); absent
    // flag keeps the predicate inert → today's exact row set (A5).
    return filtro.ocultarCero === true
      ? mapped.filter((row) => !esVentaCero(row, filtro.codMon))
      : mapped;
  }

  /**
   * Execute the consolidado SP pair (main + adicionales) with the 8-filter
   * subset SIGLA's consolidado branch uses (`codCfa`/`codMon`/`inFsta` are
   * deliberately dropped). The domain layer (`aplicarAjusteAdicionales`)
   * owns the SIGLA adjustment arithmetic — this method only fetches.
   */
  async buscarConsolidado(
    filtro: ValoracionesFilter,
  ): Promise<{ principales: ConsolidadoRow[]; adicionales: ConsolidadoAdicional[] }> {
    const bindConsolidado = (request: mssql.Request): void => {
      request.input(
        CONSOLIDADO_BINDS.fecIni.param,
        CONSOLIDADO_BINDS.fecIni.type,
        new Date(`${filtro.fecIni}T00:00:00`),
      );
      request.input(
        CONSOLIDADO_BINDS.fecFin.param,
        CONSOLIDADO_BINDS.fecFin.type,
        new Date(`${filtro.fecFin}T23:59:59`),
      );
      request.input(CONSOLIDADO_BINDS.codCli.param, CONSOLIDADO_BINDS.codCli.type, nullableId(filtro.codCli));
      request.input(CONSOLIDADO_BINDS.codDes.param, CONSOLIDADO_BINDS.codDes.type, nullableId(filtro.codDes));
      request.input(CONSOLIDADO_BINDS.codPac.param, CONSOLIDADO_BINDS.codPac.type, nullableId(filtro.codPac));
      request.input(CONSOLIDADO_BINDS.codSed.param, CONSOLIDADO_BINDS.codSed.type, nullableId(filtro.codSed));
      // BIT binds travel as true/false/null (tri-state: null = Todos).
      request.input(
        CONSOLIDADO_BINDS.indFac.param,
        CONSOLIDADO_BINDS.indFac.type,
        filtro.indFac === null ? null : filtro.indFac === 1,
      );
      request.input(CONSOLIDADO_BINDS.tipTra.param, CONSOLIDADO_BINDS.tipTra.type, nullableId(filtro.tipTra));
    };

    const mainRequest = this.pool.request();
    bindConsolidado(mainRequest);
    const mainResult = await mainRequest.execute('SP_RPT_CONSOLIDADOFACTURACION');

    const adiRequest = this.pool.request();
    bindConsolidado(adiRequest);
    const adiResult = await adiRequest.execute('SP_RPT_CONSOLIDADOFACTURACION_ADICIONALES');

    return {
      principales: (mainResult.recordset as unknown as ConsolidadoSpRow[]).map(rowToConsolidado),
      adicionales: (adiResult.recordset as unknown as ConsolidadoAdicionalSpRow[]).map(
        rowToConsolidadoAdicional,
      ),
    };
  }

  async buscarClientes(q: string): Promise<ClienteLookupItem[]> {
    const pat = `%${escapeLike(q)}%`;
    const result = await this.pool
      .request()
      .input('pat', mssql.VarChar, pat)
      .query(
        `SELECT TOP 20 CodCli, LTRIM(RTRIM(NomCom)) AS NomCom, NroRuc
           FROM Cliente
          WHERE IndReg = 1
            AND (NomCom LIKE @pat OR NroRuc LIKE @pat)
          ORDER BY NomCom`,
      );
    const rows = result.recordset as unknown as Array<{
      CodCli: number;
      NomCom: string | null;
      NroRuc: string | null;
    }>;
    return rows.map((row) => ({
      codCli: row.CodCli,
      nomCom: row.NomCom?.trim() ?? '',
      nroRuc: row.NroRuc?.trim() ? row.NroRuc.trim() : null,
    }));
  }

  /** Single client by code (PDF header client/RUC — spec E-R2, OQ-3). */
  async buscarClientePorCodigo(codCli: number): Promise<ClienteLookupItem | null> {
    const result = await this.pool
      .request()
      .input('codCli', mssql.Int, codCli)
      .query(
        `SELECT CodCli, LTRIM(RTRIM(NomCom)) AS NomCom, NroRuc
           FROM Cliente
          WHERE CodCli = @codCli`,
      );
    const row = (result.recordset as unknown as Array<{
      CodCli: number;
      NomCom: string | null;
      NroRuc: string | null;
    }>)[0];
    if (!row) return null;
    return {
      codCli: row.CodCli,
      nomCom: row.NomCom?.trim() ?? '',
      nroRuc: row.NroRuc?.trim() ? row.NroRuc.trim() : null,
    };
  }

  async buscarPacientes(q: string): Promise<PacienteLookupItem[]> {
    const pat = `%${escapeLike(q)}%`;
    const result = await this.pool
      .request()
      .input('pat', mssql.VarChar, pat)
      .query(
        `SELECT TOP 20 CodPer, NroDId,
                REPLACE(CONCAT(ApePat, ' ', ApeMat, ' ', NomPer), '  ', ' ') AS Nombre
           FROM Persona
          WHERE IndPac = 1 AND IndReg = 1
            AND (NroDId LIKE @pat
                 OR REPLACE(CONCAT(ApePat, ' ', ApeMat, ' ', NomPer), '  ', ' ') LIKE @pat)
          ORDER BY ApePat, ApeMat, NomPer`,
      );
    const rows = result.recordset as unknown as Array<{
      CodPer: number;
      Nombre: string | null;
    }>;
    return rows.map((row) => ({
      codPac: row.CodPer,
      nombre: row.Nombre?.trim() ?? '',
    }));
  }

  async buscarDestinos(codCli: number): Promise<DestinoLookupItem[]> {
    const result = await this.pool
      .request()
      .input('codCli', mssql.Int, codCli)
      .query(
        `SELECT CodDes, LTRIM(RTRIM(DesDes)) AS DesDes
           FROM Destino
          WHERE CodCli = @codCli AND IndReg = 1
          ORDER BY DesDes`,
      );
    const rows = result.recordset as unknown as Array<{
      CodDes: number;
      DesDes: string | null;
    }>;
    return rows.map((row) => ({
      codDes: row.CodDes,
      desDes: row.DesDes?.trim() ?? '',
    }));
  }

  async buscarTiposTrabajador(): Promise<TipoTrabajadorItem[]> {
    try {
      const result = await this.pool.request().query(
        `SELECT CodCon, LTRIM(RTRIM(DesCon)) AS DesCon
           FROM Constante
          WHERE CodTCo = 62 AND IndReg = 1
          ORDER BY CodCon`,
      );
      const rows = result.recordset as unknown as Array<{
        CodCon: number;
        DesCon: string | null;
      }>;
      const mapped = rows.map((row) => ({
        codTip: row.CodCon,
        desTip: row.DesCon?.trim() ?? '',
      }));
      return mapped.length > 0 ? mapped : TIPOS_TRABAJADOR_FALLBACK;
    } catch (error) {
      // D7: the combo must never 500 — degrade to the verified pair.
      console.error('buscarTiposTrabajador fallback engaged:', error);
      return TIPOS_TRABAJADOR_FALLBACK;
    }
  }

  async buscarSedes(): Promise<SedeLookupItem[]> {
    // SP_SEL_SEDE is just `SELECT * FROM VW_SEDE [+WHERE][+ORDER]` and the
    // read-only login has no EXECUTE grants — query the view directly.
    const result = await this.pool.request().query(
      `SELECT CodSed, LTRIM(RTRIM(NomSed)) AS NomSed
         FROM VW_SEDE
        WHERE IndReg = 1
        ORDER BY CodSed`,
    );
    const rows = result.recordset as unknown as Array<{
      CodSed: number;
      NomSed: string | null;
    }>;
    return rows.map((row) => ({
      codSed: row.CodSed,
      nomSed: row.NomSed?.trim() ?? '',
    }));
  }
}
