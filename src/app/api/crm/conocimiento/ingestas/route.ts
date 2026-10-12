import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  IngestaInvalidaError,
  IniciarIngestaConocimientoUseCase,
} from '@/features/crm/application/conocimiento/iniciarIngestaConocimiento';
import {
  ExtraccionError,
  extraerTextoArchivo,
} from '@/features/crm/infrastructure/extraccion/extraerTextoArchivo';
import { iniciarBarredorTareas } from '@/features/crm/infrastructure/agentes/iniciarBarredorTareas';
import { crearProcesadorTareasAgente } from '@/features/crm/infrastructure/agentes/crearProcesadorTareasAgente';
import type { IngestaConocimiento, TipoIngesta } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

// E4·T8: boot the lazy sweeper once per process (same rule as the
// webhook/vincular routes — cada carga de conocimiento encola la tarea
// INGESTAR_CONOCIMIENTO y el barredor hace backstop del disparo local).
iniciarBarredorTareas();

/**
 * `POST|GET /api/crm/conocimiento/ingestas` (agente-ia-crm E4·T8,
 * permiso `crm_conocimiento` via RUTAS_PROTEGIDAS + re-check IN-ROUTE,
 * productividad/calidad pattern) — la carga de conocimiento desde la
 * plataforma:
 *
 * - POST JSON (texto pegado): {nombre, contenido, vigenciaDesde?,
 *   vigenciaHasta?} — tipo TEXTO fijo.
 * - POST multipart (archivo): campo `file` (.pdf/.txt/.docx; el tipo
 *   se deriva de la extensión) + vigencia opcional. La EXTRACCIÓN pasa
 *   AQUÍ, en el upload (los 5 MB se procesan en un tirón — contrato
 *   T7): a la cola y al procesador jamás llega un binario.
 * - GET ?limite (default 20, tope 50): las ingestas recientes para el
 *   panel con estado en vivo (`no-store`).
 *
 * El wire NUNCA lleva `contenidoCrudo` (hasta 200 000 chars por fila:
 * el panel no lo necesita y el crudo queda auditable en la tabla) y
 * las fechas viajan como ISO strings (ConversacionCrm precedent).
 * Tras un 201, el drenaje de la cola se dispara fire-and-forget con
 * el idiom EXACTO del webhook — la respuesta sale igual de rápida y
 * el barredor recupera lo que el disparo pierda.
 */

const LIMITE_BYTES_ARCHIVO = 5 * 1024 * 1024;
const LIMITE_DEFAULT = 20;
const LIMITE_MAX = 50;

/** Extensión (minúscula) → tipo de ingesta. Cerrado: nada de .exe. */
const EXTENSIONES: Record<string, TipoIngesta> = {
  '.pdf': 'PDF',
  '.txt': 'TXT',
  '.docx': 'DOCX',
};

function tipoPorNombre(nombre: string): TipoIngesta | null {
  const punto = nombre.lastIndexOf('.');
  if (punto <= 0) return null;
  return EXTENSIONES[nombre.slice(punto).toLowerCase()] ?? null;
}

/** ISO string → Date; null ante vacío/basura (sin vigencia). */
function fechaOpcional(valor: unknown): Date | null {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** El wire del panel: sin contenidoCrudo, fechas ISO. */
function aWire(ingesta: IngestaConocimiento): {
  id: number;
  nombre: string;
  tipo: TipoIngesta;
  tamanoBytes: number;
  estado: IngestaConocimiento['estado'];
  error: string | null;
  entradasCreadas: number;
  creadoPor: string | null;
  creadoEn: string;
  procesadoEn: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
} {
  return {
    id: ingesta.id,
    nombre: ingesta.nombre,
    tipo: ingesta.tipo,
    tamanoBytes: ingesta.tamanoBytes,
    estado: ingesta.estado,
    error: ingesta.error,
    entradasCreadas: ingesta.entradasCreadas,
    creadoPor: ingesta.creadoPor,
    creadoEn: ingesta.creadoEn.toISOString(),
    procesadoEn: ingesta.procesadoEn?.toISOString() ?? null,
    vigenciaDesde: ingesta.vigenciaDesde?.toISOString() ?? null,
    vigenciaHasta: ingesta.vigenciaHasta?.toISOString() ?? null,
  };
}

interface IngestaSuccess {
  success: true;
  ingesta: ReturnType<typeof aWire>;
}

interface IngestasSuccess {
  success: true;
  ingestas: ReturnType<typeof aWire>[];
}

/** Drenaje de la cola fire-and-forget (idíom del webhook — nunca await, error logueado). */
function drenarTareas(): void {
  void crearProcesadorTareasAgente()
    .procesar()
    .catch((err: unknown) => {
      console.error('[crm conocimiento] drenaje de tareas del agente falló', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

export async function POST(request: Request): Promise<NextResponse<IngestaSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conocimiento')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.ingestaConocimiento || !db.tareas) {
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const contentType = request.headers.get('content-type') ?? '';
    let nombre: string;
    let tipo: TipoIngesta;
    let contenidoCrudo: string;
    let vigenciaDesde: Date | null = null;
    let vigenciaHasta: Date | null = null;

    if (contentType.includes('multipart/form-data')) {
      // Rechazo temprano: si Content-Length delata un cuerpo mayor al
      // tope, ni siquiera se parsea el multipart (ahorra el upload).
      const contentLength = Number(request.headers.get('content-length') ?? '0');
      if (contentLength > LIMITE_BYTES_ARCHIVO) {
        return buildCrmError('VALIDATION_ERROR', 'El archivo supera el máximo de 5 MB', 400);
      }

      const formData = await request.formData();
      const file = formData.get('file');
      if (!file || typeof file === 'string') {
        return buildCrmError('VALIDATION_ERROR', 'El archivo es obligatorio (campo "file")', 400);
      }
      if (file.size > LIMITE_BYTES_ARCHIVO) {
        return buildCrmError('VALIDATION_ERROR', 'El archivo supera el máximo de 5 MB', 400);
      }
      const derivado = tipoPorNombre(file.name);
      if (!derivado) {
        return buildCrmError(
          'VALIDATION_ERROR',
          'Tipo de archivo no soportado: solo .pdf, .txt o .docx',
          400,
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      contenidoCrudo = await extraerTextoArchivo(buffer, derivado);
      nombre = file.name;
      tipo = derivado;
      vigenciaDesde = fechaOpcional(formData.get('vigenciaDesde'));
      vigenciaHasta = fechaOpcional(formData.get('vigenciaHasta'));
    } else {
      const cuerpo: unknown = await request.json().catch(() => null);
      if (typeof cuerpo !== 'object' || cuerpo === null) {
        return buildCrmError('VALIDATION_ERROR', 'Cuerpo JSON requerido', 400);
      }
      const datos = cuerpo as Record<string, unknown>;
      nombre = typeof datos.nombre === 'string' ? datos.nombre : '';
      tipo = 'TEXTO';
      contenidoCrudo = typeof datos.contenido === 'string' ? datos.contenido : '';
      vigenciaDesde = fechaOpcional(datos.vigenciaDesde);
      vigenciaHasta = fechaOpcional(datos.vigenciaHasta);
    }

    const iniciar = new IniciarIngestaConocimientoUseCase({
      ingestas: db.ingestaConocimiento,
      tareas: db.tareas,
    });
    const { ingesta } = await iniciar.ejecutar({
      nombre,
      tipo,
      contenidoCrudo,
      creadoPor: session.nombre,
      vigenciaDesde,
      vigenciaHasta,
    });

    // La tarea INGESTAR_CONOCIMIENTO ya está en la cola — drenar
    // fire-and-forget para que la ingesta se procese YA (webhook
    // precedent; el barredor ~20s hace backstop).
    drenarTareas();

    return NextResponse.json({ success: true, ingesta: aWire(ingesta) }, { status: 201 });
  } catch (error) {
    if (error instanceof IngestaInvalidaError) {
      return buildCrmError('VALIDATION_ERROR', error.message, 400);
    }
    if (error instanceof ExtraccionError) {
      return buildCrmError('VALIDATION_ERROR', error.message, 422);
    }
    return mapCrmError('crm conocimiento POST', error);
  }
}

export async function GET(request: Request): Promise<NextResponse<IngestasSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conocimiento')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.ingestaConocimiento) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const parametro = new URL(request.url).searchParams.get('limite');
    const parseado = Number.parseInt(parametro ?? '', 10);
    const limite =
      Number.isFinite(parseado) && parseado > 0 ? Math.min(parseado, LIMITE_MAX) : LIMITE_DEFAULT;

    const ingestas = await db.ingestaConocimiento.listarRecientes(limite);
    return NextResponse.json(
      { success: true, ingestas: ingestas.map(aWire) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapCrmError('crm conocimiento GET', error);
  }
}
