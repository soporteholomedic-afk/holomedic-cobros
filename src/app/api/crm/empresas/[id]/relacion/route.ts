import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { RELACIONES, type Relacion } from '@/features/crm/domain/entities';
import { buildError, errorDeCrm, esObjeto, exigirCrm, leerJson } from '../../../_lib/http';

/** Write the commercial relationship of the ficha (Prospecto | Cliente) — never derived from a deal result. */
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
    if (
      !esObjeto(body) ||
      typeof body.relacion !== 'string' ||
      !(RELACIONES as readonly string[]).includes(body.relacion)
    ) {
      return buildError("Cuerpo inválido. Requiere: {relacion: 'prospecto' | 'cliente'}", 400);
    }

    const repo = await getCrmDb();
    const empresa = await repo.updateRelacion(id, body.relacion as Relacion);
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/empresas/[id]/relacion', 'Error al guardar la relación');
  }
}
