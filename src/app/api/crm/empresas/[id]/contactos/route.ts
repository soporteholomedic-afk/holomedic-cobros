import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  RegistrarContactoUseCase,
  type RegistrarContactoDatos,
} from '@/features/crm/application/registrarContacto';
import { hoyEnLima } from '@/features/crm/application/validar';
import { buildError, errorDeCrm, esObjeto, esTextoOpcional, leerJson, usuarioCrm } from '../../../_lib/http';

/** Register one contact (outbound, or inbound on an existing card) and its history entry. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const sesion = await usuarioCrm();
    if ('denegado' in sesion) return sesion.denegado;

    const { id } = await params;
    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (
      !esObjeto(body) ||
      typeof body.direccion !== 'string' ||
      typeof body.medio !== 'string' ||
      typeof body.resultado !== 'string' ||
      !esTextoOpcional(body.medioOtro) ||
      !esTextoOpcional(body.resumen)
    ) {
      return buildError('Cuerpo inválido. Requiere: {direccion, medio, resultado, proximaAccion}', 400);
    }

    const repo = await getCrmDb();
    const { empresa, interaccion } = await new RegistrarContactoUseCase(repo).execute(
      id,
      body as unknown as RegistrarContactoDatos,
      sesion.usuario,
      hoyEnLima(),
    );
    return NextResponse.json({ success: true, empresa, interaccion }, { status: 201 });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/empresas/[id]/contactos', 'Error al registrar el contacto');
  }
}
