import { NextResponse } from 'next/server';
import { getCrmAtenciones, getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarEmpresasInactivasUseCase } from '@/features/crm/application/listarEmpresasInactivas';
import { hoyEnLima } from '@/features/crm/application/validar';
import { buildError, exigirCrm } from '../../_lib/http';

/**
 * GET — the "Inactivas" view (feature crm-vista-inactivas): clientes de SIGLA
 * whose last performed service is `UMBRAL_MESES_INACTIVIDAD` months old or
 * more, most abandoned first, plus `pendiente_primera` clientes last and
 * `sinInformacion` as the count of clientes that can never reach SIGLA (no
 * RUC). The activity is read LIVE from SIGLA in one bulk lookup — never from
 * CRM calls (regla S6.6), and a missing attention is never inactivity
 * (regla S6.7). A SIGLA failure is 503 — the CRM itself is up, only the live
 * lookup is not.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { searchParams } = new URL(request.url);
    const [empresas, atenciones] = await Promise.all([getCrmDb(), getCrmAtenciones()]);
    const useCase = new ListarEmpresasInactivasUseCase(empresas, atenciones);

    // Segmento "Solo en SIGLA" (S10): clientes dormidos sin ficha en el CRM.
    if (searchParams.get('fuente') === 'sigla') {
      const pagina = Number(searchParams.get('pagina') ?? '1') || 1;
      const segmento = await useCase.executeSigla(hoyEnLima(), pagina);
      return NextResponse.json(
        {
          success: true,
          filas: segmento.filas,
          total: segmento.total,
          pagina: segmento.pagina,
          paginas: segmento.paginas,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const listado = await useCase.execute(hoyEnLima());
    return NextResponse.json(
      { success: true, filas: listado.filas, sinInformacion: listado.sinInformacion },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // The lookup is the only live dependency here; a failure means SIGLA is
    // unreachable — reported as 503 with a clear message, never leaking the
    // driver error.
    console.error('GET /api/crm/empresas/inactivas failed (SIGLA):', error);
    return buildError('No se pudo consultar la actividad en SIGLA', 503);
  }
}
