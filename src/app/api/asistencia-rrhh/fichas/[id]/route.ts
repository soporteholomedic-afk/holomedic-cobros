import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import {
  CompletarFichaUseCase,
  FichaInvalidaError,
} from '@/features/asistencia-rrhh/application/completarFicha';
import type { DatosFicha } from '@/features/asistencia-rrhh/domain/entities';
import { getAsistenciaDb } from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import { FichaNoEncontradaError } from '@/features/asistencia-rrhh/infrastructure/sqlserver/SqlServerEmpleadoRepository';

/**
 * POST /api/asistencia-rrhh/fichas/[id] — RRHH ficha completion
 * (REQ-F1-10, ADR-6). This namespace is the SESSION side of the
 * feature: `/api/asistencia-rrhh` sits in RUTAS_PROTEGIDAS with permiso
 * `asistencia` (proxy enforces it for API paths), and the handler
 * itself re-checks the session so the audit row is always attributable
 * to session.sub (dbo.usuarios.idUsuario NVARCHAR(50)).
 *
 * Wire body follows the design contract —
 * `{ dni, apellidos, area, fecha_ingreso }` (+opcionales
 * `nombres`/`cargo`) — answered with 200 `{ empleado }`. Validation is
 * all-or-nothing: a 400 never reaches the use case.
 */

const DNI_MAX = 15; // dbo.empleados.dni VARCHAR(15)
const TEXTO_MAX = 100; // apellidos/nombres NVARCHAR(100)
const AREA_MAX = 80; // dbo.empleados.area NVARCHAR(80)
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function textoValido(
  valor: unknown,
  max: number,
): { ok: true; valor: string } | { ok: false } {
  if (typeof valor !== 'string') return { ok: false };
  const limpio = valor.trim();
  if (limpio.length === 0 || limpio.length > max) return { ok: false };
  return { ok: true, valor: limpio };
}

function textoOpcional(valor: unknown, max: number): string | undefined | null {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (limpio.length === 0) return undefined;
  if (limpio.length > max) return null;
  return limpio;
}

/** All-or-nothing wire → domain mapping; null = invalid body. */
function parsearCuerpo(body: unknown): DatosFicha | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;

  const dni = textoValido(obj.dni, DNI_MAX);
  const apellidos = textoValido(obj.apellidos, TEXTO_MAX);
  const area = textoValido(obj.area, AREA_MAX);
  const fechaIngreso =
    typeof obj.fecha_ingreso === 'string' ? obj.fecha_ingreso.trim() : '';
  if (!dni.ok || !apellidos.ok || !area.ok) return null;
  if (!PATRON_FECHA.test(fechaIngreso)) return null;
  if (Number.isNaN(new Date(`${fechaIngreso}T00:00:00`).getTime())) return null;

  const nombres = textoOpcional(obj.nombres, TEXTO_MAX);
  const cargo = textoOpcional(obj.cargo, AREA_MAX);
  if (nombres === null || cargo === null) return null;

  return {
    dni: dni.valor,
    apellidos: apellidos.valor,
    area: area.valor,
    fechaIngreso,
    nombres,
    cargo,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // 1. Session (ADR-6) — the audit row must be attributable.
    const session = await getSession();
    if (!session) {
      return buildError('No autorizado', 401);
    }

    // 2. Route id — digits only (mirrors the confirmar route guard).
    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return buildError('El identificador de ficha debe ser numérico', 400);
    }

    // 3. All-or-nothing body validation — a 400 never reaches the use case.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('El cuerpo debe ser JSON válido', 400);
    }
    const datos = parsearCuerpo(body);
    if (!datos) {
      return buildError(
        'Cuerpo inválido. Requiere { dni, apellidos, area, fecha_ingreso } y opcionales { nombres, cargo }',
        400,
      );
    }

    // 4. Validate → complete → backfill punches → audit (session.sub).
    const db = await getAsistenciaDb();
    const { empleado } = await new CompletarFichaUseCase(db).execute(
      Number(id),
      datos,
      session.sub,
    );

    return NextResponse.json({ empleado });
  } catch (error) {
    if (error instanceof FichaInvalidaError) {
      return buildError(error.message, 400);
    }
    if (error instanceof FichaNoEncontradaError) {
      return buildError(error.message, 404);
    }
    console.error('asistencia-rrhh fichas POST error:', error);
    return buildError('Error interno', 500);
  }
}
