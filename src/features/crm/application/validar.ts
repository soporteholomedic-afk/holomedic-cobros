import type { ICrmEmpresaRepository } from '../domain/ports';
import {
  ACCIONES,
  MAX_CONTACTOS,
  MEDIOS,
  ORIGENES,
  type AccionTipo,
  type Origen,
  type ProximaAccion,
  MOTIVO_CAMPOS,
  MOTIVO_CATEGORIAS,
  type Contacto,
  type CrearEmpresaDatos,
  type DatosEmpresa,
  type Medio,
  type Motivo,
  type MotivoCategoria,
  type MotivoDatos,
} from '../domain/entities';
import { DatosEmpresaInvalidosError, RucDuplicadoError } from '../domain/errors';
import { isValidCorreo } from '@/features/auth/domain/correo';

const RUC_RE = /^\d{11}$/;

export function opcional(valor: string | null | undefined): string | null {
  const t = (valor ?? '').trim();
  return t.length > 0 ? t : null;
}

function obligatorio(valor: string | null | undefined, mensaje: string): string {
  const t = (valor ?? '').trim();
  if (t.length === 0) throw new DatosEmpresaInvalidosError(mensaje);
  return t;
}

function validarContactos(lista: CrearEmpresaDatos['contactos']): Contacto[] {
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new DatosEmpresaInvalidosError('Falta al menos un contacto');
  }
  if (lista.length > MAX_CONTACTOS) {
    throw new DatosEmpresaInvalidosError(`Máximo ${MAX_CONTACTOS} contactos por empresa`);
  }
  return lista.map((c, i) => {
    const quien = i === 0 ? 'Contacto principal' : `Contacto ${i + 1}`;
    const nombre = obligatorio(c?.nombre, `${quien}: falta el nombre`);
    const telefono = obligatorio(c?.telefono, `${quien}: falta el teléfono`);
    if (telefono.replace(/\D/g, '').length !== 9) {
      throw new DatosEmpresaInvalidosError(`${quien}: el teléfono debe tener 9 dígitos`);
    }
    const correo = opcional(c?.correo);
    if (correo !== null && !isValidCorreo(correo)) {
      throw new DatosEmpresaInvalidosError(`${quien}: el correo no es válido`);
    }
    return { nombre, telefono, correo };
  });
}

/**
 * Validate the empresa form data (create and edit share it). Touches storage
 * only to read: the sector must exist and the RUC must be free (or belong to
 * `excluirId`, the empresa being edited).
 */
export async function validarDatosEmpresa(
  datos: CrearEmpresaDatos,
  repo: ICrmEmpresaRepository,
  excluirId?: string,
): Promise<DatosEmpresa> {
  const razonSocial = obligatorio(datos.razonSocial, 'La razón social es obligatoria');
  const ruc = (datos.ruc ?? '').trim();
  if (!RUC_RE.test(ruc)) throw new DatosEmpresaInvalidosError('El RUC debe tener 11 dígitos');
  const contactos = validarContactos(datos.contactos);

  let sector: string | null = null;
  const sectorTxt = opcional(datos.sector);
  if (sectorTxt !== null) {
    const existentes = await repo.listSectores();
    const hallado = existentes.find((s) => s.nombre.toLowerCase() === sectorTxt.toLowerCase());
    if (!hallado) throw new DatosEmpresaInvalidosError(`Sector desconocido: ${sectorTxt}`);
    sector = hallado.nombre;
  }

  const otra = await repo.findByRuc(ruc);
  if (otra && otra.idEmpresa !== excluirId) throw new RucDuplicadoError(ruc);

  return { razonSocial, ruc, sector, contactos, notas: opcional(datos.notas), direccion: validarDireccion(datos.direccion) };
}

const MAX_DIRECCION = 300;

/** Fiscal address: trimmed, at most 300 characters, optional (empty means NULL). */
export function validarDireccion(valor: string | null | undefined): string | null {
  const t = opcional(valor);
  if (t !== null && t.length > MAX_DIRECCION) {
    throw new DatosEmpresaInvalidosError(`La dirección admite hasta ${MAX_DIRECCION} caracteres.`);
  }
  return t;
}

const MENSAJE_MEDIO = 'Elige el medio de contacto: llamada, correo o WhatsApp';

/**
 * Medium of a stage move or a medium edit: llamada, correo or whatsapp. "Otro"
 * is rejected here because these flows cannot carry the "¿Cuál?" text; it is
 * picked in the contact flow (`validarMedioContacto`).
 */
export function validarMedio(valor: unknown): Medio {
  if (typeof valor !== 'string' || valor === 'otro' || !(MEDIOS as readonly string[]).includes(valor)) {
    throw new DatosEmpresaInvalidosError(MENSAJE_MEDIO);
  }
  return valor as Medio;
}

const MAX_MEDIO_OTRO = 40;

/** Medium of a contact: any of the four; "otro" requires "¿Cuál?", the others drop it. */
export function validarMedioContacto(
  medio: unknown,
  medioOtro: string | null | undefined,
): { medio: Medio; medioOtro: string | null } {
  if (typeof medio !== 'string' || !(MEDIOS as readonly string[]).includes(medio)) {
    throw new DatosEmpresaInvalidosError(MENSAJE_MEDIO);
  }
  if (medio !== 'otro') return { medio: medio as Medio, medioOtro: null };
  const cual = opcional(medioOtro);
  if (cual === null) throw new DatosEmpresaInvalidosError('Escribe cuál fue el medio.');
  if (cual.length > MAX_MEDIO_OTRO) {
    throw new DatosEmpresaInvalidosError(`El medio admite hasta ${MAX_MEDIO_OTRO} caracteres.`);
  }
  return { medio: 'otro', medioOtro: cual };
}

const MAX_RESUMEN = 1000;

/** Summary of a contact: trimmed, at most 1000 characters, required when `requerido`. */
export function validarResumen(valor: string | null | undefined, requerido: boolean): string | null {
  const t = opcional(valor);
  if (t === null) {
    if (requerido) throw new DatosEmpresaInvalidosError('Escribe un resumen de la conversación.');
    return null;
  }
  if (t.length > MAX_RESUMEN) {
    throw new DatosEmpresaInvalidosError(`El resumen admite hasta ${MAX_RESUMEN} caracteres.`);
  }
  return t;
}

/** How an inbound empresa knew us: one of ORIGENES, or nothing. */
export function validarOrigen(valor: unknown): Origen | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !(ORIGENES as readonly string[]).includes(valor)) {
    throw new DatosEmpresaInvalidosError('Elige cómo nos conoció.');
  }
  return valor as Origen;
}

const MAX_DETALLE_ACCION = 80;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function esDiaReal(fecha: string): boolean {
  if (!FECHA_RE.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Next action: known type, detail for "otro", a real `YYYY-MM-DD` day not before
 * `hoy`. When not `requerida` (Cliente/Perdido) an empty value means "Sin próxima acción".
 */
export function validarProximaAccion(
  raw: unknown,
  opciones: { requerida: boolean; hoy: string },
): ProximaAccion | null {
  if (raw === undefined || raw === null) {
    if (opciones.requerida) throw new DatosEmpresaInvalidosError('Elige la próxima acción.');
    return null;
  }
  const o = typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o || typeof o.tipo !== 'string' || !(ACCIONES as readonly string[]).includes(o.tipo)) {
    throw new DatosEmpresaInvalidosError('Elige la próxima acción.');
  }
  const tipo = o.tipo as AccionTipo;
  const detalle = opcional(typeof o.detalle === 'string' ? o.detalle : null);
  if (tipo === 'otro' && detalle === null) {
    throw new DatosEmpresaInvalidosError('Escribe cuál es la próxima acción.');
  }
  if (detalle !== null && detalle.length > MAX_DETALLE_ACCION) {
    throw new DatosEmpresaInvalidosError(
      `El detalle de la próxima acción admite hasta ${MAX_DETALLE_ACCION} caracteres.`,
    );
  }
  if (typeof o.fecha !== 'string' || !esDiaReal(o.fecha)) {
    throw new DatosEmpresaInvalidosError('Elige la fecha de la próxima acción.');
  }
  if (o.fecha < opciones.hoy) {
    throw new DatosEmpresaInvalidosError('La fecha de la próxima acción no puede ser pasada.');
  }
  return { tipo, detalle, fecha: o.fecha };
}

/** Today's calendar day (`YYYY-MM-DD`) in America/Lima; callers pass it as `hoy`. */
export function hoyEnLima(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const RUC_OPCIONAL_RE = /^\d{11}$/;

/** RUC given by a user: 11 digits. Used by the inbound panel and "Completar RUC". */
export function validarRuc(valor: string | null | undefined): string {
  const t = (valor ?? '').trim();
  if (!RUC_OPCIONAL_RE.test(t)) throw new DatosEmpresaInvalidosError('El RUC debe tener 11 dígitos.');
  return t;
}

/** Validate a loss reason: category known, required details present. */
export function validarMotivo(raw: MotivoDatos | null | undefined): Motivo {
  if (!raw || typeof raw !== 'object') {
    throw new DatosEmpresaInvalidosError('Falta el motivo de la pérdida');
  }
  if (!(MOTIVO_CATEGORIAS as readonly string[]).includes(raw.categoria)) {
    throw new DatosEmpresaInvalidosError('Elige el motivo de la pérdida');
  }
  const categoria = raw.categoria as MotivoCategoria;
  const campos = MOTIVO_CAMPOS[categoria];
  const lee = (v: string | null | undefined, max: number, campo: string): string | null => {
    const t = opcional(v);
    if (t !== null && t.length > max) {
      throw new DatosEmpresaInvalidosError(`${campo} admite hasta ${max} caracteres`);
    }
    return t;
  };
  const detalle1 = campos.detalle1 ? lee(raw.detalle1, 200, campos.detalle1.label) : null;
  const detalle2 = campos.detalle2 ? lee(raw.detalle2, 200, campos.detalle2.label) : null;
  if (campos.detalle1?.requerido && detalle1 === null) {
    throw new DatosEmpresaInvalidosError(`Falta: ${campos.detalle1.label}`);
  }
  if (campos.detalle2?.requerido && detalle2 === null) {
    throw new DatosEmpresaInvalidosError(`Falta: ${campos.detalle2.label}`);
  }
  return { categoria, detalle1, detalle2, notas: lee(raw.notas, 300, 'Las notas') };
}
