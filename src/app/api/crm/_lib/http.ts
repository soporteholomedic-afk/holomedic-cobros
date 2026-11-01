import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import type { Etapa } from '@/features/crm/domain/entities';
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
  otra: { idEmpresa: string; razonSocial: string; etapa: Etapa };
}

const POR_NOMBRE: Record<string, { status: number; mensaje?: string }> = {
  DatosEmpresaInvalidosError: { status: 400 },
  ArchivoImportacionInvalidoError: { status: 400 },
  EtapaInvalidaError: { status: 400 },
  RucDuplicadoError: { status: 409 },
  SectorDuplicadoError: { status: 409 },
  EmpresaNotFoundError: { status: 404, mensaje: 'Empresa no encontrada' },
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
    esTextoOpcional(v.notas)
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
