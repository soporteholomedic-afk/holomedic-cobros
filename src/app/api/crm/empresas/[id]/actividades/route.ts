import { NextResponse } from 'next/server';
import { getCrmDb, getCrmOportunidadesDb } from '@/features/crm/infrastructure/getCrmDb';
import { RegistrarActividadUseCase, type RegistrarActividadDatos } from '@/features/crm/application/registrarActividad';
import { hoyEnLima } from '@/features/crm/application/validar';
import { buildError, esActividad, errorDeCrm, leerJson, usuarioCrm } from '../../../_lib/http';

/** Register one activity — linked to an oportunidad, or general to the empresa history (S6.4). */
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
    if (!esActividad(body)) {
      return buildError('Cuerpo inválido. Requiere: {idOportunidad, direccion, medio, resultado}', 400);
    }

    const [empresas, oportunidades] = await Promise.all([getCrmDb(), getCrmOportunidadesDb()]);
    const { empresa, oportunidad, interaccion } = await new RegistrarActividadUseCase(
      empresas,
      oportunidades,
    ).execute(id, body.idOportunidad as string | null, body as unknown as RegistrarActividadDatos, sesion.usuario, hoyEnLima());
    return NextResponse.json({ success: true, empresa, oportunidad, interaccion }, { status: 201 });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/empresas/[id]/actividades', 'Error al registrar la actividad');
  }
}
