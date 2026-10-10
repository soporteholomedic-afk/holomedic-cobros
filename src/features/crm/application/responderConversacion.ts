import type { MensajeCrm } from '../domain/entities';
import type {
  ConversacionCrmRepository,
  EnviadorWhatsappCrmPort,
  MensajeCrmRepository,
} from '../domain/ports';

/**
 * ResponderConversacionUseCase (agente-ia-crm E1) — ONE manual reply
 * from the bandeja: validate → send through the WhatsApp port →
 * persist the OUT mensaje (ENVIADO or FALLIDO) → registrarActividad
 * OUT (ultimoMensajeEn advances, noLeidos does NOT grow). The send
 * adapters are selected by KAPSO_MODO (real Kapso vs simulador).
 *
 * Failure contract: a send failure is NEVER thrown — the mensaje is
 * still persisted as FALLIDO (auditoría) and the use case returns
 * {ok:false, error} so the bandeja can render the failed attempt.
 * Validation/state failures (cuerpo, conversación, cerrada, teléfono)
 * return {ok:false} too without any write — the route maps each code
 * to its HTTP status.
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
  | { ok: true; mensaje: MensajeCrm }
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
    // 1. Cuerpo: no vacío tras trim y ≤4000 (límite de columna).
    const cuerpo = entrada.cuerpo.trim();
    if (cuerpo === '' || entrada.cuerpo.length > CUERPO_MAX) {
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

    // 4. Envío por el canal (Kapso real o simulador según KAPSO_MODO).
    const envio = await this.deps.whatsapp.enviar({
      telefonoE164: conversacion.telefono,
      cuerpo,
    });

    // 5. Persistencia SIEMPRE (auditoría): ENVIADO con wamid o FALLIDO.
    const mensaje = await this.deps.mensajes.crear({
      conversacionId: conversacion.id,
      direccion: 'OUT',
      emisor: 'HUMANO',
      cuerpo,
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: envio.ok ? envio.wamid : null,
      estadoEnvio: envio.ok ? 'ENVIADO' : 'FALLIDO',
    });

    // 6. Bandeja tick OUT: ultimoMensajeEn avanza, noLeidos no crece.
    await this.deps.conversaciones.registrarActividad(conversacion.id, 'OUT');

    return envio.ok
      ? { ok: true, mensaje }
      : { ok: false, error: { code: envio.error, detalle: envio.detalle } };
  }
}
