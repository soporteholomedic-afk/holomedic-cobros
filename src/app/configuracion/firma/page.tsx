import { notFound } from 'next/navigation';

import { resolveFirmaPageData } from '@/app/admin/plantillas/[area]/firma/resolveFirmaPageData';
import { AREA_CONFIGS } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import { FirmaForm } from '@/features/firma-correo/presentation/components/FirmaForm';

/**
 * MI FIRMA tab of `/configuracion` (feature `configuracion-tabs`, S3).
 *
 * Embeds the SAME signature editor as the legacy
 * `/admin/plantillas/{area}/firma` page — server page + the shared
 * `resolveFirmaPageData` resolver, with `FirmaForm` as the only
 * "use client" leaf — so `firma_correo`-only sessions edit their
 * signature INSIDE the tabs layout instead of bouncing out to the
 * legacy route. Gated by the proxy on the `firma_correo` permiso
 * (RUTAS_PROTEGIDAS). Defensive branches mirror the canonical entry:
 * an EMPTY area registry (no redirect/embed target) and an
 * unresolvable page (no session / missing user) are both a 404.
 */
export default async function ConfiguracionFirmaPage() {
  const firstArea = [...AREA_CONFIGS.keys()][0];
  if (firstArea === undefined) {
    notFound();
  }
  const resolved = await resolveFirmaPageData(firstArea);
  if (resolved.notFound) {
    notFound();
  }
  return <FirmaForm initialFirma={resolved.initialFirma} />;
}
