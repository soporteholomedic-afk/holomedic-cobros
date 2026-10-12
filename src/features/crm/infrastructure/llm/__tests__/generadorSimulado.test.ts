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
      fidelidad: 0.9,
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
      fidelidad: 0.9,
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
      fidelidad: 0.3,
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
    expect(respuesta.fidelidad).toBe(0.9);
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

describe('GeneradorSimulado — fidelidad autoevaluada (E4·T5)', () => {
  it('ramas CON fuente (indicación/KB/memoria/saludo) → fidelidad 0.9 determinista', async () => {
    const generador = new GeneradorSimulado();

    const porIndicacion = await generador.generarRespuesta({
      consulta: 'c',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
      indicacionHumana: 'Respondé que sí',
    });
    const porKB = await generador.generarRespuesta({
      consulta: 'c',
      contactoNuevo: false,
      historial: [],
      conocimiento: CONOCIMIENTO,
      memorias: [],
    });
    const porMemoria = await generador.generarRespuesta({
      consulta: 'c',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [{ tipo: 'preferencia', titulo: 'Tarde', contenido: 'Prefiere la tarde.' }],
    });
    const porSaludo = await generador.generarRespuesta({
      consulta: 'Hola',
      contactoNuevo: true,
      historial: [],
      conocimiento: [],
      memorias: [],
    });

    expect(porIndicacion.fidelidad).toBe(0.9);
    expect(porKB.fidelidad).toBe(0.9);
    expect(porMemoria.fidelidad).toBe(0.9);
    expect(porSaludo.fidelidad).toBe(0.9);
    expect(porIndicacion.modelo).toBe('simulado');
  });

  it('rama de derivación (sin fuente) → fidelidad 0.3: la baja autoevaluada acompaña la escalación', async () => {
    const generador = new GeneradorSimulado();

    const respuesta = await generador.generarRespuesta({
      consulta: '¿Venden seguros?',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
    });

    expect(respuesta.enScope).toBe(false);
    expect(respuesta.requiereAyudaHumana).toBe(true);
    expect(respuesta.fidelidad).toBe(0.3);
  });
});

describe('GeneradorSimulado — destilar (E2·T3, disciplina v2 E4·T4)', () => {
  it('exactamente UNA observación hecho_cliente: título AUTOCONTENIDO con sujeto, ≤8 palabras, pinear false', async () => {
    const generador = new GeneradorSimulado();
    const consulta = 'uno dos tres cuatro cinco seis siete ocho nueve diez';

    const observaciones = await generador.destilar({ consulta, respuesta: 'respuesta simulada' });

    expect(observaciones).toEqual([
      {
        tipo: 'hecho_cliente',
        titulo: 'Cliente: uno dos tres cuatro cinco seis siete',
        contenido: consulta,
        pinear: false,
      },
    ]);
  });

  it('sujeto derivable de la consulta («soy Ana») → el título abre con el nombre, no con «Cliente»', async () => {
    const generador = new GeneradorSimulado();

    const observaciones = await generador.destilar({
      consulta: 'Hola, soy Ana de Constructora X, ¿me pasan precios?',
      respuesta: 'r',
    });

    expect(observaciones[0]?.titulo).toBe('Ana: Hola, soy Ana de Constructora X, ¿me');
    // Autocontención: el título se entiende sin leer el intercambio.
    expect(observaciones[0]?.titulo.startsWith('Ana: ')).toBe(true);
  });

  it('«me llamo» también deriva el sujeto; sin marca de nombre el sujeto es Cliente (determinista)', async () => {
    const generador = new GeneradorSimulado();

    const conMeLlamo = await generador.destilar({
      consulta: 'Buenas, me llamo Roa, somos 40 personas',
      respuesta: 'r',
    });
    expect(conMeLlamo[0]?.titulo.startsWith('Roa: ')).toBe(true);

    const sinMarca = await generador.destilar({
      consulta: 'Necesito un examen para el lunes',
      respuesta: 'r',
    });
    expect(sinMarca[0]?.titulo.startsWith('Cliente: ')).toBe(true);
  });

  it('disciplina de pineado: JAMÁS pina un hecho informativo, aunque el hilo hable de acuerdos', async () => {
    const generador = new GeneradorSimulado();

    const observaciones = await generador.destilar({
      consulta: 'Quedamos en el martes 10, ¿no? Mi rubro es minería',
      respuesta: 'Sí, quedó agendado para el martes 10.',
    });

    expect(observaciones[0]?.tipo).toBe('hecho_cliente');
    expect(observaciones[0]?.pinear).toBe(false);
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

describe('GeneradorSimulado — ficha de la destilación (E3·T4)', () => {
  it('trabajadores: «somos 250 trabajadores» → la cifra capturada como texto', async () => {
    const generador = new GeneradorSimulado();

    const resultado = await generador.destilar({
      consulta: 'Hola, somos 250 trabajadores de la constructora',
      respuesta: 'r',
    });

    expect(resultado.ficha?.trabajadores).toBe('250');
  });

  it('variantes de trabajadores: personas / empleados / gente', async () => {
    const generador = new GeneradorSimulado();

    for (const [texto, esperado] of [
      ['somos 80 personas en la planta', '80'],
      ['tenemos 12 empleados', '12'],
      ['la gente, unas 40 gente del area', '40'],
    ] as const) {
      const resultado = await generador.destilar({ consulta: texto, respuesta: 'r' });
      expect(resultado.ficha?.trabajadores, texto).toBe(esperado);
    }
  });

  it('sedes: «tenemos 3 sedes» → la cifra', async () => {
    const generador = new GeneradorSimulado();

    const resultado = await generador.destilar({
      consulta: 'Tenemos 3 sedes: Asunción, Encarnación y Ciudad del Este',
      respuesta: 'r',
    });

    expect(resultado.ficha?.sedes).toBe('3');
  });

  it('cargo: keyword en la consulta → la palabra matcheada, con su caja original', async () => {
    const generador = new GeneradorSimulado();

    const resultado = await generador.destilar({
      consulta: 'Buenas, soy el Dueño de la empresa',
      respuesta: 'r',
    });

    expect(resultado.ficha?.cargo).toBe('Dueño');
  });

  it('cargo: tolerante a acentos y mayúsculas (ENCARGADO / duena)', async () => {
    const generador = new GeneradorSimulado();

    const mayus = await generador.destilar({ consulta: 'SOY EL ENCARGADO DE COMPRAS', respuesta: 'r' });
    expect(mayus.ficha?.cargo).toBe('ENCARGADO');

    const sinTilde = await generador.destilar({ consulta: 'hola, soy la duena', respuesta: 'r' });
    expect(sinTilde.ficha?.cargo).toBe('duena');
  });

  it('el dato puede venir en la RESPUESTA del intercambio (texto completo)', async () => {
    const generador = new GeneradorSimulado();

    const resultado = await generador.destilar({
      consulta: 'una consulta',
      respuesta: 'Perfecto, gerente de compras.',
    });

    expect(resultado.ficha?.cargo).toBe('gerente');
  });

  it('sin datos de ficha → la propiedad ficha queda AUSENTE (no undefined suelto en el array)', async () => {
    const generador = new GeneradorSimulado();

    const resultado = await generador.destilar({
      consulta: '¿Qué incluye el examen ocupacional?',
      respuesta: 'Incluye examen médico.',
    });

    expect('ficha' in resultado).toBe(false);
    expect(resultado).toEqual([
      {
        tipo: 'hecho_cliente',
        titulo: 'Cliente: ¿Qué incluye el examen ocupacional?',
        contenido: '¿Qué incluye el examen ocupacional?',
        pinear: false,
      },
    ]);
  });

  it('con ficha: las observaciones siguen intactas (mismo contrato de antes)', async () => {
    const generador = new GeneradorSimulado();

    const resultado = await generador.destilar({
      consulta: 'Somos 120 trabajadores, ¿qué incluye el examen?',
      respuesta: 'r',
    });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.tipo).toBe('hecho_cliente');
    expect(resultado.ficha).toEqual({ trabajadores: '120' });
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
      fidelidad: 0.9,
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
