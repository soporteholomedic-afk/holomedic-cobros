import { getAreaConfig } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { GetOwnFirmaUseCase } from '@/features/firma-correo/application/getOwnFirma';
import { getFirmaDb } from '@/features/firma-correo/infrastructure/getFirmaDb';
import type { FirmaCorreo } from '@/features/firma-correo/domain/entities';

/**
 * The data-loading core of `/admin/plantillas/[area]/firma/page.tsx`
 * (editor-firmas task 3.1 — page/resolver pattern, same split as
 * `resolveAreaAndTemplates`: the Server Component stays a thin wrapper
 * that just calls `notFound()` or renders the client form, while this
 * async resolver is unit-testable).
 *
 * Resolution order:
 *  1. `getAreaConfig(area)` — an unregistered area is a 404
 *     (`{ notFound: true }`), before any I/O.
 *  2. `getSession()` — the proxy already gates this route, but the
 *     resolver refuses to proceed without a session (crash guard; the
 *     proxy owns the login-redirect behavior).
 *  3. Prefill from the user record (`getUsuarioDb().getById(sub)`):
 *     Nombre/Área/Correo (null correo → ''), Teléfono/Anexo empty.
 *  4. `GetOwnFirmaUseCase` — a STORED signature wins over the prefill.
 *     A missing/inactive user record is a 404 (nothing to prefill from,
 *     nothing to save against).
 */
export interface ResolvedFirmaPage {
  notFound: false;
  initialFirma: FirmaCorreo;
}

export interface FirmaPageNotFoundResult {
  notFound: true;
}

export type ResolveFirmaPageResult = ResolvedFirmaPage | FirmaPageNotFoundResult;

export async function resolveFirmaPageData(area: string): Promise<ResolveFirmaPageResult> {
  const areaConfig = getAreaConfig(area);
  if (!areaConfig) {
    return { notFound: true };
  }

  const session = await getSession();
  if (!session) {
    return { notFound: true };
  }

  const usuarioRepo = await getUsuarioDb();
  const usuario = await usuarioRepo.getById(session.sub);
  if (!usuario || !usuario.activo) {
    return { notFound: true };
  }

  const prefill: FirmaCorreo = {
    nombre: usuario.nombre,
    area: usuario.area,
    correo: usuario.correo ?? '',
    telefono: '',
    anexo: '',
  };

  const firmaRepo = await getFirmaDb();
  const useCase = new GetOwnFirmaUseCase(firmaRepo);
  const stored = await useCase.execute(session.sub);

  return { notFound: false, initialFirma: stored ?? prefill };
}
