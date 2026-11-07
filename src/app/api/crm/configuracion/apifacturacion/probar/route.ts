import { NextResponse } from 'next/server';

import { errorDeCrm } from '@/app/api/crm/_lib/http';
import {
  probarApifacturacion,
  resolverConfigApifacturacion,
  type ResultadoPruebaApifacturacion,
} from '@/features/crm/application/configuracion/configApifacturacion';
import { getCrmConfigRepository } from '@/features/crm/infrastructure/getCrmDb';

import { usuarioConPermiso } from '../../_lib/guardia';

/**
 * `POST /api/crm/configuracion/apifacturacion/probar` (crm-consulta-sunat
 * T2, permiso `crm_configuracion`). Runs ONE real lookup against
 * apifacturacion (a PAID query) and answers `{ success, ok, mensaje }`
 * with generic messages on failure; the token is never logged and never
 * leaves the server in clear.
 */

interface PruebaSuccess {
  success: true;
  ok: boolean;
  mensaje: string;
}

export async function POST(): Promise<NextResponse<PruebaSuccess | { success: false; error: string }>> {
  const acceso = await usuarioConPermiso('crm_configuracion');
  if ('denegado' in acceso) return acceso.denegado;

  try {
    const config = await getCrmConfigRepository();
    const resuelta = await resolverConfigApifacturacion({ config });
    const resultado: ResultadoPruebaApifacturacion = await probarApifacturacion(resuelta);
    return NextResponse.json({ success: true, ok: resultado.ok, mensaje: resultado.mensaje });
  } catch (error) {
    return errorDeCrm(error, 'POST apifacturacion probar', 'No se pudo probar la conexión');
  }
}
