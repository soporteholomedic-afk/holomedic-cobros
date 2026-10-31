import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { MoverEmpresaUseCase } from '@/features/crm/application/moverEmpresa';

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function isEtapaBody(v: unknown): v is { etapa: string } {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as Record<string, unknown>).etapa === 'string';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('crm')) {
      return buildError('No autorizado', 401);
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('El cuerpo debe ser JSON válido', 400);
    }

    if (!isEtapaBody(body)) {
      return buildError('Cuerpo inválido. Requiere: {etapa}', 400);
    }

    const repo = await getCrmDb();
    const empresa = await new MoverEmpresaUseCase(repo).execute(id, body.etapa);

    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    if (error instanceof Error && error.name === 'EtapaInvalidaError') {
      return buildError(error.message, 400);
    }
    if (error instanceof Error && error.name === 'EmpresaNotFoundError') {
      return buildError('Empresa no encontrada', 404);
    }
    console.error('PATCH /api/crm/empresas/[id]/etapa failed:', error);
    return buildError('Error al mover la empresa', 500);
  }
}
