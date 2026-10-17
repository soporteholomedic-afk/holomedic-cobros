import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ErrorCifradoConfig } from '@/features/crm/infrastructure/config/cifradoSecretos';
import {
  CLAVES_CONFIG_MEMORIA,
  ErrorConfigMemoriaInvalida,
  GuardarConfigMemoriaUseCase,
  leerVistaMemoria,
  type CambiosConfigMemoria,
  type CampoMemoria,
  type VistaMemoria,
} from '@/features/crm/application/configMemoria';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `GET|PUT /api/crm/configuracion/memoria` (agente-ia-crm E5·T5a, permiso
 * `crm_configuracion` via RUTAS_PROTEGIDAS + re-check IN-ROUTE).
 *
 * GET: Engram memory config; the token ONLY as `{configurado, mascara}`.
 * PUT: any subset of the editable keys (token '' keeps, null deletes).
 * Without CRM_CONFIG_KEY a PUT touching the token is 503
 * CLAVE_NO_CONFIGURADA and writes nothing. All responses are `no-store`.
 */

export interface ConfigMemoriaSuccess extends VistaMemoria {
  success: true;
}

interface ConfigMemoriaInvalidaResponse extends CrmErrorResponse {
  campo: CampoMemoria;
}

interface ClaveCifradoResponse {
  success: false;
  error: string;
  code: 'CLAVE_NO_CONFIGURADA' | 'CLAVE_INVALIDA';
}

const NO_STORE = { 'cache-control': 'no-store' } as const;
const CAMPOS = Object.keys(CLAVES_CONFIG_MEMORIA) as CampoMemoria[];

export async function GET(): Promise<NextResponse<ConfigMemoriaSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.config) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const vista = await leerVistaMemoria({ config: db.config });
    return NextResponse.json({ success: true as const, ...vista }, { headers: NO_STORE });
  } catch (error) {
    return mapCrmError('crm configuracion memoria GET', error);
  }
}

export async function PUT(
  request: Request,
): Promise<
  NextResponse<
    ConfigMemoriaSuccess | CrmErrorResponse | ConfigMemoriaInvalidaResponse | ClaveCifradoResponse
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

    const guardar = new GuardarConfigMemoriaUseCase({ config: db.config });
    await guardar.guardar(cuerpo as CambiosConfigMemoria, session.nombre);

    const vista = await leerVistaMemoria({ config: db.config });
    return NextResponse.json({ success: true as const, ...vista }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorConfigMemoriaInvalida) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR',
          campo: error.campo,
        } satisfies ConfigMemoriaInvalidaResponse,
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
    return mapCrmError('crm configuracion memoria PUT', error);
  }
}
