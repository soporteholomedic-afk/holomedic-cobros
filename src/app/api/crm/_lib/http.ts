import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { RucDeOtraEmpresaError } from '@/features/crm/domain/errors';

interface ErrorResponse {
  success: false;
  error: string;
}

export function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

/** `null` when the caller holds the `crm` permiso, otherwise the 401 to return. */
export async function exigirCrm(): Promise<NextResponse<ErrorResponse> | null> {
  const session = await getSession();
  if (!session || !session.permisos.includes('crm')) return buildError('No autorizado', 401);
  return null;
}

export interface UsuarioCrm {
  sub: string;
  nombre: string;
}

/** The session user when it holds the `crm` permiso, otherwise the 401 to return. */
export async function usuarioCrm(): Promise<{ usuario: UsuarioCrm } | { denegado: NextResponse<ErrorResponse> }> {
  const session = await getSession();
  if (!session || !session.permisos.includes('crm')) return { denegado: buildError('No autorizado', 401) };
  return { usuario: { sub: session.sub, nombre: session.nombre } };
}

/** Parse the JSON body; `undefined` means the body was not valid JSON. */
export async function leerJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

interface ErrorRucDeOtra extends ErrorResponse {
  otra: { idEmpresa: string; razonSocial: string; relacion: string };
}

const POR_NOMBRE: Record<string, { status: number; mensaje?: string }> = {
  DatosEmpresaInvalidosError: { status: 400 },
  ArchivoImportacionInvalidoError: { status: 400 },
  EtapaInvalidaError: { status: 400 },
  RucDuplicadoError: { status: 409 },
  SectorDuplicadoError: { status: 409 },
  EmpresaNotFoundError: { status: 404, mensaje: 'Empresa no encontrada' },
  OportunidadNotFoundError: { status: 404, mensaje: 'Oportunidad no encontrada' },
  OportunidadDeOtraEmpresaError: { status: 409, mensaje: 'La oportunidad no pertenece a esta empresa' },
};

/** Map a domain error to its HTTP answer; anything else is a logged 500. */
export function errorDeCrm(
  error: unknown,
  contexto: string,
  fallo: string,
): NextResponse<ErrorResponse | ErrorRucDeOtra> {
  if (error instanceof RucDeOtraEmpresaError) {
    return NextResponse.json({ success: false, error: error.message, otra: error.otra }, { status: 409 });
  }
  const regla = error instanceof Error ? POR_NOMBRE[error.name] : undefined;
  if (regla && error instanceof Error) return buildError(regla.mensaje ?? error.message, regla.status);
  console.error(`${contexto} failed:`, error);
  return buildError(fallo, 500);
}

export const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const esTextoOpcional = (v: unknown): boolean =>
  v === undefined || v === null || typeof v === 'string';

function esContacto(v: unknown): boolean {
  return (
    esObjeto(v) &&
    typeof v.nombre === 'string' &&
    typeof v.telefono === 'string' &&
    esTextoOpcional(v.correo)
  );
}

/** Shape check of an empresa body (create and edit); the rules live in the use case. */
export function esDatosEmpresa(v: unknown): boolean {
  return (
    esObjeto(v) &&
    typeof v.razonSocial === 'string' &&
    typeof v.ruc === 'string' &&
    Array.isArray(v.contactos) &&
    v.contactos.every(esContacto) &&
    esTextoOpcional(v.sector) &&
    esTextoOpcional(v.notas) &&
    esTextoOpcional(v.direccion)
  );
}

/** Shape check of an oportunidad body (create and edit share the core);
 *  field rules (monto, origen, responsable) live in the use case, which gives
 *  the exact message. */
export function esDatosOportunidad(v: unknown): boolean {
  return (
    esObjeto(v) &&
    typeof v.nombre === 'string' &&
    esTextoOpcional(v.servicio) &&
    esTextoOpcional(v.responsableId) &&
    esTextoOpcional(v.responsableNombre) &&
    esTextoOpcional(v.origen)
  );
}

/** Shape check of a create-oportunidad body: it must name its empresa. */
export function esNuevaOportunidad(v: unknown): boolean {
  return esObjeto(v) && typeof v.idEmpresa === 'string' && esDatosOportunidad(v);
}

/** Shape check of a stage-move body; etapa/medio/motivo rules live in the use case. */
export function esCambioEtapa(v: unknown): boolean {
  return (
    esObjeto(v) &&
    typeof v.etapa === 'string' &&
    (v.medio === undefined || v.medio === null || typeof v.medio === 'string') &&
    (v.medioOtro === undefined || v.medioOtro === null || typeof v.medioOtro === 'string') &&
    (v.motivo === undefined || v.motivo === null || esMotivo(v.motivo))
  );
}

/** Shape check of a medium/loss-reason edit: at least one of the two keys. */
export function esCambioSeguimiento(v: unknown): boolean {
  if (!esObjeto(v)) return false;
  const tocaMedio = 'medio' in v;
  const tocaMotivo = 'motivo' in v;
  return (
    (tocaMedio || tocaMotivo) &&
    (!tocaMedio || v.medio === null || typeof v.medio === 'string') &&
    (!tocaMotivo || esMotivo(v.motivo))
  );
}

/**
 * Shape check of an activity body (Registrar actividad). `proximaAccion` is
 * only checked as an object here; its rules (date, type, detail) live in the
 * use case, and `null`/`undefined` mean "Sin próxima acción".
 */
export function esActividad(v: unknown): boolean {
  return (
    esObjeto(v) &&
    (v.idOportunidad === null || typeof v.idOportunidad === 'string') &&
    typeof v.direccion === 'string' &&
    typeof v.medio === 'string' &&
    typeof v.resultado === 'string' &&
    esTextoOpcional(v.medioOtro) &&
    esTextoOpcional(v.resumen) &&
    (v.proximaAccion === undefined || v.proximaAccion === null || esObjeto(v.proximaAccion))
  );
}

/** Shape check of a loss reason; `undefined`/`null` are decided by the caller. */
export function esMotivo(v: unknown): boolean {
  return (
    esObjeto(v) &&
    typeof v.categoria === 'string' &&
    esTextoOpcional(v.detalle1) &&
    esTextoOpcional(v.detalle2) &&
    esTextoOpcional(v.notas)
  );
}
