import { notFound, redirect } from 'next/navigation';

import { AREA_CONFIGS } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';

/**
 * Canonical `/admin/plantillas/firma` entry (editor-firmas task 3.3).
 *
 * Spec `firma-correo` / "Canonical entry": redirect to the FIRST
 * registered area's signature page — the sidebar "Mi firma" item and
 * any bookmarked bare URL land here. The route has its OWN
 * `RUTAS_PROTEGIDAS` entry with permiso `firma_correo` (design D6), so
 * it never inherits the generic `/admin/plantillas` gate and users
 * WITHOUT the `plantillas` permiso can still reach it.
 *
 * Defensive branch: an EMPTY registry has no redirect target → 404
 * (unreachable while `AREA_CONFIGS` ships consolidados/cobranza).
 */
export default function CanonicalFirmaPage(): never {
  const firstArea = [...AREA_CONFIGS.keys()][0];
  if (firstArea === undefined) {
    notFound();
  }
  redirect(`/admin/plantillas/${firstArea}/firma`);
}
