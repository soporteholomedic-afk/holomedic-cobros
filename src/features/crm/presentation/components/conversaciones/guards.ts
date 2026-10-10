import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  EstadoConversacion,
  MensajeCrm,
} from '../../../domain/entities';
import type { ContactoConEmpresa } from '../../../domain/ports';

/**
 * Guards + display helpers for the bandeja (agente-ia-crm E1). The
 * components never trust a decoded fetch body: every response crosses
 * through these shape guards (useEmpresas precedent) before it can
 * reach the domain types, and the small display derivations (fila
 * title, teléfono preview, estado label) live here pure so the
 * components stay free of formatting logic.
 */

const ESTADOS_CONVERSACION: readonly EstadoConversacion[] = [
  'ACTIVA_IA',
  'REQUIERE_HUMANO',
  'TOMADA_HUMANO',
  'PAUSADA',
  'PENDIENTE_VINCULACION',
  'CERRADA',
];

const CANALES: readonly CanalConversacion[] = ['WHATSAPP', 'EMAIL'];

function esCadena(v: unknown): v is string {
  return typeof v === 'string';
}

function esCadenaNulable(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function esNumero(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function esNumeroNulable(v: unknown): v is number | null {
  return v === null || esNumero(v);
}

/** Core row guard — every field ConversacionCrm declares. */
export function esConversacionCrm(v: unknown): v is ConversacionCrm {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    esNumero(obj.id) &&
    esNumeroNulable(obj.empresaId) &&
    esNumeroNulable(obj.contactoId) &&
    (CANALES as readonly string[]).includes(String(obj.canal)) &&
    esCadenaNulable(obj.telefono) &&
    esCadenaNulable(obj.identificadorCanal) &&
    (ESTADOS_CONVERSACION as readonly string[]).includes(String(obj.estado)) &&
    esCadenaNulable(obj.asignadaA) &&
    (obj.modo === 'IA' || obj.modo === 'HUMANO') &&
    esCadenaNulable(obj.ultimoMensajeEn) &&
    esNumero(obj.noLeidos) &&
    esCadena(obj.creadoEn) &&
    esCadena(obj.actualizadoEn)
  );
}

/** Bandeja row: the core row widened with the two display joins. */
export function esConversacionListada(v: unknown): v is ConversacionListada {
  if (!esConversacionCrm(v)) return false;
  const obj = v as unknown as Record<string, unknown>;
  return esCadenaNulable(obj.razonSocial) && esCadenaNulable(obj.nombreContacto);
}

/** One thread message row. */
export function esMensajeCrm(v: unknown): v is MensajeCrm {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    esNumero(obj.id) &&
    esNumero(obj.conversacionId) &&
    (obj.direccion === 'IN' || obj.direccion === 'OUT') &&
    (obj.emisor === 'CLIENTE' || obj.emisor === 'IA' || obj.emisor === 'HUMANO') &&
    esCadena(obj.cuerpo) &&
    (obj.tipo === 'TEXTO' || obj.tipo === 'MEDIA' || obj.tipo === 'PLANTILLA') &&
    (CANALES as readonly string[]).includes(String(obj.canal)) &&
    esCadenaNulable(obj.wamid) &&
    esCadenaNulable(obj.idempotenciaKey) &&
    (obj.estadoEnvio === null ||
      obj.estadoEnvio === undefined ||
      obj.estadoEnvio === 'ENVIADO' ||
      obj.estadoEnvio === 'FALLIDO') &&
    esCadenaNulable(obj.fuentes) &&
    (obj.score === null || obj.score === undefined || typeof obj.score === 'number') &&
    esCadenaNulable(obj.modelo) &&
    esCadena(obj.creadoEn)
  );
}

/** GET /api/crm/conversaciones success body. */
export function esListadoConversaciones(v: unknown): v is {
  success: true;
  conversaciones: ConversacionListada[];
  total: number;
  modoSimulado: boolean;
} {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    Array.isArray(obj.conversaciones) &&
    obj.conversaciones.every(esConversacionListada) &&
    esNumero(obj.total) &&
    typeof obj.modoSimulado === 'boolean'
  );
}

/** GET /api/crm/conversaciones/[id] success body. */
export function esHiloConversacion(v: unknown): v is {
  success: true;
  conversacion: ConversacionCrm;
  mensajes: MensajeCrm[];
} {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    esConversacionCrm(obj.conversacion) &&
    Array.isArray(obj.mensajes) &&
    obj.mensajes.every(esMensajeCrm)
  );
}

/** GET /api/crm/conversaciones/[id]/candidatos success body. */
export function esCandidatosContacto(v: unknown): v is {
  success: true;
  candidatos: ContactoConEmpresa[];
} {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.success !== true || !Array.isArray(obj.candidatos)) return false;
  return obj.candidatos.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      esNumero((c as Record<string, unknown>).contactoId) &&
      esNumero((c as Record<string, unknown>).empresaId) &&
      esCadena((c as Record<string, unknown>).nombreContacto) &&
      esCadenaNulable((c as Record<string, unknown>).razonSocial) &&
      esCadenaNulable((c as Record<string, unknown>).telefono),
  );
}

// ---- Display helpers (pure) ----

/**
 * '+595981234567' → '+595 981 234 567': digits grouped in threes from
 * the right (the placeholder style "0981 234 567"). Free-text values
 * (already spaced) and null pass through untouched.
 */
export function formatearTelefono(valor: string | null): string | null {
  if (valor === null) return null;
  if (!/^\+?\d+$/.test(valor)) return valor; // texto libre → tal cual
  const prefijo = valor.startsWith('+') ? '+' : '';
  const digitos = valor.replace(/\D/g, '');
  const grupos: string[] = [];
  for (let i = digitos.length; i > 0; i -= 3) {
    grupos.unshift(digitos.slice(Math.max(0, i - 3), i));
  }
  return prefijo + grupos.join(' ');
}

/** Row title: the contact name, or "Sin vincular · <tel>" while
 * PENDIENTE_VINCULACION (spec: the bandeja must surface the link
 * debt, not an empty name). */
export function tituloFilaConversacion(conversacion: ConversacionListada): string {
  if (conversacion.estado === 'PENDIENTE_VINCULACION' || conversacion.nombreContacto === null) {
    const telefono = formatearTelefono(conversacion.telefono);
    return telefono === null ? 'Sin vincular · sin teléfono' : `Sin vincular · ${telefono}`;
  }
  return conversacion.nombreContacto;
}

/** Estado chip label (Spanish, discreto). */
export const ETIQUETA_ESTADO_CONVERSACION: Record<EstadoConversacion, string> = {
  ACTIVA_IA: 'La Guía',
  REQUIERE_HUMANO: 'Pide ayuda',
  TOMADA_HUMANO: 'Tomada',
  PAUSADA: 'Pausada',
  PENDIENTE_VINCULACION: 'Sin vincular',
  CERRADA: 'Cerrada',
};

/** Initials for the row avatar ("Luis Medina" → "LM"). */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p) => p.length > 0);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}
