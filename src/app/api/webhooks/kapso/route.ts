import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse, after } from 'next/server';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  ProcesarMensajeWhatsappUseCase,
  esMensajeWhatsappRecibido,
  type MensajeWhatsappRecibido,
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
 * - the 200 ack must land inside 10s or Kapso retries: everything
 *   heavier than the fast idempotencia check is scheduled via
 *   `after()` (Next 16) and never blocks the response.
 *
 * Fail closed: a missing secret answers 503 — never processes
 * unsigned. No secrets and no message bodies in logs.
 */

/** Trabajo async en vuelo (solo el fallback fuera del runtime de Next). */
const trabajosEnVuelo = new Set<Promise<void>>();

/**
 * Test seam: cuando el handler corre FUERA del runtime de Next
 * (vitest invoca POST directo), `after()` no tiene request scope y
 * lanza — el fallback corre el trabajo detached y lo trackea acá para
 * que los tests puedan esperar la escritura antes de asertar.
 */
export function __esperarProcesamientoKapso(): Promise<void> {
  return Promise.all([...trabajosEnVuelo]).then(() => undefined);
}

function firmaValida(recibida: string, rawBody: string, secret: string): boolean {
  const esperada = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(recibida.toLowerCase(), 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  // timingSafeEqual exige igual longitud: el chequeo previo no filtra
  // información temporal del prefijo compartido.
  return a.length === b.length && timingSafeEqual(a, b);
}

function programarTrabajo(trabajo: () => Promise<void>): void {
  try {
    // Runtime de Next: corre DESPUÉS de flushear el ack (<10s).
    after(trabajo);
  } catch {
    // Fuera de request scope (tests / simulador): detached + tracked.
    const promesa = trabajo().finally(() => {
      trabajosEnVuelo.delete(promesa);
    });
    trabajosEnVuelo.add(promesa);
  }
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

  // Dedup check rápido ANTES del ack (Kapso espera <10s); la escritura
  // va async. El use case re-chequea y el índice único filtrado es el
  // backstop de la carrera entre ambos.
  const claveHeader = request.headers.get('x-idempotency-key');
  const trabajos: Array<{ key: string; wamid: string; payload: MensajeWhatsappRecibido }> = [];
  let procesados = 0;
  let duplicados = 0;
  for (const payload of payloads) {
    if (!esMensajeWhatsappRecibido(payload)) continue;
    const wamid = payload.message.id;
    // Clave por payload: el header tal cual en eventos simples; en un
    // batch el header es UNA clave para N mensajes, así que se compone
    // con el wamid para que cada mensaje dedupe por sí mismo.
    const key =
      claveHeader !== null && payloads.length === 1
        ? claveHeader
        : claveHeader !== null
          ? `${claveHeader}:${wamid}`
          : wamid;
    if (await db.mensajes.existePorIdempotenciaKey(key)) {
      duplicados += 1;
      continue;
    }
    procesados += 1;
    trabajos.push({ key, wamid, payload });
  }

  programarTrabajo(async () => {
    for (const { key, wamid, payload } of trabajos) {
      try {
        await useCase.ejecutar({ idempotenciaKey: key, message: payload.message });
      } catch (err: unknown) {
        // Contexto sin cuerpos ni secretos; el ack ya salió — Kapso
        // reintenta ante fallo real (at-least-once + dedup).
        console.error('[kapso-webhook] error procesando mensaje', {
          wamid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  return NextResponse.json({ success: true, procesados, duplicados });
}
