import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ActualizarEmpresaUseCase } from '@/features/crm/application/actualizarEmpresa';
import type { EditarEmpresaDatos } from '@/features/crm/domain/entities';
import { buildError, errorDeCrm, esDatosEmpresa, exigirCrm, leerJson } from '../../_lib/http';

/** Edit the empresa data and replace its contacts list. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { id } = await params;
    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (!esDatosEmpresa(body)) {
      return buildError('Cuerpo inválido. Requiere: {razonSocial, ruc, contactos: [{nombre, telefono}]}', 400);
    }

    const repo = await getCrmDb();
    const empresa = await new ActualizarEmpresaUseCase(repo).execute(id, body as EditarEmpresaDatos);
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/empresas/[id]', 'Error al guardar la empresa');
  }
}
