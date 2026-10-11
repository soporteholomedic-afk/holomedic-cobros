import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { iniciarBarredorTareas } from '@/features/crm/infrastructure/agentes/iniciarBarredorTareas';
import { crearProcesadorTareasAgente } from '@/features/crm/infrastructure/agentes/crearProcesadorTareasAgente';
import { ProcesarMensajeWhatsappUseCase } from '@/features/crm/application/procesarMensajeWhatsapp';
import {
  SimularMensajeEntranteUseCase,
  SimulacionDesactivadaError,
  type ResultadoSimulacion,
} from '@/features/crm/application/simularMensajeEntrante';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';
import { esModoSimulado } from '@/features/crm/infrastructure/whatsapp/crearEnviadorWhatsapp';

/**
 * `POST /api/crm/conversaciones/simular` (permiso
 * `crm_conversaciones`, agente-ia-crm E1) — the inbound simulator
 * entry point for the E1 mock-first demo: synthesizes the SAME
 * `whatsapp.message.received` event the Kapso webhook receives and
 * runs the REAL pipeline (ingesta → vinculación → bandeja).
 *
 * Body: `{telefono, texto}` — telefono accepts free text (E.164
 * normalization runs inside). The route exists ONLY while the
 * simulated mode is active (esModoSimulado: KAPSO_MODO=simulado
 * explícito, o sin MODO en desarrollo) — otherwise 404 before any
 * auth/body/db work (remediation R1-ruta-simular-siempre-presente:
 * un dev tool no debe ser descubrible cuando no aplica; alinea con
 * la tarjeta simulador que el GET lista muestra con el mismo flag).
 *
 * NOTA: ruta SOLO-DEV, removible cuando Kapso esté configurado y el
 * modo real sea el default. El segmento estático `simular` convive
 * con el dinámico `[id]` (Next App Router: el estático gana).
 */

interface SimularSuccess extends ResultadoSimulacion {
  success: true;
}

// E2·T5: boot the lazy sweeper once per process (same rule as the
// webhook — the simulator fills the SAME durable queue).
iniciarBarredorTareas();

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
  // Dev-only tool: existe SOLO con modo simulado activo (mismo flag
  // que la tarjeta del UI) — si no, 404 antes de tocar sesión/
  // cuerpo/DB: indescubrible cuando no aplica.
  if (!esModoSimulado()) {
    return buildCrmError('NOT_FOUND_ERROR', 'No encontrado', 404);
  }
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

    const { conversaciones, mensajes, tareas } = await getCrmDb();
    if (!conversaciones || !mensajes) {
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const procesar = new ProcesarMensajeWhatsappUseCase({
      conversaciones,
      mensajes,
      tareas,
    });
    const resultado = await new SimularMensajeEntranteUseCase({ procesar }).ejecutar({
      telefono: body.telefono,
      texto: body.texto,
    });
    // E2·T5: drain the queue the pipeline just filled, fire-and-forget
    // (the ack path stays as fast as E1; the sweeper backstops it).
    if (typeof resultado.tareaAgenteId === 'number') {
      void crearProcesadorTareasAgente()
        .procesar()
        .catch((err: unknown) => {
          console.error('[crm simular] drenaje de tareas del agente falló', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
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
