import { sendEmail } from '@/utils/sendEmail';

import type {
  EnviadorCorreoCrmPort,
  EnvioCrmCorreo,
  ResultadoEnvioCrm,
} from '../../domain/ports';
import { renderPlantillaCorreo } from '../../domain/plantillasCorreo';

/**
 * CRM SMTP adapter (rediseno-crm-panel task 4.1, design D5): renders the
 * verbatim template and dispatches through the shared sendEmail with the
 * DEDICATED `crm` purpose (SMTP_USER_CRM / SMTP_PASS_CRM — no cross-purpose
 * fallback lives inside sendEmail). The typed SendEmailResult error codes
 * surface VERBATIM as ResultadoEnvioCrm: the use case (5.1) turns the
 * failure arm into a FALLIDO log row and never advances the machine.
 * v1 sends without attachments (decision 3) — no template references the
 * signature logo cid, so sendEmail appends nothing.
 */
export class EnviadorCorreoCrm implements EnviadorCorreoCrmPort {
  async enviar(datos: EnvioCrmCorreo): Promise<ResultadoEnvioCrm> {
    const renderizada = renderPlantillaCorreo(datos.plantilla, {
      empresa: datos.empresa,
      contacto: datos.contacto,
      sector: datos.sector,
      trabajadores: datos.trabajadores,
    });
    const resultado = await sendEmail({
      to: [datos.destinatario],
      subject: renderizada.asunto,
      html: renderizada.cuerpo,
      purpose: 'crm',
    });
    return resultado.success
      ? { ok: true, messageId: resultado.messageId }
      : { ok: false, error: resultado.code, detalle: resultado.error };
  }
}
