import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  ProcesarMensajeWhatsappUseCase,
  esMensajeWhatsappRecibido,
} from '@/features/crm/application/procesarMensajeWhatsapp';

/**
 * `POST /api/webhooks/kapso` — PUBLIC ingestion endpoint for Kapso
 * (agente-ia-crm E1/T2). Deliberately NOT registered in
 * RUTAS_PROTEGIDAS (the `/api/asistencia` device-namespace
 * precedent): the caller is Kapso, so the credential IS the
 * X-Webhook-Signature HMAC-SHA256 over the EXACT raw body (read as
 * text before any JSON.parse). Contract (docs.kapso.ai):
 *
 * - headers: X-Webhook-Event (`whatsapp.message.received` — the only
 *   event processed), X-Webhook-Signature (hex, sin prefijo `sha256=`),
 *   X-Idempotency-Key (uuid; the replay dedup key), optional
 *   X-Webhook-Batch: true → the body is `{type, batch, data[], …}`.
 * - E1 processing (dedup → route → persist → counters) is fast DB
 *   I/O, AWAITED in the request BEFORE the 200 ack; on failure the
 *   response is 503 PROCESAMIENTO_FALLIDO → Kapso retries (at-least-
 *   once, idempotent via the X-Idempotency-Key dedup). The E2 AI
 *   engine (slow LLM work) needs its own durable queue, not this.
 *
 * Fail closed: a missing secret answers 503 — never processes
 * unsigned. No secrets and no message bodies in logs.
 */

function firmaValida(recibida: string, rawBody: string, secret: string): boolean {
  const esperada = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(recibida.toLowerCase(), 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  // timingSafeEqual exige igual longitud: el chequeo previo no filtra
  // información temporal del prefijo compartido.
  return a.length === b.length && timingSafeEqual(a, b);
}

function esEnvelopeBatch(v: unknown): v is { data: unknown[] } {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as { data?: unknown }).data)
  );
}

export async function POST(request: Request): Promise<Response> {
  // Fail closed: sin secret no hay firma verificable — no procesar.
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[kapso-webhook] rechazado: KAPSO_WEBHOOK_SECRET no configurado');
    return NextResponse.json({ success: false, error: 'WEBHOOK_NO_CONFIGURADO' }, { status: 503 });
  }

  // Raw body ANTES de cualquier parse: la firma es sobre los bytes exactos.
  const rawBody = await request.text();

  const firma = request.headers.get('x-webhook-signature');
  if (firma === null || !firmaValida(firma, rawBody, secret)) {
    return NextResponse.json({ success: false, error: 'FIRMA_INVALIDA' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: 'PAYLOAD_INVALIDO' }, { status: 400 });
  }

  // Solo whatsapp.message.received: otros eventos se ackean intactos.
  const evento = request.headers.get('x-webhook-event');
  if (evento !== 'whatsapp.message.received') {
    return NextResponse.json({ success: true, procesados: 0, duplicados: 0 });
  }

  let payloads: unknown[];
  if (request.headers.get('x-webhook-batch') === 'true') {
    if (!esEnvelopeBatch(body)) {
      return NextResponse.json({ success: false, error: 'PAYLOAD_INVALIDO' }, { status: 400 });
    }
    payloads = body.data;
  } else {
    payloads = [body];
  }

  const db = await getCrmDb();
  if (!db.conversaciones || !db.mensajes) {
    return NextResponse.json({ success: false, error: 'CRM_NO_CONFIGURADO' }, { status: 503 });
  }
  const useCase = new ProcesarMensajeWhatsappUseCase({
    conversaciones: db.conversaciones,
    mensajes: db.mensajes,
  });

  // El dedup vive DENTRO del use case, awaited antes del ack: fallo → 503 y reintento.
  const claveHeader = request.headers.get('x-idempotency-key');
  let procesados = 0;
  let duplicados = 0;
  for (const payload of payloads) {
    if (!esMensajeWhatsappRecibido(payload)) continue;
    const wamid = payload.message.id;
    // Clave de dedup UNIFORME por identidad de mensaje (remediación
    // R3-clave-batch-inconsistente): el wamid es la identidad estable
    // del mensaje — el mismo mensaje re-entregado (single o batch,
    // mismo o distinto X-Idempotency-Key de delivery) dedupe igual.
    // El header solo es fallback si el wamid faltara.
    const key = wamid !== '' ? wamid : (claveHeader ?? wamid);
    try {
      const resultado = await useCase.ejecutar({ idempotenciaKey: key, message: payload.message });
      if (resultado.duplicado) duplicados += 1; else procesados += 1;
    } catch (err: unknown) {
      // Sin cuerpos ni secretos: solo el wamid y el mensaje de error.
      console.error('[kapso-webhook] error procesando mensaje', {
        wamid,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { success: false, error: 'PROCESAMIENTO_FALLIDO' },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({ success: true, procesados, duplicados });
}
