import type { ICrmEmpresaRepository } from '../domain/ports';
import {
  MAX_CONTACTOS,
  MEDIOS,
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
    const hallado = existentes.find((s) => s.toLowerCase() === sectorTxt.toLowerCase());
    if (!hallado) throw new DatosEmpresaInvalidosError(`Sector desconocido: ${sectorTxt}`);
    sector = hallado;
  }

  const otra = await repo.findByRuc(ruc);
  if (otra && otra.idEmpresa !== excluirId) throw new RucDuplicadoError(ruc);

  return { razonSocial, ruc, sector, contactos, notas: opcional(datos.notas) };
}

export function validarMedio(valor: unknown): Medio {
  if (typeof valor !== 'string' || !(MEDIOS as readonly string[]).includes(valor)) {
    throw new DatosEmpresaInvalidosError('Elige el medio de contacto: llamada, correo o WhatsApp');
  }
  return valor as Medio;
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
