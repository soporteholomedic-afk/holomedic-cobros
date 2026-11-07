import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarEmpresasUseCase } from '@/features/crm/application/listarEmpresas';
import { CrearEmpresaUseCase } from '@/features/crm/application/crearEmpresa';
import type { CrearEmpresaDatos } from '@/features/crm/domain/entities';
import { buildError, errorDeCrm, esDatosEmpresa, exigirCrm, leerJson } from '../_lib/http';

export async function GET(): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const repo = await getCrmDb();
    const empresas = await new ListarEmpresasUseCase(repo).execute();
    return NextResponse.json({ success: true, empresas });
  } catch (error) {
    return errorDeCrm(error, 'GET /api/crm/empresas', 'Error al listar empresas');
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (!esDatosEmpresa(body)) {
      return buildError('Cuerpo inválido. Requiere: {razonSocial, ruc, contactos: [{nombre, telefono}]}', 400);
    }

    const repo = await getCrmDb();
    // Ficha ONLY (S7.1): no etapa/origen is read here — deals live at /api/crm/oportunidades.
    const empresa = await new CrearEmpresaUseCase(repo).execute(body as CrearEmpresaDatos);
    return NextResponse.json({ success: true, empresa }, { status: 201 });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/empresas', 'Error al crear la empresa');
  }
}
