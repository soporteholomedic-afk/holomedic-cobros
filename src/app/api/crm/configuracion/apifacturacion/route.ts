import { NextResponse } from 'next/server';

import { buildError, errorDeCrm, esObjeto, leerJson } from '@/app/api/crm/_lib/http';
import { ErrorCifradoConfig } from '@/features/crm/infrastructure/config/cifradoSecretos';
import {
  ErrorConfigApifacturacionInvalida,
  GuardarConfigApifacturacionUseCase,
  leerVistaApifacturacion,
  type CambiosConfigApifacturacion,
  type VistaApifacturacion,
} from '@/features/crm/application/configuracion/configApifacturacion';
import { getCrmConfigRepository } from '@/features/crm/infrastructure/getCrmDb';

import { usuarioConPermiso } from '../_lib/guardia';

/**
 * `GET|PUT /api/crm/configuracion/apifacturacion` (crm-consulta-sunat
 * T2, permiso `crm_configuracion` via RUTAS_PROTEGIDAS + re-check
 * IN-ROUTE through `usuarioConPermiso`).
 *
 * GET: the apifacturacion state — `{ configurado, tokenMascarado, url,
 * fuente }` — with the token NEVER in clear, `no-store`. PUT: any
 * subset of `{ url, token }`; strict validation lives in
 * GuardarConfigApifacturacionUseCase (invalid field → 400, unknown key
 * or malformed JSON → 400, secret write without CRM_CONFIG_KEY → 503
 * with NOTHING persisted). `token: ''` keeps the current token, `null`
 * deletes it (E5 pattern).
 */

interface ConfiguracionSuccess {
  success: true;
  configuracion: VistaApifacturacion;
}

const CAMPOS_CONOCIDOS = new Set(['url', 'token']);

async function leerConfiguracion(): Promise<ConfiguracionSuccess> {
  const config = await getCrmConfigRepository();
  const configuracion = await leerVistaApifacturacion({ config });
  return { success: true, configuracion };
}

export async function GET(): Promise<NextResponse<ConfiguracionSuccess | { success: false; error: string }>> {
  const acceso = await usuarioConPermiso('crm_configuracion');
  if ('denegado' in acceso) return acceso.denegado;

  try {
    // The state (and the mask) must never sit in any cache.
    return NextResponse.json(await leerConfiguracion(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorDeCrm(error, 'GET apifacturacion config', 'No se pudo leer la configuración');
  }
}

export async function PUT(
  request: Request,
): Promise<NextResponse<ConfiguracionSuccess | { success: false; error: string }>> {
  const acceso = await usuarioConPermiso('crm_configuracion');
  if ('denegado' in acceso) return acceso.denegado;

  const cuerpo = await leerJson(request);
  if (!esObjeto(cuerpo)) return buildError('Cuerpo JSON inválido', 400);
  for (const clave of Object.keys(cuerpo)) {
    if (!CAMPOS_CONOCIDOS.has(clave)) return buildError(`Campo desconocido: ${clave}`, 400);
  }

  const cambios: CambiosConfigApifacturacion = {};
  if ('url' in cuerpo) cambios.url = cuerpo.url as string;
  if ('token' in cuerpo) cambios.token = cuerpo.token as string | null;

  try {
    const config = await getCrmConfigRepository();
    await new GuardarConfigApifacturacionUseCase({ config }).guardar(
      cambios,
      acceso.usuario.nombre,
    );
    return NextResponse.json(await leerConfiguracion(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof ErrorConfigApifacturacionInvalida) {
      return buildError(error.message, 400);
    }
    if (error instanceof ErrorCifradoConfig) {
      // Code-only log: never the message with key material.
      console.warn('[apifacturacion PUT] cifrado de secretos no disponible', {
        error: error.codigo,
      });
      return buildError(
        'No se puede guardar el secreto: el cifrado no está disponible (CRM_CONFIG_KEY ausente o inválida).',
        503,
      );
    }
    return errorDeCrm(error, 'PUT apifacturacion config', 'No se pudo guardar la configuración');
  }
}
