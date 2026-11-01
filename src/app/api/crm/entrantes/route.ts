import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { RegistrarEntranteUseCase, type RegistrarEntranteDatos } from '@/features/crm/application/registrarEntrante';
import { hoyEnLima } from '@/features/crm/application/validar';
import { buildError, errorDeCrm, esObjeto, esTextoOpcional, leerJson, usuarioCrm } from '../_lib/http';

/** "Nos contactaron": adds the contact to the matching empresa or creates a card in Contactado. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const sesion = await usuarioCrm();
    if ('denegado' in sesion) return sesion.denegado;

    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (
      !esObjeto(body) ||
      typeof body.razonSocial !== 'string' ||
      typeof body.medio !== 'string' ||
      !['medioOtro', 'persona', 'telefono', 'correo', 'ruc', 'necesita', 'origen', 'sector'].every((k) => esTextoOpcional(body[k]))
    ) {
      return buildError('Cuerpo inválido. Requiere: {razonSocial, medio, telefono o correo, proximaAccion}', 400);
    }

    const repo = await getCrmDb();
    const { empresa, existente } = await new RegistrarEntranteUseCase(repo).execute(
      body as unknown as RegistrarEntranteDatos,
      sesion.usuario,
      hoyEnLima(),
    );
    return NextResponse.json({ success: true, empresa, existente }, { status: 201 });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/entrantes', 'Error al registrar el contacto entrante');
  }
}
