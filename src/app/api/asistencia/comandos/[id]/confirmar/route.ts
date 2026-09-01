import { NextResponse } from 'next/server';

import { AutenticarDispositivoUseCase } from '@/features/asistencia-rrhh/application/autenticarDispositivo';
import { ConfirmarComandoUseCase } from '@/features/asistencia-rrhh/application/confirmarComando';
import { aFechaHoraNaiva } from '@/features/asistencia-rrhh/domain/fechaNaive';
import { getAsistenciaDb } from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';

/**
 * POST /api/asistencia/comandos/[id]/confirmar — the worker
 * acknowledges an applied command (REQ-F1-04). This path is
 * deliberately OUT of RUTAS_PROTEGIDAS: the ZKTeco worker authenticates
 * with its own Bearer token (hashed and matched against
 * dispositivos.apiTokenHash), not with a user session.
 *
 * Outcomes: 200 {ok, estado, confirmadoAt} — a re-confirm of an
 * already-terminal command is a 200 no-op echoing the ORIGINAL
 * confirmadoAt — 400 for a non-integer id, 401 unknown token, 403 for
 * another device's command (or a disabled device), 404 unknown id.
 */

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = await getAsistenciaDb();

    // 1. Device Bearer auth (401 unknown/missing token, 403 disabled device).
    const autenticacion = await new AutenticarDispositivoUseCase(db.dispositivos).execute(
      request.headers.get('authorization'),
    );
    if (!autenticacion.ok) {
      return autenticacion.error === 'INACTIVO'
        ? buildError('Dispositivo inactivo', 403)
        : buildError('No autorizado', 401);
    }

    // 2. Path param: BIGINT PK, digits only (rejects '', '1.5', '-1', junk).
    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return buildError('"id" debe ser un entero positivo', 400);
    }
    const comandoId = Number(id);

    // 3. Confirm — the port tells CONFIRMADO / NO_EXISTE / AJENO apart.
    const resultado = await new ConfirmarComandoUseCase(db.comandos).execute(
      comandoId,
      autenticacion.dispositivo,
    );
    if (resultado.estado === 'NO_EXISTE') {
      return buildError('Comando inexistente', 404);
    }
    if (resultado.estado === 'AJENO') {
      return buildError('El comando pertenece a otro dispositivo', 403);
    }

    return NextResponse.json({
      ok: true,
      estado: 'CONFIRMADO',
      confirmadoAt: resultado.confirmadoAt ? aFechaHoraNaiva(resultado.confirmadoAt) : null,
    });
  } catch (error) {
    console.error('asistencia comandos confirmar POST error:', error);
    return buildError('Error interno', 500);
  }
}
