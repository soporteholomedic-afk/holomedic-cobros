import mssql from 'mssql';
import type { AtencionDetalle } from '@/types/jjc';
import type { IAtencionRepository } from '@/features/jjc-mapper/domain/ports';
import { getPool } from '@/lib/db';

/**
 * SQL Server adapter for `IAtencionRepository`.
 *
 * Queries the SIGLA database (`ICCGSA`) joining `Orden` + `Persona` +
 * `Cliente` + `Servicio` to build the full attention detail, including
 * the `Área` column (via `Servicio.DesSer`).
 *
 * The `idAtencion` param is the composite string
 * `(CodSed + CodTCl + NumOrd)` — the same format produced by the
 * pacientes list endpoint — and is matched using the same concatenation
 * expression in the WHERE clause.
 */
export class SqlServerAtencionRepository implements IAtencionRepository {
  async getDetalle(idAtencion: string): Promise<AtencionDetalle | null> {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('idAtencion', mssql.VarChar(50), idAtencion)
      .query<AtencionDetalleRow>(`
      SELECT
        CASE WHEN O.CodSed <= 9 THEN '0' ELSE '' END
          + CONVERT(VARCHAR, O.CodSed)
          + CONVERT(VARCHAR, O.CodTCl)
          + CONVERT(VARCHAR, O.NumOrd) AS idAtencion,
        P.NroDId AS dni,
        CASE WHEN ISNULL(O.ApmPac, '') = ''
          THEN O.AppPac + ' ' + O.NomPac
          ELSE O.AppPac + ' ' + O.ApmPac + ' ' + O.NomPac
        END AS paciente,
        O.SexPac AS sexo,
        CONVERT(VARCHAR, O.FecNac, 103) AS fechaNac,
        O.EdaPac AS edad,
        CONVERT(VARCHAR, O.FecAte, 103) AS fechaAtencion,
        C.NomCom AS empresa,
        TC.DesTCh AS tipoExamen,
        O.DesPue AS puesto,
        ISNULL(S.DesSer, '') AS area
      FROM Orden O
      INNER JOIN Cliente C ON C.CodCli = O.CodCli
      INNER JOIN Persona P ON P.CodPer = O.CodPac
      LEFT JOIN TipoChequeo TC ON TC.CodTCh = O.CodTCh
      OUTER APPLY (
        SELECT TOP 1 S2.DesSer
        FROM OrdenxServicio OS2
        INNER JOIN Servicio S2 ON S2.CodSer = OS2.CodSer
        WHERE OS2.CodEmp = O.CodEmp
          AND OS2.CodSed = O.CodSed
          AND OS2.CodTCl = O.CodTCl
          AND OS2.NumOrd = O.NumOrd
      ) S
      WHERE
        CASE WHEN O.CodSed <= 9 THEN '0' ELSE '' END
          + CONVERT(VARCHAR, O.CodSed)
          + CONVERT(VARCHAR, O.CodTCl)
          + CONVERT(VARCHAR, O.NumOrd) = @idAtencion
    `);

    const rows = result.recordset;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }
}

interface AtencionDetalleRow {
  idAtencion: string;
  dni: string;
  paciente: string;
  sexo: string;
  fechaNac: string;
  edad: number;
  fechaAtencion: string;
  empresa: string;
  tipoExamen: string;
  puesto: string;
  area: string;
}

function mapRow(row: AtencionDetalleRow): AtencionDetalle {
  return {
    idAtencion: row.idAtencion,
    dni: String(row.dni ?? ''),
    paciente: String(row.paciente ?? ''),
    sexo: String(row.sexo ?? ''),
    fechaNac: String(row.fechaNac ?? ''),
    edad: Number(row.edad) || 0,
    fechaAtencion: String(row.fechaAtencion ?? ''),
    empresa: String(row.empresa ?? ''),
    tipoExamen: String(row.tipoExamen ?? ''),
    puesto: String(row.puesto ?? ''),
    area: String(row.area ?? ''),
  };
}
