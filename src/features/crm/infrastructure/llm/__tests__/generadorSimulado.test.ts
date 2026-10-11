import { describe, expect, it } from 'vitest';

import { GeneradorSimulado } from '../generadorSimulado';
import type { EntradaGenerarRespuesta } from '../../../domain/entities';

/**
 * Deterministic simulator contract (agente-ia-crm E2·T3): no network,
 * no timers, byte-stable outputs — the E2 DoD demo runs without an
 * API key. Three generarRespuesta branches (conocimiento → first
 * fragment; solo memorias → first memoria, NO knowledge ids; both
 * empty → escalation deferral) plus the single-observation destiler
 * (empty consulta → []). E2·T9: contactoNuevo with NO recall → a warm
 * greeting asking for nombre/empresa (answered, never escalated);
 * extraerIdentificacion always null (identification is exercised only
 * by the real adapter — motor tests mock the port).
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
      contactoNuevo: false,
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
      modelo: 'simulado',
    });
  });

  it('contenido mayor a 400 caracteres se recorta a exactamente 400', async () => {
    const generador = new GeneradorSimulado();
    const largo = 'a'.repeat(600);

    const respuesta = await generador.generarRespuesta({
      consulta: 'c',
      contactoNuevo: false,
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
      contactoNuevo: false,
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
      contactoNuevo: false,
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
      modelo: 'simulado',
    });
  });

  it('conocimiento y memorias vacíos (VINCULADO) → derivación exacta, enScope false, score 0.1, ayuda humana', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: '¿Venden seguros de vida?',
      contactoNuevo: false,
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
      modelo: 'simulado',
    });
  });

  it('contactoNuevo sin recall → saludo cálido pidiendo nombre/empresa, score 0.7, enScope, SIN escalado (E2·T9)', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: 'Hola',
      contactoNuevo: true,
      historial: [],
      conocimiento: [],
      memorias: [],
    });

    expect(respuesta.scoreConfianza).toBe(0.7);
    expect(respuesta.enScope).toBe(true);
    expect(respuesta.requiereAyudaHumana).toBe(false);
    expect(respuesta.idsConocimiento).toEqual([]);
    expect(respuesta.modelo).toBe('simulado');
    // El saludo pide nombre y empresa de forma natural (no un interrogatorio).
    expect(respuesta.texto.toLowerCase()).toContain('nombre');
    expect(respuesta.texto.toLowerCase()).toContain('empresa');
  });

  it('contactoNuevo CON conocimiento → responde el conocimiento igual (la rama de saludo es solo sin recall)', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: '¿Qué incluye el examen?',
      contactoNuevo: true,
      historial: [],
      conocimiento: CONOCIMIENTO,
      memorias: [],
    });

    expect(respuesta.texto).toBe('Incluye examen médico, audiometría y espirometría.');
    expect(respuesta.idsConocimiento).toEqual([7]);
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

describe('GeneradorSimulado — extraerIdentificacion (E2·T9)', () => {
  it('siempre null (documentado): la identificación se ejercita solo en el adapter real', async () => {
    const generador = new GeneradorSimulado();

    // Sin entrada: el simulador es un no-op documentado (nunca fabrica
    // nombre/empresa declarados) — la firma del port lo tolera.
    const identificacion = await generador.extraerIdentificacion();

    expect(identificacion).toBeNull();
  });
});

describe('GeneradorSimulado — indicación humana (E3·T2)', () => {
  it('indicación → rama determinista: el texto referencia la indicación, enScope, sin ayuda humana (aunque haya conocimiento)', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: '¿Hacen exámenes los sábados?',
      contactoNuevo: false,
      historial: [],
      conocimiento: CONOCIMIENTO,
      memorias: [],
      indicacionHumana: 'Decile que sí, los sábados de 8 a 12.',
    });

    expect(respuesta).toEqual({
      texto: '(simulado) Conforme a la indicación de nuestro equipo: Decile que sí, los sábados de 8 a 12.',
      scoreConfianza: 0.8,
      enScope: true,
      requiereAyudaHumana: false,
      idsConocimiento: [],
      modelo: 'simulado',
    });
  });

  it('indicación larga → recorte determinista a 200 caracteres', async () => {
    const generador = new GeneradorSimulado();
    const indicacion = `Coordiná el examen. ${'x'.repeat(250)}`;

    const respuesta = await generador.generarRespuesta({
      consulta: 'c',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
      indicacionHumana: indicacion,
    });

    const esperado = `(simulado) Conforme a la indicación de nuestro equipo: ${indicacion.slice(0, 200)}`;
    expect(respuesta.texto).toBe(esperado);
    expect(respuesta.texto.length).toBeLessThan(300);
  });

  it('indicación en blanco → cae a las ramas normales (escalado sin recall, saludo si contactoNuevo)', async () => {
    const generador = new GeneradorSimulado();

    const vinculada = await generador.generarRespuesta({
      consulta: 'c',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
      indicacionHumana: '   ',
    });
    expect(vinculada.requiereAyudaHumana).toBe(true);

    const nueva = await generador.generarRespuesta({
      consulta: 'Hola',
      contactoNuevo: true,
      historial: [],
      conocimiento: [],
      memorias: [],
      indicacionHumana: '',
    });
    expect(nueva.texto.toLowerCase()).toContain('nombre');
  });
});
