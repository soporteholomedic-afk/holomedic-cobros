import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `GET /api/crm/configuracion/conocimiento` (agente-ia-crm E5·T6, permiso
 * `crm_configuracion` via RUTAS_PROTEGIDAS + re-check IN-ROUTE): read-only
 * counts for the "Conocimiento" tab — active entries (total and by
 * `origen`) and ingestas by `estado`. No repository method exposes these
 * counts, so a single constant, read-only COUNT query runs on the pool
 * (no user input, no schema change). `no-store`.
 */

const ORIGENES = ['MANUAL', 'SEMILLA', 'SUBIDO'] as const;
const ESTADOS_INGESTA = ['PENDIENTE', 'PROCESANDO', 'COMPLETADA', 'FALLIDA'] as const;

type Origen = (typeof ORIGENES)[number];
type EstadoIngesta = (typeof ESTADOS_INGESTA)[number];

export interface ConocimientoResumenSuccess {
  success: true;
  total: number;
  porOrigen: Record<Origen, number>;
  ingestasPorEstado: Record<EstadoIngesta, number>;
}

interface FilaConteo {
  grupo: string;
  clave: string;
  total: number;
}

const SQL_CONTEOS = `
  SELECT 'origen' AS grupo, origen AS clave, COUNT(*) AS total
  FROM dbo.CRM_Conocimiento WHERE activo = 1 GROUP BY origen
  UNION ALL
  SELECT 'estado' AS grupo, estado AS clave, COUNT(*) AS total
  FROM dbo.CRM_IngestasConocimiento GROUP BY estado
`;

function esFilaConteo(valor: unknown): valor is FilaConteo {
  if (typeof valor !== 'object' || valor === null) return false;
  const fila = valor as Record<string, unknown>;
  return (
    typeof fila.grupo === 'string' && typeof fila.clave === 'string' && typeof fila.total === 'number'
  );
}

async function leerConteos(pool: CrmDb['pool']): Promise<ConocimientoResumenSuccess> {
  const resultado = await pool.request().query(SQL_CONTEOS);
  const filas = (resultado.recordset as unknown[]).filter(esFilaConteo);

  const porOrigen: Record<Origen, number> = { MANUAL: 0, SEMILLA: 0, SUBIDO: 0 };
  const ingestasPorEstado: Record<EstadoIngesta, number> = {
    PENDIENTE: 0,
    PROCESANDO: 0,
    COMPLETADA: 0,
    FALLIDA: 0,
  };
  for (const fila of filas) {
    if (fila.grupo === 'origen' && (ORIGENES as readonly string[]).includes(fila.clave)) {
      porOrigen[fila.clave as Origen] = fila.total;
    } else if (fila.grupo === 'estado' && (ESTADOS_INGESTA as readonly string[]).includes(fila.clave)) {
      ingestasPorEstado[fila.clave as EstadoIngesta] = fila.total;
    }
  }
  const total = ORIGENES.reduce((suma, origen) => suma + porOrigen[origen], 0);
  return { success: true, total, porOrigen, ingestasPorEstado };
}

export async function GET(): Promise<NextResponse<ConocimientoResumenSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.conocimiento) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    return NextResponse.json(await leerConteos(db.pool), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return mapCrmError('crm configuracion conocimiento GET', error);
  }
}
