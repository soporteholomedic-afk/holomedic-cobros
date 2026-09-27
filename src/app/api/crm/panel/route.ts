import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarPanelCrmUseCase } from '@/features/crm/application/listarPanelCrm';
import type { PanelCrm } from '@/features/crm/application/listarPanelCrm';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../empresas/errorResponse';

/**
 * `/api/crm/panel` (permiso `crm`, rediseno-crm-panel task 7.2, design
 * D4) — the ONE aggregate read the redesigned /crm panel renders from:
 * every empresa with its pipeline projection + principal contacto in a
 * single JOIN fetch. Derivation, KPIs, tab counts and search happen
 * CLIENT-SIDE from this payload (no per-tab endpoints). Team-wide — no
 * per-user identity resolution (the cola route needs getUsuarioDb only
 * for its sinGestion scoping).
 *
 * Errors: typed `CrmErrorResponse` codes (see errorResponse.ts).
 */

interface PanelSuccess extends PanelCrm {
  success: true;
}

export async function GET(): Promise<NextResponse<PanelSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { panel } = await getCrmDb();
    const panelData = await new ListarPanelCrmUseCase(panel, () => new Date()).execute();
    return NextResponse.json({ success: true, ...panelData });
  } catch (error) {
    return mapCrmError('crm panel GET', error);
  }
}
