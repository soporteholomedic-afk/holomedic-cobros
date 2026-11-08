import { NextResponse } from 'next/server';
import { getCrmAtenciones, getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  ListarEmpresasInactivasUseCase,
  type OpcionesInactivas,
} from '@/features/crm/application/listarEmpresasInactivas';
import { hoyEnLima } from '@/features/crm/application/validar';
import { buildError, exigirCrm } from '../../_lib/http';

/**
 * GET — the "Inactivas" view (feature crm-vista-inactivas). Two sources:
 *
 * - Default: clientes del CRM whose last performed service is
 *   `UMBRAL_MESES_INACTIVIDAD` months old or more, most abandoned first.
 * - `?fuente=sigla`: clientes dormidos de SIGLA WITHOUT a CRM ficha (S10).
 *
 * Filters/sort/pagination via query params (S14-S16), parsed with whitelists:
 * `q`, `sector`, `estado` (sin_actividad|pendiente_primera), `mesesMin`,
 * `mesesMax`, `contacto` (con|sin, CRM only), `orden`
 * (abandono|razonSocial|ultimaAtencion|ultimoContacto), `direccion`
 * (asc|desc), `pagina`. The activity is read LIVE from SIGLA in bulk lookups —
 * never from CRM calls (regla S6.6); a missing attention is never inactivity
 * (regla S6.7). A SIGLA failure is 503 — the CRM itself is up, only the live
 * lookup is not.
 */
const ORDENES = ['abandono', 'razonSocial', 'ultimaAtencion', 'ultimoContacto'] as const;

function parseOpciones(searchParams: URLSearchParams): OpcionesInactivas {
  const opciones: OpcionesInactivas = {};
  const q = searchParams.get('q')?.trim();
  if (q) opciones.q = q;
  const sector = searchParams.get('sector')?.trim();
  if (sector) opciones.sector = sector;
  const estado = searchParams.get('estado');
  if (estado === 'sin_actividad' || estado === 'pendiente_primera') opciones.estado = estado;
  const mesesMin = Number(searchParams.get('mesesMin'));
  if (searchParams.has('mesesMin') && Number.isFinite(mesesMin)) opciones.mesesMin = mesesMin;
  const mesesMax = Number(searchParams.get('mesesMax'));
  if (searchParams.has('mesesMax') && Number.isFinite(mesesMax)) opciones.mesesMax = mesesMax;
  const contacto = searchParams.get('contacto');
  if (contacto === 'con' || contacto === 'sin') opciones.contacto = contacto;
  const orden = searchParams.get('orden');
  if (orden && (ORDENES as readonly string[]).includes(orden)) opciones.orden = orden as (typeof ORDENES)[number];
  const direccion = searchParams.get('direccion');
  if (direccion === 'asc' || direccion === 'desc') opciones.direccion = direccion;
  opciones.pagina = Number(searchParams.get('pagina') ?? '1') || 1;
  return opciones;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { searchParams } = new URL(request.url);
    const [empresas, atenciones] = await Promise.all([getCrmDb(), getCrmAtenciones()]);
    const useCase = new ListarEmpresasInactivasUseCase(empresas, atenciones);
    const opciones = parseOpciones(searchParams);
    const cabeceras = { headers: { 'Cache-Control': 'no-store' } };

    // Segmento "Solo en SIGLA" (S10): clientes dormidos sin ficha en el CRM.
    if (searchParams.get('fuente') === 'sigla') {
      const segmento = await useCase.executeSigla(hoyEnLima(), opciones);
      return NextResponse.json(
        {
          success: true,
          filas: segmento.filas,
          total: segmento.total,
          totalFuente: segmento.totalFuente,
          pagina: segmento.pagina,
          paginas: segmento.paginas,
        },
        cabeceras,
      );
    }

    const listado = await useCase.execute(hoyEnLima(), opciones);
    return NextResponse.json(
      {
        success: true,
        filas: listado.filas,
        sinInformacion: listado.sinInformacion,
        total: listado.total,
        totalFuente: listado.totalFuente,
        pagina: listado.pagina,
        paginas: listado.paginas,
        sectores: listado.sectores,
      },
      cabeceras,
    );
  } catch (error) {
    // The lookup is the only live dependency here; a failure means SIGLA is
    // unreachable — reported as 503 with a clear message, never leaking the
    // driver error.
    console.error('GET /api/crm/empresas/inactivas failed (SIGLA):', error);
    return buildError('No se pudo consultar la actividad en SIGLA', 503);
  }
}
