import mssql from 'mssql';
import type { AtencionDetalle } from '@/types/jjc';
import type { IAtencionRepository } from '@/features/jjc-mapper/domain/ports';
import { getPool } from '@/lib/db';
import { FILE_SERVER_BASE_PATH } from '@/lib/platform';

/**
 * SQL Server adapter for `IAtencionRepository`.
 *
 * Queries the SIGLA database (`ICCGSA`) joining `Orden` + `Persona` +
 * `Cliente` + `Servicio` to build the full attention detail, including
 * the `Área` column (via `Servicio.NomSer`).
 *
 * The `idAtencion` param is the composite string
 * `(CodSed + CodTCl + NumOrd)` — the same format produced by the
 * pacientes list endpoint — and is matched using the same concatenation
 * expression in the WHERE clause.
 */
export class SqlServerAtencionRepository implements IAtencionRepository {
  async getDetalle(idAtencion: string): Promise<AtencionDetalle | null> {
    const pool = await getPool();
    await pool.connect();

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
        ISNULL(S.NomSer, '') AS area,
        O.CodPac,
        OI.UbiFir,
        OI.UbiHue
      FROM Orden O
      INNER JOIN Cliente C ON C.CodCli = O.CodCli
      INNER JOIN Persona P ON P.CodPer = O.CodPac
      LEFT JOIN TipoChequeo TC ON TC.CodTCh = O.CodTCh
      LEFT JOIN OrdenImg OI ON OI.CodEmp = O.CodEmp
        AND OI.CodSed = O.CodSed
        AND OI.CodTCl = O.CodTCl
        AND OI.NumOrd = O.NumOrd
      OUTER APPLY (
        SELECT TOP 1 S2.NomSer
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
    if (rows.length === 0) return null;

    const row = rows[0];
    let detalle = mapRow(row);

    // Fallback: if the current order has no images, look for the most
    // recent order from the same patient that does.
    if (detalle.rutaFirma === null && detalle.rutaHuella === null) {
      const fb = await pool
        .request()
        .input('codPac', mssql.Int, row.CodPac)
        .query<{ UbiFir: string | null; UbiHue: string | null }>(`
          SELECT TOP 1 OI.UbiFir, OI.UbiHue
          FROM OrdenImg OI
          INNER JOIN Orden O2 ON O2.CodEmp = OI.CodEmp
            AND O2.CodSed = OI.CodSed
            AND O2.CodTCl = OI.CodTCl
            AND O2.NumOrd = OI.NumOrd
          WHERE O2.CodPac = @codPac
            AND (OI.UbiFir IS NOT NULL OR OI.UbiHue IS NOT NULL)
          ORDER BY O2.FecAte DESC
        `);

      if (fb.recordset.length > 0) {
        detalle = {
          ...detalle,
          rutaFirma: mapRawPath(fb.recordset[0].UbiFir),
          rutaHuella: mapRawPath(fb.recordset[0].UbiHue),
        };
      }
    }

    return detalle;
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
  CodPac: number;
  UbiFir: string | null;
  UbiHue: string | null;
}

/**
 * Replace the UNC root in a raw SIGLA path with the platform-specific
 * `FILE_SERVER_BASE_PATH`. The raw paths come as
 * `\\STORAGE\SIGLA\...` and need to map to the actual mount/share
 * used by the current environment:
 *   - Windows: `\\172.16.10.12\sigla\...`
 *   - Linux:   `/mnt/sigla/...`
 */
function mapRawPath(raw: string | null): string | null {
  if (!raw) return null;
  // Replace the UNC root \\SERVER\SIGLA with the platform-specific base path.
  // On Windows it stays as \\172.16.10.12\sigla\... (native UNC support).
  // On Linux it becomes /mnt/sigla/... (forward slashes, SMB mount).
  const withBase = raw.replace(/^\\\\[^\\]+\\SIGLA/i, FILE_SERVER_BASE_PATH);
  return FILE_SERVER_BASE_PATH.includes('\\')
    ? withBase
    : withBase.replace(/\\/g, '/');
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
    rutaFirma: mapRawPath(row.UbiFir),
    rutaHuella: mapRawPath(row.UbiHue),
  };
}
