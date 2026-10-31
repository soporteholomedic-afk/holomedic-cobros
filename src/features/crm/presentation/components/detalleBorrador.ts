import { MAX_CONTACTOS, type Empresa } from '../../domain/entities';

export interface ContactoBorrador {
  /** Stable key so React keeps the right inputs when contacts are moved or removed. */
  clave: number;
  nombre: string;
  telefono: string;
  correo: string;
}

export interface Borrador {
  razonSocial: string;
  ruc: string;
  sector: string;
  notas: string;
  contactos: ContactoBorrador[];
}

export interface FalloDeValidacion {
  mensaje: string;
  /** DOM id of the field to focus. */
  campo: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let contador = 1;
export const nuevaClave = (): number => contador++;

export const idCampo = (clave: number, campo: 'nombre' | 'telefono' | 'correo') => `det-c${clave}-${campo}`;

export function contactoVacio(): ContactoBorrador {
  return { clave: nuevaClave(), nombre: '', telefono: '', correo: '' };
}

export function desdeEmpresa(e: Empresa): Borrador {
  return {
    razonSocial: e.razonSocial,
    ruc: e.ruc,
    sector: e.sector ?? '',
    notas: e.notas ?? '',
    contactos: e.contactos.map((c) => ({
      clave: nuevaClave(),
      nombre: c.nombre,
      telefono: c.telefono,
      correo: c.correo ?? '',
    })),
  };
}

const sinClaves = (b: Borrador) =>
  JSON.stringify([
    b.razonSocial,
    b.ruc,
    b.sector,
    b.notas,
    b.contactos.map((c) => [c.nombre, c.telefono, c.correo]),
  ]);

/** True when the draft differs from what is stored (typing and undoing is not a change). */
export const estaSucio = (b: Borrador, e: Empresa): boolean => sinClaves(b) !== sinClaves(desdeEmpresa(e));

/** Same rules as the server; the server still has the last word. */
export function validar(b: Borrador, empresas: Empresa[], idActual: string): FalloDeValidacion | null {
  if (!b.razonSocial.trim()) return { mensaje: 'Falta la razón social.', campo: 'det-razon' };
  const ruc = b.ruc.trim();
  if (!/^\d{11}$/.test(ruc)) return { mensaje: 'El RUC debe tener 11 dígitos.', campo: 'det-ruc' };
  if (empresas.some((x) => x.ruc === ruc && x.idEmpresa !== idActual)) {
    return { mensaje: 'Ya existe otra empresa con ese RUC.', campo: 'det-ruc' };
  }
  if (b.contactos.length === 0) return { mensaje: 'Falta al menos un contacto.', campo: 'det-razon' };
  if (b.contactos.length > MAX_CONTACTOS) {
    return { mensaje: `Máximo ${MAX_CONTACTOS} contactos por empresa.`, campo: 'det-razon' };
  }
  for (const [i, c] of b.contactos.entries()) {
    const quien = i === 0 ? 'Contacto principal' : `Contacto ${i + 1}`;
    if (!c.nombre.trim()) return { mensaje: `${quien}: falta el nombre.`, campo: idCampo(c.clave, 'nombre') };
    if (c.telefono.replace(/\D/g, '').length !== 9) {
      return { mensaje: `${quien}: el teléfono debe tener 9 dígitos.`, campo: idCampo(c.clave, 'telefono') };
    }
    if (c.correo.trim() && !EMAIL_RE.test(c.correo.trim())) {
      return { mensaje: `${quien}: el correo no es válido.`, campo: idCampo(c.clave, 'correo') };
    }
  }
  return null;
}

/** Body for PATCH /api/crm/empresas/[id]: optional fields are omitted when empty. */
export function aCuerpo(b: Borrador): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    razonSocial: b.razonSocial.trim(),
    ruc: b.ruc.trim(),
    contactos: b.contactos.map((c) => {
      const o: Record<string, string> = { nombre: c.nombre.trim(), telefono: c.telefono.trim() };
      if (c.correo.trim()) o.correo = c.correo.trim();
      return o;
    }),
  };
  if (b.sector) cuerpo.sector = b.sector;
  if (b.notas.trim()) cuerpo.notas = b.notas.trim();
  return cuerpo;
}
