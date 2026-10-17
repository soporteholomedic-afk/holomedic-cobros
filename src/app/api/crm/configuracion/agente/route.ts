import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { ConfigAgente } from '@/features/crm/application/configAgente';
import {
  CLAVES_CONFIG_AGENTE,
  PREFIJO_CONFIG_AGENTE,
  resolverConfigAgente,
} from '@/features/crm/application/resolverConfigAgente';
import {
  ErrorConfigAgenteInvalida,
  GuardarConfigAgenteUseCase,
  type CambiosConfigAgente,
  type CampoConfigAgente,
} from '@/features/crm/application/guardarConfigAgente';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `GET|PUT /api/crm/configuracion/agente` (agente-ia-crm E5·T4, permiso
 * `crm_configuracion` via RUTAS_PROTEGIDAS + re-check IN-ROUTE).
 *
 * GET: the resolved agent config plus, per key, where the effective
 * value comes from (`db` row, `env` var or built-in `default`), `no-store`.
 * PUT: any subset of the editable keys; strict validation lives in
 * GuardarConfigAgenteUseCase (ErrorConfigAgenteInvalida → 400 with the
 * offending `campo`). Unknown keys and malformed JSON are 400 too.
 */

type FuenteConfig = 'db' | 'env' | 'default';

export interface ConfigAgenteSuccess {
  success: true;
  config: ConfigAgente;
  fuentes: Record<CampoConfigAgente, FuenteConfig>;
}

interface ConfigAgenteInvalidaResponse extends CrmErrorResponse {
  campo: CampoConfigAgente;
}

const CAMPOS = Object.keys(CLAVES_CONFIG_AGENTE) as CampoConfigAgente[];

/** Field → AGENTE_* env name (mirrors the resolver's overlay map). */
const VARIABLE_ENTORNO: Record<CampoConfigAgente, string> = {
  habilitado: 'AGENTE_HABILITADO',
  umbralConfianza: 'AGENTE_UMBRAL_CONF',
  maxIntercambios: 'AGENTE_MAX_INTERCAMBIOS',
  horarioDesde: 'AGENTE_HORARIO_DESDE',
  horarioHasta: 'AGENTE_HORARIO_HASTA',
  textoEscalado: 'AGENTE_TEXTO_ESCALADO',
};

async function leerConfigConFuentes(
  config: NonNullable<Awaited<ReturnType<typeof getCrmDb>>['config']>,
): Promise<ConfigAgenteSuccess> {
  const resuelta = await resolverConfigAgente({ config });
  const filas = await config.listar(PREFIJO_CONFIG_AGENTE);
  const clavesEnDb = new Set(filas.filter((fila) => !fila.esSecreto).map((fila) => fila.clave));
  const fuentes = {} as Record<CampoConfigAgente, FuenteConfig>;
  for (const campo of CAMPOS) {
    if (clavesEnDb.has(CLAVES_CONFIG_AGENTE[campo])) fuentes[campo] = 'db';
    else if ((process.env[VARIABLE_ENTORNO[campo]] ?? '').trim() !== '') fuentes[campo] = 'env';
    else fuentes[campo] = 'default';
  }
  return { success: true, config: resuelta, fuentes };
}

export async function GET(): Promise<NextResponse<ConfigAgenteSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.config) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    return NextResponse.json(await leerConfigConFuentes(db.config), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return mapCrmError('crm configuracion agente GET', error);
  }
}

export async function PUT(
  request: Request,
): Promise<NextResponse<ConfigAgenteSuccess | CrmErrorResponse | ConfigAgenteInvalidaResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.config) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const cuerpo: unknown = await request.json().catch(() => null);
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
      return buildCrmError('VALIDATION_ERROR', 'Cuerpo JSON requerido', 400);
    }
    const claves = Object.keys(cuerpo);
    const desconocidas = claves.filter((clave) => !(CAMPOS as string[]).includes(clave));
    if (desconocidas.length > 0) {
      return buildCrmError(
        'VALIDATION_ERROR',
        `Campos desconocidos: ${desconocidas.join(', ')}`,
        400,
      );
    }
    if (claves.length === 0) {
      return buildCrmError('VALIDATION_ERROR', 'No hay cambios que guardar', 400);
    }

    const guardar = new GuardarConfigAgenteUseCase({ config: db.config });
    await guardar.guardar(cuerpo as CambiosConfigAgente, session.nombre);

    return NextResponse.json(await leerConfigConFuentes(db.config));
  } catch (error) {
    if (error instanceof ErrorConfigAgenteInvalida) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR',
          campo: error.campo,
        } satisfies ConfigAgenteInvalidaResponse,
        { status: 400 },
      );
    }
    return mapCrmError('crm configuracion agente PUT', error);
  }
}
