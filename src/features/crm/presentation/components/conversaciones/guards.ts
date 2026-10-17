import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  DetalleAyudaNotificacion,
  EmisorMensaje,
  EstadoConversacion,
  FichaConversacion,
  MemoriaLista,
  MensajeCrm,
  ModoConversacion,
  ResumenNotificaciones,
} from '../../../domain/entities';
import type { ContactoConEmpresa } from '../../../domain/ports';
import { esTextoConfirmacionCierre } from '../../../domain/textosCierreAgente';

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

function esCadenaOpcional(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === 'string';
}

const EMISORES_MENSAJE: readonly string[] = ['CLIENTE', 'IA', 'HUMANO'];

/** Optional emisor for the list preview: undefined/null or the closed union. */
function esEmisorOpcional(v: unknown): v is EmisorMensaje | null | undefined {
  return v === undefined || v === null || (typeof v === 'string' && EMISORES_MENSAJE.includes(v));
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

/** Bandeja row: the core row widened with the display joins (E1) and
 * the optional last-message preview (E2·T6) — omitted fields pass so
 * pre-E2 payloads and fakes stay valid. */
export function esConversacionListada(v: unknown): v is ConversacionListada {
  if (!esConversacionCrm(v)) return false;
  const obj = v as unknown as Record<string, unknown>;
  return (
    esCadenaNulable(obj.razonSocial) &&
    esCadenaNulable(obj.nombreContacto) &&
    esCadenaOpcional(obj.ultimoMensajeCuerpo) &&
    esEmisorOpcional(obj.ultimoMensajeEmisor)
  );
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
      obj.estadoEnvio === 'FALLIDO' ||
      // E2·T6: PENDIENTE = outbox IA row visible while the send is in flight.
      obj.estadoEnvio === 'PENDIENTE') &&
    esCadenaNulable(obj.fuentes) &&
    (obj.score === null || obj.score === undefined || typeof obj.score === 'number') &&
    // E4·T5: fidelidad autoevaluada + marca deficiente — campos
    // OPCIONALES y tolerantes como score: ausentes (filas pre-E4) o
    // null pasan; un tipo extraño rechaza la fila completa.
    (obj.fidelidad === null || obj.fidelidad === undefined || typeof obj.fidelidad === 'number') &&
    (obj.deficiente === undefined || typeof obj.deficiente === 'boolean') &&
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
  /** E3·T5: the pending help request feeding the thread's help card. */
  solicitudAyuda?: SolicitudAyudaVista | null;
} {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    esConversacionCrm(obj.conversacion) &&
    Array.isArray(obj.mensajes) &&
    obj.mensajes.every(esMensajeCrm) &&
    (obj.solicitudAyuda === undefined ||
      obj.solicitudAyuda === null ||
      esSolicitudAyuda(obj.solicitudAyuda))
  );
}

/**
 * One CRM_SolicitudesAyuda row as it crosses the WIRE (E3·T5): the
 * domain SolicitudAyuda carries `creadoEn`/`resueltaEn` as Dates, but
 * NextResponse.json serializes them to ISO strings — this is the
 * presentation-facing shape (MemoriaLista precedent).
 */
export interface SolicitudAyudaVista {
  id: number;
  conversacionId: number;
  mensajeId: number | null;
  consulta: string;
  terminosBuscados: string[];
  score: number | null;
  estado: 'PENDIENTE' | 'RESUELTA';
  indicacion: string | null;
  resueltaPor: string | null;
  creadoEn: string;
  resueltaEn: string | null;
}

/** Shape guard for the hilo's solicitudAyuda field. */
export function esSolicitudAyuda(v: unknown): v is SolicitudAyudaVista {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    esNumero(obj.id) &&
    esNumero(obj.conversacionId) &&
    esNumeroNulable(obj.mensajeId) &&
    esCadena(obj.consulta) &&
    Array.isArray(obj.terminosBuscados) &&
    obj.terminosBuscados.every((t) => typeof t === 'string') &&
    (obj.score === null || obj.score === undefined || typeof obj.score === 'number') &&
    (obj.estado === 'PENDIENTE' || obj.estado === 'RESUELTA') &&
    esCadenaNulable(obj.indicacion) &&
    esCadenaNulable(obj.resueltaPor) &&
    esCadena(obj.creadoEn) &&
    esCadenaNulable(obj.resueltaEn)
  );
}

/** GET/POST /api/crm/conversaciones/[id]/ficha success body. */
export function esFichaConversacion(v: unknown): v is { success: true } & FichaConversacion {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.success !== true || !esNumero(obj.conversacionId)) return false;
  const contactoOk =
    obj.contacto === null ||
    (typeof obj.contacto === 'object' &&
      obj.contacto !== null &&
      esNumero((obj.contacto as Record<string, unknown>).id) &&
      esCadena((obj.contacto as Record<string, unknown>).nombre) &&
      esCadenaNulable((obj.contacto as Record<string, unknown>).telefono) &&
      esCadenaNulable((obj.contacto as Record<string, unknown>).cargo));
  const empresaOk =
    obj.empresa === null ||
    (typeof obj.empresa === 'object' &&
      obj.empresa !== null &&
      esNumero((obj.empresa as Record<string, unknown>).id) &&
      esCadena((obj.empresa as Record<string, unknown>).razonSocial) &&
      esNumeroNulable((obj.empresa as Record<string, unknown>).cantidadTrabajadores));
  if (!contactoOk || !empresaOk) return false;
  const datos = obj.datos as Record<string, unknown> | undefined;
  if (typeof datos !== 'object' || datos === null) return false;
  const origenes = ['IA', 'HUMANO', 'canonico'];
  return ['cargo', 'trabajadores', 'sedes'].every((campo) => {
    const dato = datos[campo] as Record<string, unknown> | undefined;
    return (
      typeof dato === 'object' &&
      dato !== null &&
      esCadenaNulable(dato.valor) &&
      typeof dato.origen === 'string' &&
      origenes.includes(dato.origen) &&
      typeof dato.confirmado === 'boolean'
    );
  });
}

/** GET /api/crm/conversaciones/[id]/memorias success body. */
export function esListadoMemorias(
  v: unknown,
): v is { success: true; memorias: MemoriaLista[]; empresaId: number | null } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.success !== true || !esNumeroNulable(obj.empresaId) || !Array.isArray(obj.memorias)) {
    return false;
  }
  return obj.memorias.every(
    (m) =>
      typeof m === 'object' &&
      m !== null &&
      esNumero((m as Record<string, unknown>).id) &&
      ((m as Record<string, unknown>).nivel === 'chat' ||
        (m as Record<string, unknown>).nivel === 'empresa') &&
      esCadena((m as Record<string, unknown>).tipo) &&
      esCadena((m as Record<string, unknown>).titulo) &&
      esCadena((m as Record<string, unknown>).contenido) &&
      typeof (m as Record<string, unknown>).pineada === 'boolean' &&
      esCadena((m as Record<string, unknown>).creadoEn),
  );
}

/** The ajustes panel payload (E3·T5) — AjustesConversacion + success. */
export interface AjustesConversacionVista {
  success: true;
  estado: EstadoConversacion;
  modo: ModoConversacion;
  asignadaA: string | null;
  memoriaActiva: boolean;
  config: {
    umbralConfianza: number;
    maxIntercambios: number;
    horarioDesde: number;
    horarioHasta: number;
  };
}

/** GET/POST /api/crm/conversaciones/[id]/ajustes success body. */
export function esAjustesConversacion(v: unknown): v is AjustesConversacionVista {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  const config = obj.config as Record<string, unknown> | undefined;
  return (
    obj.success === true &&
    (ESTADOS_CONVERSACION as readonly string[]).includes(String(obj.estado)) &&
    (obj.modo === 'IA' || obj.modo === 'HUMANO') &&
    esCadenaNulable(obj.asignadaA) &&
    typeof obj.memoriaActiva === 'boolean' &&
    typeof config === 'object' &&
    config !== null &&
    typeof config.umbralConfianza === 'number' &&
    typeof config.maxIntercambios === 'number' &&
    typeof config.horarioDesde === 'number' &&
    typeof config.horarioHasta === 'number'
  );
}

/** One assignable operator as the escalar selector sees it (E3·T5). */
export interface UsuarioAsignableVista {
  id: string;
  nombre: string;
}

/** GET /api/crm/conversaciones/usuarios-asignables success body. */
export function esUsuariosAsignables(
  v: unknown,
): v is { success: true; usuarios: UsuarioAsignableVista[] } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.success !== true || !Array.isArray(obj.usuarios)) return false;
  return obj.usuarios.every(
    (u) =>
      typeof u === 'object' &&
      u !== null &&
      esCadena((u as Record<string, unknown>).id) &&
      esCadena((u as Record<string, unknown>).nombre),
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
 * One row of the notificaciones payload's requiereAyudaDetalle
 * (E3·T6) — feeds the global toast + deep link.
 */
export function esDetalleAyudaNotificacion(v: unknown): v is DetalleAyudaNotificacion {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    esNumero(obj.conversacionId) &&
    esCadena(obj.etiqueta) &&
    esCadenaNulable(obj.consulta)
  );
}

/**
 * GET /api/crm/conversaciones/notificaciones success body (E3·T3 +
 * E3·T6): the badge counts plus the OPTIONAL detalle array — absent
 * in pre-T6 payloads, consumers treat undefined as []. The hook
 * never trusts a decoded body (useConversaciones precedent).
 */
export function esResumenNotificaciones(
  v: unknown,
): v is ResumenNotificaciones & { success: true } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    esNumero(obj.requiereAyuda) &&
    esNumero(obj.pendienteVinculacion) &&
    esNumero(obj.total) &&
    esCadenaNulable(obj.ultimaActividad) &&
    (obj.requiereAyudaDetalle === undefined ||
      (Array.isArray(obj.requiereAyudaDetalle) &&
        obj.requiereAyudaDetalle.every(esDetalleAyudaNotificacion)))
  );
}

/**
 * Parse the IA message's `fuentes` JSON (E2 RAG cites,
 * [{id, tipo:'KB', titulo}]) into the titulos the bubble lists.
 * Defensive by contract: garbage/non-array JSON → [], entries without
 * a string titulo are dropped — the affordance hides, never crashes.
 */
export function parsearTitulosFuentes(fuentes: string | null): string[] {
  if (fuentes === null || fuentes === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fuentes);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entrada) =>
    typeof entrada === 'object' && entrada !== null && typeof (entrada as Record<string, unknown>).titulo === 'string'
      ? [(entrada as { titulo: string }).titulo]
      : [],
  );
}

/**
 * E5·T10: true when an IA message body is one of the fixed close
 * confirmations La Guía sends after registering a close. Callers must
 * only inspect IA bubbles (a client typing the same text is not a close).
 */
export function esMensajeCierreAgente(cuerpo: string): boolean {
  return esTextoConfirmacionCierre(cuerpo);
}

/** Preview cut length (chars of cuerpo, glyph excluded — E2·T6). */
export const LARGO_PREVIA_MENSAJE = 60;

const GLIFO_EMISOR: Record<EmisorMensaje, string> = {
  CLIENTE: '',
  IA: '🤖 ',
  HUMANO: '👤 ',
};

/**
 * Last-message preview for the bandeja row (E2·T6): emisor glyph
 * ('' cliente / '🤖 ' La Guía / '👤 ' operador) + cuerpo with
 * whitespace collapsed, cut at LARGO_PREVIA_MENSAJE chars with an
 * ellipsis. null/blank cuerpo → null (no preview line).
 */
export function previsualizarUltimoMensaje(
  cuerpo: string | null,
  emisor: EmisorMensaje | null,
): string | null {
  if (cuerpo === null) return null;
  const texto = cuerpo.replace(/\s+/g, ' ').trim();
  if (texto === '') return null;
  const glifo = emisor === null ? '' : GLIFO_EMISOR[emisor];
  const recortado =
    texto.length > LARGO_PREVIA_MENSAJE
      ? `${texto.slice(0, LARGO_PREVIA_MENSAJE - 1)}…`
      : texto;
  return glifo + recortado;
}

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
