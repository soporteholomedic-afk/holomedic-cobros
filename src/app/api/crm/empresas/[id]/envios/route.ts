import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { EnviadorCorreoCrm } from '@/features/crm/infrastructure/email/enviadorCorreoCrm';
import {
  EnviarCorreoCrmUseCase,
  FalloEnvioCorreoError,
  type ResultadoEnviarCorreoCrm,
} from '@/features/crm/application/enviarCorreoCrm';
import { PLANTILLAS_CORREO } from '@/features/crm/domain/plantillasCorreo';
import type { Clock, PlantillaCrmKey } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/envios` (permiso `crm`, tasks 5.2, design D5,
 * spec EM-4/OP-4) — ONE manual per-company dispatch. The use case owns
 * the whole ordering contract: resolve principal contacto → pre-dispatch
 * machine plan (illegal targets throw BEFORE anything is sent) → SMTP →
 * machine write through the EXISTING use cases → ENVIADO log.
 *
 * Body: { plantilla } — one of the 5 PLANTILLAS_CORREO keys (the guard
 * reads the catalog itself, so it cannot drift from the templates).
 *
 * Errors: typed `CrmErrorResponse` — validation/not-found map through
 * `mapCrmError`; an SMTP failure reaches the route as the typed
 * `FalloEnvioCorreoError` and answers a user-safe 500 INTERNAL_ERROR
 * (the diagnostic detail lives ONLY in the CRM_EnviosCorreos FALLIDO
 * row; the message never echoes SMTP internals).
 */

interface EnviosSuccess extends ResultadoEnviarCorreoCrm {
  success: true;
}

function isEnviosBody(v: unknown): v is { plantilla: PlantillaCrmKey } {
  if (typeof v !== 'object' || v === null) return false;
  const plantilla = (v as { plantilla?: unknown }).plantilla;
  return typeof plantilla === 'string' && Object.hasOwn(PLANTILLAS_CORREO, plantilla);
}

/** `Number.parseInt` with a positivity bound; null → route answers 400. */
function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<EnviosSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { id: rawId } = await ctx.params;
    const id = parseEmpresaId(rawId);
    if (id === null) {
      return buildCrmError('VALIDATION_ERROR', '"id" debe ser un número entero positivo', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildCrmError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    if (!isEnviosBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {plantilla} con una de las 5 plantillas CRM',
        400,
      );
    }

    const db = await getCrmDb();
    const clock: Clock = () => new Date();
    const resultado = await new EnviarCorreoCrmUseCase({
      empresas: db.empresas,
      pipelines: db.pipeline,
      actividades: db.actividades,
      envios: db.envios,
      correo: new EnviadorCorreoCrm(),
      clock,
    }).execute({ empresaId: id, plantilla: body.plantilla, usuario: session.sub });

    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    if (error instanceof FalloEnvioCorreoError) {
      return buildCrmError(
        'INTERNAL_ERROR',
        'El correo no pudo enviarse. Revise el registro de envíos e intente nuevamente.',
        500,
      );
    }
    return mapCrmError('crm empresas [id] envios POST', error);
  }
}
