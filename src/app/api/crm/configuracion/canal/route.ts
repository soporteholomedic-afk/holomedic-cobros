import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ErrorCifradoConfig } from '@/features/crm/infrastructure/config/cifradoSecretos';
import {
  CLAVES_CONFIG_CANAL_KAPSO,
  ErrorConfigCanalInvalida,
  GuardarConfigCanalKapsoUseCase,
  leerVistaCanalKapso,
  type CambiosConfigCanalKapso,
  type CampoCanalKapso,
  type VistaCanalKapso,
} from '@/features/crm/application/configCanalKapso';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `GET|PUT /api/crm/configuracion/canal` (agente-ia-crm E5·T5a, permiso
 * `crm_configuracion` via RUTAS_PROTEGIDAS + re-check IN-ROUTE).
 *
 * GET: Kapso channel config; secrets ONLY as `{configurado, mascara}`.
 * PUT: any subset of the editable keys (secret '' keeps, null deletes) plus
 * optional `accion: 'regenerarWebhookSecret'`, whose plaintext secret is
 * returned EXACTLY ONCE in that response as `webhookSecretGenerado`.
 * Without CRM_CONFIG_KEY a PUT touching a secret is 503 CLAVE_NO_CONFIGURADA
 * and writes nothing. All responses are `no-store`.
 */

export interface ConfigCanalSuccess extends VistaCanalKapso {
  success: true;
  /** Only present in the response of `accion: 'regenerarWebhookSecret'`. */
  webhookSecretGenerado?: string;
}

interface ConfigCanalInvalidaResponse extends CrmErrorResponse {
  campo: CampoCanalKapso;
}

interface ClaveCifradoResponse {
  success: false;
  error: string;
  code: 'CLAVE_NO_CONFIGURADA' | 'CLAVE_INVALIDA';
}

const NO_STORE = { 'cache-control': 'no-store' } as const;
const CAMPOS = Object.keys(CLAVES_CONFIG_CANAL_KAPSO) as CampoCanalKapso[];
const ACCION_REGENERAR = 'regenerarWebhookSecret';

export async function GET(): Promise<NextResponse<ConfigCanalSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.config) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const vista = await leerVistaCanalKapso({ config: db.config });
    return NextResponse.json({ success: true as const, ...vista }, { headers: NO_STORE });
  } catch (error) {
    return mapCrmError('crm configuracion canal GET', error);
  }
}

export async function PUT(
  request: Request,
): Promise<
  NextResponse<
    ConfigCanalSuccess | CrmErrorResponse | ConfigCanalInvalidaResponse | ClaveCifradoResponse
  >
> {
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
    const permitidas = [...CAMPOS, 'accion'];
    const desconocidas = claves.filter((clave) => !permitidas.includes(clave));
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

    const { accion, ...campos } = cuerpo as Record<string, unknown>;
    if (accion !== undefined && accion !== ACCION_REGENERAR) {
      return buildCrmError('VALIDATION_ERROR', 'accion desconocida', 400);
    }

    const guardar = new GuardarConfigCanalKapsoUseCase({ config: db.config });
    const resultado = await guardar.guardar(
      {
        ...(campos as CambiosConfigCanalKapso),
        ...(accion === ACCION_REGENERAR ? { regenerarWebhookSecret: true } : {}),
      },
      session.nombre,
    );

    const vista = await leerVistaCanalKapso({ config: db.config });
    return NextResponse.json(
      {
        success: true as const,
        ...vista,
        ...(resultado.webhookSecretGenerado === undefined
          ? {}
          : { webhookSecretGenerado: resultado.webhookSecretGenerado }),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ErrorConfigCanalInvalida) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR',
          campo: error.campo,
        } satisfies ConfigCanalInvalidaResponse,
        { status: 400 },
      );
    }
    if (error instanceof ErrorCifradoConfig) {
      const code = error.codigo === 'CLAVE_NO_CONFIGURADA' ? 'CLAVE_NO_CONFIGURADA' : 'CLAVE_INVALIDA';
      return NextResponse.json(
        {
          success: false,
          error: 'No se pueden guardar secretos: la clave de cifrado no está disponible o es inválida',
          code,
        } satisfies ClaveCifradoResponse,
        { status: 503 },
      );
    }
    return mapCrmError('crm configuracion canal PUT', error);
  }
}
