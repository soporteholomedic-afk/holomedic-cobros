import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Import under test ----

import { POST, __esperarProcesamientoKapso } from './route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type {
  CandidatoVinculacion,
  ConversacionCrmRepository,
  MensajeCrmRepository,
} from '@/features/crm/domain/ports';
import type {
  ConversacionCrm,
  CrearConversacionInput,
  CrearMensajeInput,
  MensajeCrm,
} from '@/features/crm/domain/entities';

/**
 * Route contract for the PUBLIC Kapso webhook (agente-ia-crm T2) —
 * no session: the caller is Kapso, so the credential IS the HMAC
 * signature over the exact raw body. Pinned here:
 * - Fail closed: missing KAPSO_WEBHOOK_SECRET → 503; missing/wrong
 *   X-Webhook-Signature → 401; broken JSON with a VALID signature →
 *   400 (the signature is over bytes, not semantics).
 * - Ack first: 200 {procesados, duplicados} returns immediately; the
 *   write happens after (observed via __esperarProcesamientoKapso —
 *   in the vitest process `after()` has no request scope and the
 *   route falls back to a tracked detached promise).
 * - Idempotencia: the fast existePorIdempotenciaKey check runs before
 *   the ack, so a replay of the same X-Idempotency-Key answers
 *   duplicados:1 without a second write.
 * - Batch envelope (X-Webhook-Batch: true, body.data[]) processes
 *   every payload; unrelated events ack procesados:0 untouched.
 */

const SECRET = 'kapso-test-secret';

function firmar(raw: string): string {
  return createHmac('sha256', SECRET).update(raw).digest('hex');
}

function payloadTexto(wamid = 'wamid.123'): string {
  return JSON.stringify({
    phone_number_id: 'PNID.123',
    message: {
      id: wamid,
      timestamp: '1730092800',
      type: 'text',
      from: '595981234567',
      from_user_id: 'US.13491208655302741918',
      username: '@testusername',
      text: { body: 'Hola, quiero información' },
      kapso: { direction: 'inbound', status: 'received' },
    },
  });
}

function requestPost(
  raw: string,
  sobres: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/webhooks/kapso', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-webhook-event': 'whatsapp.message.received',
      'x-webhook-signature': firmar(raw),
      'x-idempotency-key': 'key-1',
      ...sobres,
    },
  });
}

// ---- Fakes of the two consumed ports (vi.fn for call assertions) ----

function filaConversacion(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
  const ahora = new Date().toISOString();
  return {
    id: 1,
    empresaId: null,
    contactoId: null,
    canal: 'WHATSAPP',
    telefono: '+595981234567',
    identificadorCanal: 'US.13491208655302741918',
    estado: 'PENDIENTE_VINCULACION',
    asignadaA: null,
    modo: 'IA',
    ultimoMensajeEn: null,
    noLeidos: 0,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...sobres,
  };
}

function makeConversaciones(
  candidatos: CandidatoVinculacion[] = [],
): ConversacionCrmRepository & { crearMock: ReturnType<typeof vi.fn> } {
  const crearMock = vi.fn(async (datos: CrearConversacionInput): Promise<ConversacionCrm> =>
    filaConversacion({
      telefono: datos.telefono ?? null,
      identificadorCanal: datos.identificadorCanal ?? null,
      empresaId: datos.empresaId ?? null,
      contactoId: datos.contactoId ?? null,
      estado: datos.estado ?? 'PENDIENTE_VINCULACION',
    }),
  );
  return {
    crearMock,
    crear: crearMock,
    obtenerPorId: vi.fn(async (): Promise<ConversacionCrm | null> => null),
    buscarPorCanal: vi.fn(async (): Promise<ConversacionCrm | null> => null),
    listar: vi.fn(async (): Promise<ConversacionCrm[]> => []),
    vincular: vi.fn(async (): Promise<ConversacionCrm | null> => null),
    actualizarEstado: vi.fn(async (): Promise<ConversacionCrm | null> => null),
    marcarMensajesLeidos: vi.fn(async (): Promise<void> => undefined),
    registrarActividad: vi.fn(async (): Promise<void> => undefined),
    buscarCandidatosVinculacion: vi.fn(async (): Promise<CandidatoVinculacion[]> => candidatos),
  };
}

function makeMensajes(): MensajeCrmRepository & {
  escritas: CrearMensajeInput[];
  claves: Set<string>;
} {
  const escritas: CrearMensajeInput[] = [];
  const claves = new Set<string>();
  let id = 0;
  return {
    escritas,
    claves,
    crear: vi.fn(async (datos: CrearMensajeInput): Promise<MensajeCrm> => {
      escritas.push(structuredClone(datos));
      const clave = datos.idempotenciaKey ?? null;
      if (clave !== null) claves.add(clave);
      return {
        id: ++id,
        conversacionId: datos.conversacionId,
        direccion: datos.direccion,
        emisor: datos.emisor,
        cuerpo: datos.cuerpo,
        tipo: datos.tipo ?? 'TEXTO',
        canal: datos.canal ?? 'WHATSAPP',
        wamid: datos.wamid ?? null,
        idempotenciaKey: clave,
        estadoEnvio: null,
        fuentes: null,
        score: null,
        modelo: null,
        creadoEn: new Date().toISOString(),
      };
    }),
    existePorIdempotenciaKey: vi.fn(async (key: string): Promise<boolean> => claves.has(key)),
    listarPorConversacion: vi.fn(async (): Promise<MensajeCrm[]> => []),
  };
}

function setDb(
  conversaciones: ConversacionCrmRepository,
  mensajes: MensajeCrmRepository,
): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: {} as never,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    envios: {} as never,
    panel: {} as never,
    conversaciones,
    mensajes,
  } satisfies CrmDb);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KAPSO_WEBHOOK_SECRET = SECRET;
});

afterEach(async () => {
  // Drena cualquier trabajo async agendado antes de desconectar el fake.
  await __esperarProcesamientoKapso();
  __setCrmDbForTests(null);
  delete process.env.KAPSO_WEBHOOK_SECRET;
});

// ---- Configuración / firma ----

describe('POST /api/webhooks/kapso — configuración y firma', () => {
  it('sin KAPSO_WEBHOOK_SECRET → 503 WEBHOOK_NO_CONFIGURADO (fail closed)', async () => {
    delete process.env.KAPSO_WEBHOOK_SECRET;
    const conversaciones = makeConversaciones();
    const mensajes = makeMensajes();
    setDb(conversaciones, mensajes);

    const response = await POST(requestPost(payloadTexto()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ success: false, error: 'WEBHOOK_NO_CONFIGURADO' });
    expect(mensajes.escritas).toHaveLength(0);
  });

  it('firma inválida → 401 FIRMA_INVALIDA sin procesar nada', async () => {
    const conversaciones = makeConversaciones();
    const mensajes = makeMensajes();
    setDb(conversaciones, mensajes);

    const response = await POST(
      requestPost(payloadTexto(), { 'x-webhook-signature': 'deadbeef'.repeat(8) }),
    );
    const body = await response.json();
    await __esperarProcesamientoKapso();

    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, error: 'FIRMA_INVALIDA' });
    expect(mensajes.escritas).toHaveLength(0);
    expect(conversaciones.crearMock).not.toHaveBeenCalled();
  });

  it('sin header de firma → 401 FIRMA_INVALIDA', async () => {
    const mensajes = makeMensajes();
    setDb(makeConversaciones(), mensajes);

    const raw = payloadTexto();
    const response = await POST(
      new Request('http://localhost/api/webhooks/kapso', {
        method: 'POST',
        body: raw,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = await response.json();
    await __esperarProcesamientoKapso();

    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, error: 'FIRMA_INVALIDA' });
    expect(mensajes.escritas).toHaveLength(0);
  });

  it('JSON roto con firma VÁLIDA → 400 PAYLOAD_INVALIDO', async () => {
    const mensajes = makeMensajes();
    setDb(makeConversaciones(), mensajes);

    const raw = '{"phone_number_id": "PNID';
    const response = await POST(requestPost(raw));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, error: 'PAYLOAD_INVALIDO' });
    expect(mensajes.escritas).toHaveLength(0);
  });
});

// ---- Procesamiento, ack e idempotencia ----

describe('POST /api/webhooks/kapso — ack, procesamiento async e idempotencia', () => {
  it('firma válida → 200 {procesados:1} inmediato y el mensaje persiste async', async () => {
    const conversaciones = makeConversaciones();
    const mensajes = makeMensajes();
    setDb(conversaciones, mensajes);

    const response = await POST(requestPost(payloadTexto()));
    const body = await response.json();
    // El ack llega ANTES de que exista la escritura (procesamiento async).
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, procesados: 1, duplicados: 0 });
    expect(mensajes.escritas).toHaveLength(0);

    await __esperarProcesamientoKapso();

    expect(mensajes.escritas).toHaveLength(1);
    expect(mensajes.escritas[0]).toMatchObject({
      direccion: 'IN',
      emisor: 'CLIENTE',
      cuerpo: 'Hola, quiero información',
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: 'wamid.123',
      idempotenciaKey: 'key-1',
    });
    expect(conversaciones.crearMock).toHaveBeenCalledTimes(1);
    expect(conversaciones.registrarActividad).toHaveBeenCalledWith(1);
  });

  it('replay con el mismo X-Idempotency-Key → duplicados:1 sin segunda escritura', async () => {
    const conversaciones = makeConversaciones();
    const mensajes = makeMensajes();
    setDb(conversaciones, mensajes);

    const primera = await POST(requestPost(payloadTexto()));
    const primeraBody = await primera.json();
    expect(primeraBody).toEqual({ success: true, procesados: 1, duplicados: 0 });
    await __esperarProcesamientoKapso();

    const segunda = await POST(requestPost(payloadTexto()));
    const segundaBody = await segunda.json();
    await __esperarProcesamientoKapso();

    expect(segunda.status).toBe(200);
    expect(segundaBody).toEqual({ success: true, procesados: 0, duplicados: 1 });
    expect(mensajes.escritas).toHaveLength(1);
    expect(conversaciones.crearMock).toHaveBeenCalledTimes(1);
  });

  it('batch envelope con 2 payloads → procesados:2 (claves únicas por wamid)', async () => {
    const conversaciones = makeConversaciones();
    const mensajes = makeMensajes();
    setDb(conversaciones, mensajes);

    const raw = JSON.stringify({
      type: 'whatsapp.message.received',
      batch: true,
      data: [JSON.parse(payloadTexto('wamid.a')), JSON.parse(payloadTexto('wamid.b'))],
      batch_info: { size: 2 },
    });
    const response = await POST(requestPost(raw, { 'x-webhook-batch': 'true' }));
    const body = await response.json();
    await __esperarProcesamientoKapso();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, procesados: 2, duplicados: 0 });
    expect(mensajes.escritas).toHaveLength(2);
    // La clave del header NO se comparte tal cual entre payloads del
    // batch: cada mensaje dedupa por su propio wamid compuesto.
    expect(new Set(mensajes.escritas.map((m) => m.idempotenciaKey)).size).toBe(2);
    expect(mensajes.escritas.map((m) => m.wamid).sort()).toEqual(['wamid.a', 'wamid.b']);
  });

  it('evento no message.received → 200 procesados:0 sin tocar la base', async () => {
    const conversaciones = makeConversaciones();
    const mensajes = makeMensajes();
    setDb(conversaciones, mensajes);

    const response = await POST(
      requestPost(payloadTexto(), { 'x-webhook-event': 'whatsapp.message.status' }),
    );
    const body = await response.json();
    await __esperarProcesamientoKapso();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, procesados: 0, duplicados: 0 });
    expect(mensajes.escritas).toHaveLength(0);
    expect(conversaciones.crearMock).not.toHaveBeenCalled();
  });
});
