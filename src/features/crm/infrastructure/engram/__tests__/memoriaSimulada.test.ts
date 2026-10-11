import { describe, expect, it } from 'vitest';

import { MemoriaSimulada } from '../memoriaSimulada';

/**
 * Simulator contract (agente-ia-crm E2·T2): a deterministic in-memory
 * MemoriaConversacionPort — no network, no timers — doubles as the T4
 * motor test fake and the dev fallback (crearMemoriaConversacion).
 * Pins: guardar→buscar roundtrip, the same session/nivel filter
 * semantics the HTTP adapter applies client-side (chat own
 * conversation + empresa-level), empresa isolation, operationId dedup
 * (same id, no duplicate entry), contexto returning ONLY pinned
 * entries, and the pinear effect.
 */

const ENTRADA_CHAT = {
  empresaId: 3,
  conversacionId: 7,
  nivel: 'chat' as const,
  tipo: 'hecho_cliente' as const,
  titulo: 'Visita técnica',
  contenido: 'El cliente confirmó visita técnica el martes',
  operationId: 'op-1',
};

describe('MemoriaSimulada — guardar/buscar (E2·T2)', () => {
  it('roundtrip guardar → buscar mapea a ObservacionMemoria (case-insensitive)', async () => {
    const memoria = new MemoriaSimulada();

    const guardado = await memoria.guardar(ENTRADA_CHAT);
    const resultados = await memoria.buscar('VISITA', 3, 7, 10);

    expect(guardado.estado).toBe('comprometido');
    expect(typeof guardado.id).toBe('number');
    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({
      id: guardado.id,
      nivel: 'chat',
      tipo: 'hecho_cliente',
      titulo: 'Visita técnica',
      contenido: 'El cliente confirmó visita técnica el martes',
    });
    expect(resultados[0]!.creadoEn instanceof Date).toBe(true);
  });

  it('sin coincidencias → [] (match naive sobre titulo+contenido)', async () => {
    const memoria = new MemoriaSimulada();

    await memoria.guardar(ENTRADA_CHAT);

    await expect(memoria.buscar('radiología', 3, 7, 10)).resolves.toEqual([]);
  });

  it("filtra por sesión: nivel chat SOLO en su conversación; nivel empresa en toda la empresa", async () => {
    const memoria = new MemoriaSimulada();

    await memoria.guardar(ENTRADA_CHAT);
    await memoria.guardar({
      ...ENTRADA_CHAT,
      nivel: 'empresa',
      tipo: 'acuerdo',
      titulo: 'Facturación',
      contenido: 'Facturan contra la sede central',
      operationId: 'op-2',
    });

    // Desde OTRA conversación de la misma empresa: solo lo de nivel empresa.
    const desdeOtraConversacion = await memoria.buscar('factur', 3, 99, 10);
    expect(desdeOtraConversacion).toHaveLength(1);
    expect(desdeOtraConversacion[0]).toMatchObject({ nivel: 'empresa', titulo: 'Facturación' });

    // Desde la conversación propia: ambos.
    const desdePropia = await memoria.buscar('a', 3, 7, 10);
    expect(desdePropia).toHaveLength(2);
  });

  it('aislamiento por empresa: otra empresa no ve nada', async () => {
    const memoria = new MemoriaSimulada();

    await memoria.guardar(ENTRADA_CHAT);

    await expect(memoria.buscar('visita', 4, 7, 10)).resolves.toEqual([]);
    await expect(memoria.contexto(4)).resolves.toEqual([]);
  });

  it('respeta el limite tras el filtro', async () => {
    const memoria = new MemoriaSimulada();

    await memoria.guardar(ENTRADA_CHAT);
    await memoria.guardar({
      ...ENTRADA_CHAT,
      tipo: 'preferencia',
      titulo: 'Visita médica anual',
      contenido: 'Prefieren las visitas médicas por la mañana',
      operationId: 'op-2',
    });

    const resultados = await memoria.buscar('visita', 3, 7, 1);
    expect(resultados).toHaveLength(1);
  });
});

describe('MemoriaSimulada — dedup por operationId (E2·T2)', () => {
  it('mismo operationId → mismo id y SIN entrada duplicada', async () => {
    const memoria = new MemoriaSimulada();

    const primera = await memoria.guardar(ENTRADA_CHAT);
    const segunda = await memoria.guardar(ENTRADA_CHAT);

    expect(segunda.id).toBe(primera.id);
    const resultados = await memoria.buscar('visita', 3, 7, 10);
    expect(resultados).toHaveLength(1);
  });

  it('operationId distinto → id distinto y ambas entradas', async () => {
    const memoria = new MemoriaSimulada();

    const primera = await memoria.guardar(ENTRADA_CHAT);
    const segunda = await memoria.guardar({ ...ENTRADA_CHAT, operationId: 'op-otro' });

    expect(segunda.id).not.toBe(primera.id);
    const resultados = await memoria.buscar('visita', 3, 7, 10);
    expect(resultados).toHaveLength(2);
  });
});

describe('MemoriaSimulada — contexto y pinear (E2·T2)', () => {
  it('contexto devuelve SOLO las entradas pineadas (con su id real)', async () => {
    const memoria = new MemoriaSimulada();

    await memoria.guardar(ENTRADA_CHAT);
    const duradera = await memoria.guardar({
      ...ENTRADA_CHAT,
      nivel: 'empresa',
      tipo: 'acuerdo',
      titulo: 'Contrato anual',
      contenido: 'Renovación automática en enero',
      operationId: 'op-durable',
    });

    await expect(memoria.contexto(3)).resolves.toEqual([]);

    await memoria.pinear(duradera.id);

    const contexto = await memoria.contexto(3);
    expect(contexto).toHaveLength(1);
    expect(contexto[0]).toMatchObject({ id: duradera.id, titulo: 'Contrato anual' });
  });

  it('despinear no existe: pinear marca; el resto queda igual', async () => {
    const memoria = new MemoriaSimulada();

    const guardada = await memoria.guardar(ENTRADA_CHAT);

    await expect(memoria.pinear(guardada.id)).resolves.toBeUndefined();
    await expect(memoria.contexto(3)).resolves.toHaveLength(1);
  });
});
