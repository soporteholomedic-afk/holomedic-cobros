import {
  ETAPA_LABELS,
  UMBRAL_INTENTOS,
  type AccionTipo,
  type Direccion,
  type Empresa,
  type Medio,
  type Resultado,
} from '../../domain/entities';
import { DatosEmpresaInvalidosError } from '../../domain/errors';
import { validarMedioContacto, validarProximaAccion, validarResumen } from '../../application/validar';
import { sumarDiasHabiles } from './fechas';

/** Fields a contact form can reject; each panel maps them to its own DOM ids. */
export type CampoContacto = 'razon' | 'ruc' | 'otro' | 'dato' | 'resumen' | 'accion' | 'accionDetalle' | 'fecha';
export type Fallos = Partial<Record<CampoContacto, string>>;

/** First rejected field, following the order the fields appear in the form. */
export function primerFallo(fallos: Fallos, orden: readonly CampoContacto[]): CampoContacto | undefined {
  return orden.find((c) => fallos[c]);
}

/** Message of a rejected value, or `null` when `comprobar` accepts it. Reuses the server validators and their texts. */
export function mensajeDe(comprobar: () => unknown): string | null {
  try {
    comprobar();
    return null;
  } catch (e) {
    if (e instanceof DatosEmpresaInvalidosError) return e.message;
    throw e;
  }
}

/** Next action as the form holds it: `ninguna` is "Sin próxima acción", `null` is "not chosen yet". */
export interface AccionForm {
  tipo: AccionTipo | 'ninguna' | null;
  detalle: string;
  /** `YYYY-MM-DD`. */
  fecha: string | null;
}

/** Next action to start from: the stored one while it is not overdue, else an empty form dated the next working day. */
export function accionInicial(e: Empresa, hoy: string, requerida: boolean): AccionForm {
  const guardada = e.proximaAccion;
  if (guardada && guardada.fecha >= hoy) {
    return { tipo: guardada.tipo, detalle: guardada.detalle ?? '', fecha: guardada.fecha };
  }
  return { tipo: requerida ? null : 'ninguna', detalle: '', fecha: sumarDiasHabiles(hoy, 1) };
}

/** Rejects a next action with the server's own messages; "Sin próxima acción" is always fine. */
export function validarAccion(a: AccionForm, hoy: string): Fallos {
  if (a.tipo === 'ninguna') return {};
  const fallos: Fallos = {};
  // The server validator reports one error at a time: ask it about the kind and detail, then about the day, so each field shows its own.
  const que = mensajeDe(() => validarProximaAccion({ tipo: a.tipo ?? '', detalle: a.detalle, fecha: hoy }, { requerida: true, hoy }));
  if (que) fallos[/cuál|detalle/.test(que) ? 'accionDetalle' : 'accion'] = que;
  const cuando = mensajeDe(() => validarProximaAccion({ tipo: 'responder', fecha: a.fecha ?? '' }, { requerida: true, hoy }));
  if (cuando) fallos.fecha = cuando;
  return fallos;
}

/** Body field `proximaAccion`: `null` for "Sin próxima acción". */
export function accionACuerpo(a: AccionForm): Record<string, string> | null {
  if (a.tipo === null || a.tipo === 'ninguna' || a.fecha === null) return null;
  const detalle = a.detalle.trim();
  return detalle ? { tipo: a.tipo, detalle, fecha: a.fecha } : { tipo: a.tipo, fecha: a.fecha };
}

/** Days with next actions of open cards other than `excluirId`, for the dots of the calendar. */
export function agendaDe(empresas: Empresa[], excluirId: string | null): Record<string, number> {
  const dias: Record<string, number> = {};
  for (const e of empresas) {
    if (e.idEmpresa === excluirId || !e.proximaAccion || e.etapa === 'cliente' || e.etapa === 'perdido') continue;
    dias[e.proximaAccion.fecha] = (dias[e.proximaAccion.fecha] ?? 0) + 1;
  }
  return dias;
}

export type ResultadoSaliente = 'conversamos' | 'no_contesto' | 'deje_mensaje';

/** What the "Registrar contacto" panel holds. */
export interface RegistroForm {
  direccion: Direccion;
  medio: Medio;
  medioOtro: string;
  resultado: ResultadoSaliente;
  /** Inbound only: "¿Ya le respondiste?". */
  respondido: boolean;
  resumen: string;
  accion: AccionForm;
}

export function registroInicial(e: Empresa, direccion: Direccion, hoy: string): RegistroForm {
  return {
    direccion,
    medio: e.medio ?? 'llamada',
    medioOtro: e.medio === 'otro' ? (e.medioOtro ?? '') : '',
    resultado: 'conversamos',
    respondido: true,
    resumen: '',
    accion: accionInicial(e, hoy, e.etapa !== 'cliente'),
  };
}

/** Result the API receives. */
export function resultadoDe(f: RegistroForm): Resultado {
  if (f.direccion === 'saliente') return f.resultado;
  return f.respondido ? 'respondido' : 'pendiente';
}

const esConversacion = (f: Pick<RegistroForm, 'direccion' | 'resultado' | 'respondido'>): boolean =>
  f.direccion === 'saliente' ? f.resultado === 'conversamos' : f.respondido;

/** Label of the summary field; a real conversation makes it required. */
export function etiquetaResumen(f: RegistroForm): { texto: string; opcional: boolean } {
  if (esConversacion(f)) return { texto: 'Resumen de la conversación', opcional: false };
  if (f.direccion === 'entrante') return { texto: '¿Qué necesita?', opcional: true };
  return { texto: 'Resumen', opcional: true };
}

/** One-line preview of what saving does to the card (L8, function `prever` of the artboard). */
export function previaContacto(e: Empresa, f: Pick<RegistroForm, 'direccion' | 'resultado' | 'respondido'>): string {
  const col = ETAPA_LABELS[e.etapa];
  const n = e.intentosSinRespuesta + 1;
  if (esConversacion(f)) {
    const cero = e.intentosSinRespuesta > 0 ? ' El contador de intentos vuelve a cero.' : '';
    if (e.etapa === 'por_contactar') return `La tarjeta pasa a «Contactado» con la etiqueta «Conversamos».${cero}`;
    if (e.etapa === 'contactado') return `La tarjeta se queda en «Contactado» y cambia a «Conversamos».${cero}`;
    return `La tarjeta se queda en «${col}» y guarda la conversación en el historial.${cero}`;
  }
  if (f.direccion === 'entrante') {
    return e.etapa === 'por_contactar'
      ? 'La tarjeta pasa a «Contactado» con la etiqueta «Falta responder».'
      : `La tarjeta se queda en «${col}» con la etiqueta «Falta responder».`;
  }
  const sugerir =
    n >= UMBRAL_INTENTOS
      ? ' Como son 3 o más seguidos, te sugerirá pasarla a Perdido con el motivo «No contestan».'
      : '';
  if (e.etapa === 'por_contactar') {
    return (
      (n === 1
        ? 'La tarjeta pasa a «Contactado» con la etiqueta «Sin respuesta · 1».'
        : `La tarjeta sigue en «Contactado» como «Sin respuesta · ${n}».`) + sugerir
    );
  }
  if (e.etapa === 'contactado') return `La tarjeta se queda en «Contactado» como «Sin respuesta · ${n}».${sugerir}`;
  return `La tarjeta se queda en «${col}» y suma el intento ${n} sin respuesta.${sugerir}`;
}

/** Medium "Otro" needs its "¿Cuál?" (S7). */
export function validarMedio(medio: Medio, medioOtro: string): Fallos {
  const mensaje = mensajeDe(() => validarMedioContacto(medio, medioOtro));
  return mensaje ? { otro: mensaje } : {};
}

export const ORDEN_REGISTRO: readonly CampoContacto[] = ['otro', 'resumen', 'accion', 'accionDetalle', 'fecha'];

export function validarRegistro(f: RegistroForm, hoy: string): Fallos {
  const fallos: Fallos = validarMedio(f.medio, f.medioOtro);
  const resumen = mensajeDe(() => validarResumen(f.resumen, esConversacion(f)));
  if (resumen) fallos.resumen = resumen;
  return { ...fallos, ...validarAccion(f.accion, hoy) };
}

/** JSON body of `POST /api/crm/empresas/[id]/contactos`. */
export function cuerpoRegistro(f: RegistroForm): Record<string, unknown> {
  const resumen = f.resumen.trim();
  return {
    direccion: f.direccion,
    medio: f.medio,
    ...(f.medio === 'otro' ? { medioOtro: f.medioOtro.trim() } : {}),
    resultado: resultadoDe(f),
    ...(resumen ? { resumen } : {}),
    proximaAccion: accionACuerpo(f.accion),
  };
}
