import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarEmpresasUseCase } from '@/features/crm/application/listarEmpresas';
import { CrearEmpresaUseCase } from '@/features/crm/application/crearEmpresa';
import type { CrearEmpresaDatos } from '@/features/crm/domain/entities';

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isOptionalString(v: unknown): boolean {
  return v === undefined || v === null || typeof v === 'string';
}

function isCreateBody(v: unknown): v is CrearEmpresaDatos {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    isString(obj.razonSocial) &&
    isString(obj.ruc) &&
    isString(obj.contactoNombre) &&
    isString(obj.contactoTelefono) &&
    isOptionalString(obj.sector) &&
    isOptionalString(obj.contactoCorreo) &&
    isOptionalString(obj.notas)
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('crm')) {
      return buildError('No autorizado', 401);
    }

    const repo = await getCrmDb();
    const empresas = await new ListarEmpresasUseCase(repo).execute();

    return NextResponse.json({ success: true, empresas });
  } catch (error) {
    console.error('GET /api/crm/empresas failed:', error);
    return buildError('Error al listar empresas', 500);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('crm')) {
      return buildError('No autorizado', 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('El cuerpo debe ser JSON válido', 400);
    }

    if (!isCreateBody(body)) {
      return buildError(
        'Cuerpo inválido. Requiere: {razonSocial, ruc, contactoNombre, contactoTelefono}',
        400,
      );
    }

    const repo = await getCrmDb();
    const empresa = await new CrearEmpresaUseCase(repo).execute(body);

    return NextResponse.json({ success: true, empresa }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'DatosEmpresaInvalidosError') {
      return buildError(error.message, 400);
    }
    if (error instanceof Error && error.name === 'RucDuplicadoError') {
      return buildError(error.message, 409);
    }
    console.error('POST /api/crm/empresas failed:', error);
    return buildError('Error al crear la empresa', 500);
  }
}
