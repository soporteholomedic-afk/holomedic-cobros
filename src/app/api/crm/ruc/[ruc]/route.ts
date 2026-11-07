import { NextResponse } from 'next/server';

import { buildError, errorDeCrm, exigirCrm } from '../../_lib/http';
import { ConsultarRucUseCase } from '@/features/crm/application/consultarRuc';
import { resolverConfigApifacturacion } from '@/features/crm/application/configuracion/configApifacturacion';
import type { DatosSunat } from '@/features/crm/domain/entities';
import {
  ConsultaNoConfiguradaError,
  RucNoEncontradoError,
  ServicioConsultaError,
} from '@/features/crm/domain/errors';
import { ApiFacturacionCliente } from '@/features/crm/infrastructure/apifacturacion/clienteApifacturacion';
import { getCrmConfigRepository } from '@/features/crm/infrastructure/getCrmDb';

/**
 * `GET /api/crm/ruc/{ruc}` — SUNAT lookup for the alta form and the
 * "Falta RUC" card (crm-consulta-sunat T4, S1/S5). Covered by the
 * permiso `crm` via the /api/crm prefix (RUTAS_PROTEGIDAS
 * longest-first), so the in-route gate is the plain `exigirCrm()`.
 *
 * Success: `{ success: true, datos }` (`no-store`: the SUNAT state must
 * not sit in caches). Errors map to UI states: RUC inválido 400, token
 * sin configurar 503 (S5), RUC sin datos 404, apifacturacion caído 502.
 * The token never reaches the response.
 */

interface RucSuccess {
  success: true;
  datos: DatosSunat;
}

type RespuestaRuc = RucSuccess | { success: false; error: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ruc: string }> },
): Promise<NextResponse<RespuestaRuc>> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { ruc } = await params;
    const servicio = new ApiFacturacionCliente({
      config: async () => resolverConfigApifacturacion({ config: await getCrmConfigRepository() }),
    });
    const datos = await new ConsultarRucUseCase(servicio).execute(ruc);
    return NextResponse.json({ success: true, datos }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // The new errors are mapped here: _lib/http's POR_NOMBRE map is shared
    // by every CRM route and stays untouched in this task.
    if (error instanceof ConsultaNoConfiguradaError) return buildError(error.message, 503);
    if (error instanceof RucNoEncontradoError) return buildError(error.message, 404);
    if (error instanceof ServicioConsultaError) return buildError(error.message, 502);
    return errorDeCrm(error, 'GET /api/crm/ruc/[ruc]', 'Error al consultar el RUC');
  }
}
