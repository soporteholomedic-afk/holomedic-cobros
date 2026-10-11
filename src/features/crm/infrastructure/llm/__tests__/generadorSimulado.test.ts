import { describe, expect, it } from 'vitest';

import { GeneradorSimulado } from '../generadorSimulado';
import type { EntradaGenerarRespuesta } from '../../../domain/entities';

/**
 * Deterministic simulator contract (agente-ia-crm E2·T3): no network,
 * no timers, byte-stable outputs — the E2 DoD demo runs without an
 * API key. Three generarRespuesta branches (conocimiento → first
 * fragment; solo memorias → first memoria, NO knowledge ids; both
 * empty → escalation deferral) plus the single-observation destiler
 * (empty consulta → []).
 */

const TEXTO_DERIVACION = 'Gracias por tu consulta. En breve te confirma una persona del equipo de Holomedic.';

const CONOCIMIENTO: EntradaGenerarRespuesta['conocimiento'] = [
  { id: 7, titulo: 'Examen ocupacional', contenido: 'Incluye examen médico, audiometría y espirometría.' },
  { id: 8, titulo: 'Precios', contenido: 'El precio depende del headcount.' },
];

describe('GeneradorSimulado — generarRespuesta (E2·T3)', () => {
  it('con conocimiento → texto del PRIMER fragmento recortado a 400, score 0.8, enScope, ids [primer id]', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: '¿Qué incluye el examen?',
      historial: [],
      conocimiento: CONOCIMIENTO,
      memorias: [],
    });

    expect(respuesta).toEqual({
      texto: 'Incluye examen médico, audiometría y espirometría.',
      scoreConfianza: 0.8,
      enScope: true,
      requiereAyudaHumana: false,
      idsConocimiento: [7],
    });
  });

  it('contenido mayor a 400 caracteres se recorta a exactamente 400', async () => {
    const generador = new GeneradorSimulado();
    const largo = 'a'.repeat(600);

    const respuesta = await generador.generarRespuesta({
      consulta: 'c',
      historial: [],
      conocimiento: [{ id: 1, titulo: 'T', contenido: largo }],
      memorias: [],
    });

    expect(respuesta.texto).toBe('a'.repeat(400));
    expect(respuesta.enScope).toBe(true);
  });

  it('contenido vacío del fragmento → prefijo seguro con el título', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: 'c',
      historial: [],
      conocimiento: [{ id: 3, titulo: 'Horarios', contenido: '   ' }],
      memorias: [],
    });

    expect(respuesta.texto).toBe('Información disponible: Horarios');
  });

  it('solo memorias → texto de la PRIMERA memoria, idsConocimiento []', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: 'c',
      historial: [],
      conocimiento: [],
      memorias: [
        { tipo: 'preferencia', titulo: 'Tarde', contenido: 'Prefiere turnos de tarde.' },
        { tipo: 'hecho_cliente', titulo: 'Otra', contenido: 'Otra memoria.' },
      ],
    });

    expect(respuesta).toEqual({
      texto: 'Prefiere turnos de tarde.',
      scoreConfianza: 0.8,
      enScope: true,
      requiereAyudaHumana: false,
      idsConocimiento: [],
    });
  });

  it('conocimiento y memorias vacíos → derivación exacta, enScope false, score 0.1, ayuda humana', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: '¿Venden seguros de vida?',
      historial: [],
      conocimiento: [],
      memorias: [],
    });

    expect(respuesta).toEqual({
      texto: TEXTO_DERIVACION,
      scoreConfianza: 0.1,
      enScope: false,
      requiereAyudaHumana: true,
      idsConocimiento: [],
    });
  });
});

describe('GeneradorSimulado — destilar (E2·T3)', () => {
  it('exactamente UNA observación hecho_cliente: título = primeras 8 palabras, contenido = consulta (≤200), pinear false', async () => {
    const generador = new GeneradorSimulado();
    const consulta = 'uno dos tres cuatro cinco seis siete ocho nueve diez';

    const observaciones = await generador.destilar({ consulta, respuesta: 'respuesta simulada' });

    expect(observaciones).toEqual([
      {
        tipo: 'hecho_cliente',
        titulo: 'uno dos tres cuatro cinco seis siete ocho',
        contenido: consulta,
        pinear: false,
      },
    ]);
  });

  it('consulta mayor a 200 caracteres → contenido recortado a 200', async () => {
    const generador = new GeneradorSimulado();
    const consulta = 'p'.repeat(350);

    const observaciones = await generador.destilar({ consulta, respuesta: 'r' });

    expect(observaciones[0]?.contenido).toBe('p'.repeat(200));
  });

  it('consulta vacía (o solo espacios) → []', async () => {
    const generador = new GeneradorSimulado();

    expect(await generador.destilar({ consulta: '', respuesta: 'r' })).toEqual([]);
    expect(await generador.destilar({ consulta: '   ', respuesta: 'r' })).toEqual([]);
  });
});
