import type { MensajeCrm } from '../domain/entities';
import type {
  ConversacionCrmRepository,
  EnviadorWhatsappCrmPort,
  MensajeCrmRepository,
} from '../domain/ports';

/**
 * ResponderConversacionUseCase (agente-ia-crm E1) — ONE manual reply
 * from the bandeja, outbox-lite (R4): validate → persist OUT intent
 * PENDIENTE → send → confirm (ENVIADO o FALLIDO) → registrarActividad OUT. The send
 * adapters are selected by KAPSO_MODO (real Kapso vs simulador).
 *
 * Failure contract: a send failure NEVER throws — best-effort FALLIDO +
 * {ok:false} (retry safe: that send truly failed). An intent-persist
 * failure propagates. A post-send confirmation failure → ok:true +
 * CONFIRMACION_FALLIDA (fila PENDIENTE: el envío SUCEDIÓ, reintentar duplicaría).
 * registrarActividad es best-effort y corre FUERA del try de la confirmación:
 * si falla con la fila ya ENVIADO, el resultado sigue ok:true (solo log) — no
 * debe mentir con CONFIRMACION_FALLIDA. Validation/state failures (cuerpo,
 * conversación, cerrada, teléfono) return {ok:false} too without any write —
 * the route maps each code to its HTTP status.
 */

/** NVARCHAR(4000) en CRM_Mensajes — el límite físico de un cuerpo. */
const CUERPO_MAX = 4000;

/** Every typed failure the responder can return (route maps to HTTP). */
export type ErrorResponderConversacion =
  | { code: 'CONVERSACION_NO_ENCONTRADA' }
  | { code: 'CONVERSACION_CERRADA'; detalle: string }
  | { code: 'SIN_TELEFONO'; detalle: string }
  | { code: 'CUERPO_INVALIDO'; detalle: string }
  | {
      code: 'KAPSO_NO_CONFIGURADO' | 'KAPSO_AUTH_ERROR' | 'KAPSO_TIMEOUT' | 'KAPSO_ERROR';
      detalle: string;
    };

export type ResultadoResponderConversacion =
  | { ok: true; mensaje: MensajeCrm; advertencia?: 'CONFIRMACION_FALLIDA' }
  | { ok: false; error: ErrorResponderConversacion };

export interface ResponderConversacionDeps {
  conversaciones: ConversacionCrmRepository;
  mensajes: MensajeCrmRepository;
  whatsapp: EnviadorWhatsappCrmPort;
}

export interface ResponderConversacionEntrada {
  conversacionId: number;
  cuerpo: string;
}

export class ResponderConversacionUseCase {
  constructor(private readonly deps: ResponderConversacionDeps) {}

  async ejecutar(entrada: ResponderConversacionEntrada): Promise<ResultadoResponderConversacion> {
    // 1. Cuerpo: no vacío tras trim y ≤4000 (límite de columna). Se trimea
    //    UNA vez y esa MISMA variable se valida, envía y persiste — nunca
    //    mezclar el largo del original con el valor trimeado (E1 advisory
    //    R2-trimmed-length-mismatch).
    const cuerpo = entrada.cuerpo.trim();
    if (cuerpo === '' || cuerpo.length > CUERPO_MAX) {
      return {
        ok: false,
        error: {
          code: 'CUERPO_INVALIDO',
          detalle: 'El cuerpo no puede estar vacío ni superar 4000 caracteres',
        },
      };
    }

    // 2. Conversación existente y operable.
    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) {
      return { ok: false, error: { code: 'CONVERSACION_NO_ENCONTRADA' } };
    }
    if (conversacion.estado === 'CERRADA') {
      return {
        ok: false,
        error: { code: 'CONVERSACION_CERRADA', detalle: 'La conversación está cerrada' },
      };
    }

    // 3. Destino: sin teléfono no hay envío posible (una conversación
    //    BSUID-nacida puede no tener clave E.164 todavía).
    if (conversacion.telefono === null) {
      return {
        ok: false,
        error: {
          code: 'SIN_TELEFONO',
          detalle: 'La conversación no tiene teléfono asociado',
        },
      };
    }

    // Fase 1 (outbox-lite R4): persist PENDIENTE antes de enviar — si falla, propaga (nada salió).
    const mensaje = await this.deps.mensajes.crear({
      conversacionId: conversacion.id,
      direccion: 'OUT',
      emisor: 'HUMANO',
      cuerpo,
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: null,
      idempotenciaKey: null,
      estadoEnvio: 'PENDIENTE',
    });

    const envio = await this.deps.whatsapp.enviar({ telefonoE164: conversacion.telefono, cuerpo });

    if (envio.ok) {
      // Fase 3a — confirmación: SOLO actualizarEnvio dentro de este try; su
      // fallo es el ÚNICO CONFIRMACION_FALLIDA legítimo (el envío SUCEDIÓ, la
      // fila queda PENDIENTE, reintentar duplicaría).
      let confirmado: MensajeCrm | null;
      try {
        confirmado = await this.deps.mensajes.actualizarEnvio(mensaje.id, {
          estadoEnvio: 'ENVIADO',
          wamid: envio.wamid,
        });
      } catch (error) {
        console.error('[responderConversacion] confirmación post-envío falló', { mensajeId: mensaje.id, wamid: envio.wamid, error });
        return { ok: true, mensaje, advertencia: 'CONFIRMACION_FALLIDA' };
      }

      // Fase 3b — actividad OUT: best-effort y FUERA del try de la
      // confirmación. La fila YA está confirmada: si esto falla, mentir con
      // CONFIRMACION_FALLIDA sería peor que perder el tick de ultimoMensajeEn
      // (la conversación se re-abre y re-intenta naturalmente).
      try {
        await this.deps.conversaciones.registrarActividad(conversacion.id, 'OUT');
      } catch (errorActividad) {
        console.error('[responderConversacion] registrar actividad OUT falló (mensaje ya confirmado ENVIADO)', { conversacionId: conversacion.id, mensajeId: mensaje.id, error: errorActividad });
      }

      // La fila confirmada por el repositorio es la verdad; null (fila
      // desaparecida — patológico) cae a la PENDIENTE persistida en fase 1.
      return { ok: true, mensaje: confirmado ?? mensaje };
    }

    // Envío fallido: best-effort FALLIDO (reintentar es seguro, nada salió) — su fallo no enmascara el del canal.
    try {
      await this.deps.mensajes.actualizarEnvio(mensaje.id, { estadoEnvio: 'FALLIDO' });
    } catch (errorMarcado) {
      console.error('[responderConversacion] marcado FALLIDO falló', { mensajeId: mensaje.id, error: errorMarcado });
    }
    return { ok: false, error: { code: envio.error, detalle: envio.detalle } };
  }
}
