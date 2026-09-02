import { NextResponse } from 'next/server';

import { AutenticarDispositivoUseCase } from '@/features/asistencia-rrhh/application/autenticarDispositivo';
import { HeartbeatUseCase, type EntradaHeartbeat } from '@/features/asistencia-rrhh/application/heartbeat';
import type { UsuarioEquipo } from '@/features/asistencia-rrhh/domain/entities';
import { aFechaHoraNaiva } from '@/features/asistencia-rrhh/domain/fechaNaive';
import { getAsistenciaDb } from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';

/**
 * POST /api/asistencia/heartbeat — device liveness + clock drift + user
 * bootstrap (REQ-F1-03/09, ADR-1). This path is deliberately OUT of
 * RUTAS_PROTEGIDAS: the ZKTeco worker authenticates with its own Bearer
 * token (hashed and matched against dispositivos.apiTokenHash), not with
 * a user session.
 *
 * Body is all-optional wire shape `{ drift_seg?, usuarios?: [{user_id,
 * nombre}] }` — a plain heartbeat just stamps ultimaSincronizacion.
 * Validation is ALL-OR-NOTHING: a malformed body rejects 400 before the
 * device's heartbeat is stamped. The answer carries `hora_servidor` as a
 * naive America/Lima wall-clock string (ADR-9).
 */

const USER_ID_MAX = 20; // dbo.empleados.userId VARCHAR(20)
const NOMBRE_MAX = 100; // dbo.empleados.nombres NVARCHAR(100)

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function parsearEntrada(body: unknown): EntradaHeartbeat | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;

  let drift_seg: number | undefined;
  if (obj.drift_seg !== undefined) {
    if (typeof obj.drift_seg !== 'number' || !Number.isFinite(obj.drift_seg)) return null;
    drift_seg = obj.drift_seg;
  }

  let usuarios: UsuarioEquipo[] | undefined;
  if (obj.usuarios !== undefined) {
    if (!Array.isArray(obj.usuarios)) return null;
    usuarios = [];
    for (const item of obj.usuarios) {
      if (typeof item !== 'object' || item === null) return null;
      const u = item as Record<string, unknown>;
      if (typeof u.user_id !== 'string' || u.user_id.length === 0 || u.user_id.length > USER_ID_MAX) {
        return null;
      }
      if (typeof u.nombre !== 'string' || u.nombre.trim().length === 0 || u.nombre.length > NOMBRE_MAX) {
        return null;
      }
      usuarios.push({ userId: u.user_id, nombre: u.nombre });
    }
  }

  return { drift_seg, usuarios };
}

export async function POST(request: Request): Promise<NextResponse> {
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

    // 2. All-or-nothing body validation — nothing is stamped on any 400.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('El cuerpo debe ser JSON válido', 400);
    }
    const entrada = parsearEntrada(body);
    if (!entrada) {
      return buildError(
        'Cuerpo inválido. Requiere { drift_seg?: number, usuarios?: [{ user_id, nombre }] }',
        400,
      );
    }

    // 3. Stamp heartbeat → drift evaluation → user bootstrap (ADR-1).
    const resultado = await new HeartbeatUseCase(db).execute(autenticacion.dispositivo, entrada);

    return NextResponse.json({ hora_servidor: aFechaHoraNaiva(resultado.horaServidor) });
  } catch (error) {
    console.error('asistencia heartbeat POST error:', error);
    return buildError('Error interno', 500);
  }
}
