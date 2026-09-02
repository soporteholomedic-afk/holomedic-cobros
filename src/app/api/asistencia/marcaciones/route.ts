import { NextResponse } from 'next/server';

import { AutenticarDispositivoUseCase } from '@/features/asistencia-rrhh/application/autenticarDispositivo';
import { IngestarMarcacionesUseCase } from '@/features/asistencia-rrhh/application/ingestarMarcaciones';
import {
  TIPOS_VERIFICACION,
  type MarcacionWire,
} from '@/features/asistencia-rrhh/domain/entities';
import { getAsistenciaDb } from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';

/**
 * POST /api/asistencia/marcaciones — device punch ingestion
 * (REQ-F1-01/02/14). This path is deliberately OUT of RUTAS_PROTEGIDAS:
 * the ZKTeco worker authenticates with its own Bearer token (hashed and
 * matched against dispositivos.apiTokenHash), not with a user session.
 *
 * Validation is ALL-OR-NOTHING: invalid JSON, a malformed item or a
 * batch over the cap rejects with 400 before anything is persisted.
 * Wire contract is snake_case (ADR-2) and commands travel back in the
 * same response so the worker needs no extra poll (REQ-F1-04).
 */

const LOTE_MAX = 500;
const USER_ID_MAX = 20; // dbo.marcaciones_raw.userId VARCHAR(20)
const FECHA_HORA_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function esMarcacionValida(v: unknown): v is MarcacionWire {
  if (typeof v !== 'object' || v === null) return false;
  const item = v as Record<string, unknown>;
  if (typeof item.user_id !== 'string' || item.user_id.length === 0 || item.user_id.length > USER_ID_MAX) {
    return false;
  }
  // Naive America/Lima wall-clock string (ADR-9). The `Z`-suffixed parse
  // is a calendar-validity check only — the string itself travels to SQL
  // Server, which CASTs it to DATETIME2(0) with no timezone shift.
  if (typeof item.fecha_hora !== 'string' || !FECHA_HORA_PATTERN.test(item.fecha_hora)) return false;
  if (Number.isNaN(Date.parse(`${item.fecha_hora}Z`))) return false;
  if (typeof item.punch !== 'number' || !Number.isInteger(item.punch)) return false;
  return (TIPOS_VERIFICACION as readonly string[]).includes(item.tipo_verificacion as string);
}

function parsearLote(body: unknown): MarcacionWire[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.codigo_dispositivo !== 'string' || obj.codigo_dispositivo.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(obj.marcaciones) || obj.marcaciones.length === 0 || obj.marcaciones.length > LOTE_MAX) {
    return null;
  }
  const marcaciones: unknown[] = obj.marcaciones;
  if (!marcaciones.every(esMarcacionValida)) return null;
  return marcaciones;
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

    // 2. All-or-nothing body validation — nothing persists on any 400.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('El cuerpo debe ser JSON válido', 400);
    }
    const marcaciones = parsearLote(body);
    if (!marcaciones) {
      return buildError(
        `Cuerpo inválido. Requiere { codigo_dispositivo, marcaciones[1..${LOTE_MAX}] } con items { user_id, fecha_hora "YYYY-MM-DDTHH:mm:ss", punch entero, tipo_verificacion HUELLA|TARJETA|PIN }`,
        400,
      );
    }

    // 3. Idempotent ingestion + unknown-user alerts + command delivery.
    const resultado = await new IngestarMarcacionesUseCase(db).execute(
      autenticacion.dispositivo,
      marcaciones,
    );

    return NextResponse.json({
      recibidos: resultado.recibidos,
      insertados: resultado.insertados,
      duplicados: resultado.duplicados,
      comandos: resultado.comandos.map((c) => ({ id: c.id, tipo: c.tipo, payload: c.payload })),
    });
  } catch (error) {
    console.error('asistencia marcaciones POST error:', error);
    return buildError('Error interno', 500);
  }
}
