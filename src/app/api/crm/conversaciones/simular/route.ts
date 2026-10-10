import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ProcesarMensajeWhatsappUseCase } from '@/features/crm/application/procesarMensajeWhatsapp';
import {
  SimularMensajeEntranteUseCase,
  SimulacionDesactivadaError,
  type ResultadoSimulacion,
} from '@/features/crm/application/simularMensajeEntrante';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `POST /api/crm/conversaciones/simular` (permiso
 * `crm_conversaciones`, agente-ia-crm E1) — the inbound simulator
 * entry point for the E1 mock-first demo: synthesizes the SAME
 * `whatsapp.message.received` event the Kapso webhook receives and
 * runs the REAL pipeline (ingesta → vinculación → bandeja).
 *
 * Body: `{telefono, texto}` — telefono accepts free text (E.164
 * normalization runs inside). Answers 403 SIMULACION_DESACTIVADA
 * whenever KAPSO_MODO === 'real': the simulator must be impossible in
 * production.
 *
 * NOTA: ruta SOLO-DEV, removible cuando Kapso esté configurado y el
 * modo real sea el default. El segmento estático `simular` convive
 * con el dinámico `[id]` (Next App Router: el estático gana).
 */

interface SimularSuccess extends ResultadoSimulacion {
  success: true;
}

function esSimularBody(v: unknown): v is { telefono: string; texto: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { telefono?: unknown }).telefono === 'string' &&
    typeof (v as { texto?: unknown }).texto === 'string' &&
    (v as { texto: string }).texto.trim() !== ''
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse<SimularSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conversaciones')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildCrmError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    if (!esSimularBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {telefono, texto} con texto no vacío',
        400,
      );
    }

    const { conversaciones, mensajes } = await getCrmDb();
    if (!conversaciones || !mensajes) {
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const procesar = new ProcesarMensajeWhatsappUseCase({ conversaciones, mensajes });
    const resultado = await new SimularMensajeEntranteUseCase({ procesar }).ejecutar({
      telefono: body.telefono,
      texto: body.texto,
    });
    return NextResponse.json({ success: true, ...resultado }, { status: 201 });
  } catch (error) {
    if (error instanceof SimulacionDesactivadaError) {
      return buildCrmError(
        'FORBIDDEN',
        'El simulador solo está disponible con KAPSO_MODO=simulado',
        403,
      );
    }
    return mapCrmError('crm conversaciones simular POST', error);
  }
}
