import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { AuditoriaConfigCrm } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `GET /api/crm/configuracion/auditoria?prefijo=agente.&limite=50`
 * (agente-ia-crm E5·T4, permiso `crm_configuracion`): newest-first
 * config audit trail. `limite` defaults to 50 and is capped at 200.
 * The repo filters by exact key only, so `prefijo` is applied here over
 * the newest LIMITE_MAX rows. Secret rows NEVER carry values on the
 * wire (nulled here even if an adapter regressed). `no-store`.
 */

const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 200;

interface AuditoriaWire {
  id: number;
  clave: string;
  usuario: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  esSecreto: boolean;
  creadoEn: string;
}

interface AuditoriaSuccess {
  success: true;
  auditoria: AuditoriaWire[];
}

function aWire(fila: AuditoriaConfigCrm): AuditoriaWire {
  return {
    id: fila.id,
    clave: fila.clave,
    usuario: fila.usuario,
    valorAnterior: fila.esSecreto ? null : fila.valorAnterior,
    valorNuevo: fila.esSecreto ? null : fila.valorNuevo,
    esSecreto: fila.esSecreto,
    creadoEn: fila.creadoEn.toISOString(),
  };
}

export async function GET(request: Request): Promise<NextResponse<AuditoriaSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.config) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const params = new URL(request.url).searchParams;
    const prefijo = params.get('prefijo') ?? '';
    const parseado = Number.parseInt(params.get('limite') ?? '', 10);
    const limite =
      Number.isFinite(parseado) && parseado > 0 ? Math.min(parseado, LIMITE_MAX) : LIMITE_DEFAULT;

    const filas = await db.config.listarAuditoria({ limite: prefijo === '' ? limite : LIMITE_MAX });
    const filtradas = prefijo === '' ? filas : filas.filter((fila) => fila.clave.startsWith(prefijo));

    return NextResponse.json(
      { success: true, auditoria: filtradas.slice(0, limite).map(aWire) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapCrmError('crm configuracion auditoria GET', error);
  }
}
