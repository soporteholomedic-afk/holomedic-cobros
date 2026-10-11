import { afterAll, describe, expect, it } from 'vitest';

import { crearGeneradorRespuesta } from '../../../infrastructure/llm/crearGeneradorRespuesta';
import { GeneradorSimulado } from '../../../infrastructure/llm/generadorSimulado';
import { CASOS_GOLDEN, PROMPT_GOLDEN_VERSION } from '../goldenSet/casos';
import type { CasoGolden } from '../goldenSet/casos';
import {
  evaluarRespuestaGolden,
  resumenGolden,
  type ResultadoCasoGolden,
} from '../goldenSet/evaluarRespuestaGolden';
import { PROMPT_VERSION, armarPromptGeneracion } from '../promptGeneracion';

/**
 * Golden set del prompt (agente-ia-crm E4·T2): la vara de regresión
 * para cada iteración del prompt de generación. Tres capas en CI:
 * 1. cada caso del corpus arma su prompt v2 con EXACTAMENTE los
 *    bloques condicionales que su entrada exige (aserciones livianas;
 *    el contrato fino del builder vive en promptGeneracion.test.ts),
 * 2. la respuesta del generador SIMULADO (determinista) pasa el
 *    evaluador golden en TODOS los casos — fija el comportamiento del
 *    simulado Y el acuerdo simulado↔evaluador,
 * 3. reglas del evaluador una por una: cada respuesta "trampa"
 *    produce su id de violación (cobertura, no-invención con whitelist
 *    de cifras de las fuentes, formato WhatsApp, presencia).
 * El bloque "live" (opcional) corre los mismos casos contra el LLM
 * real vía crearGeneradorRespuesta SOLO con E4_GOLDEN_LIVE=1 AND
 * LLM_API_KEY: sin saldo (hoy, Z.ai) se saltea en silencio y CI verde.
 */

/** Entrada sin recall: el simulado deriva (escalación segura). */
const SIN_FUENTES: CasoGolden['entrada'] = {
  consulta: '¿Cuánto sale el estudio?',
  contactoNuevo: false,
  historial: [],
  conocimiento: [],
  memorias: [],
};

/** Caso sintético con fuentes que traen cifras (24, 120) para whitelist. */
function casoDePrueba(overrides: Partial<CasoGolden> = {}): CasoGolden {
  return {
    id: 'caso_prueba',
    nombre: 'Caso sintético de pruebas del evaluador',
    entrada: {
      consulta: '¿Qué incluye el examen?',
      contactoNuevo: false,
      historial: [],
      conocimiento: [
        {
          id: 1,
          titulo: 'Tiempos de entrega',
          contenido: 'Los resultados llegan en 24 horas y la factura se emite a los 120 días.',
        },
      ],
      memorias: [],
    },
    expectativa: { tipo: 'cita_kb', terminosClave: ['24 horas', 'factura'] },
    ...overrides,
  };
}

describe('goldenSet — corpus (E4·T2)', () => {
  it('la versión del corpus acompaña la v2 del prompt y los ids son únicos', () => {
    expect(PROMPT_GOLDEN_VERSION).toBe('v2');
    expect(PROMPT_VERSION).toBe('v2');
    expect(CASOS_GOLDEN.length).toBeGreaterThanOrEqual(12);
    expect(CASOS_GOLDEN.length).toBeLessThanOrEqual(15);
    const ids = new Set(CASOS_GOLDEN.map((caso) => caso.id));
    expect(ids.size).toBe(CASOS_GOLDEN.length);
  });

  it('cada tipo declara sus términos: clave en cita_kb/sigue_indicacion, prohibidos en escala_sin_dato', () => {
    for (const caso of CASOS_GOLDEN) {
      if (caso.expectativa.tipo === 'cita_kb' || caso.expectativa.tipo === 'sigue_indicacion') {
        expect(caso.expectativa.terminosClave?.length ?? 0).toBeGreaterThan(0);
      }
      if (caso.expectativa.tipo === 'escala_sin_dato') {
        expect(caso.expectativa.terminosProhibidos?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe('goldenSet — builder v2 por caso (E4·T2)', () => {
  it.each(CASOS_GOLDEN)(
    '$id arma el prompt con exactamente los bloques que su entrada exige',
    (caso) => {
      const armado = armarPromptGeneracion(caso.entrada);
      expect(armado.version).toBe(PROMPT_VERSION);

      const conIndicacion = (caso.entrada.indicacionHumana ?? '').trim() !== '';
      expect(armado.system.includes('PRIORIDAD MÁXIMA')).toBe(conIndicacion);
      expect(armado.system.includes('PRESENTACIÓN INICIAL')).toBe(caso.entrada.contactoNuevo);

      const hit = caso.entrada.conocimiento.length > 0;
      expect(armado.system.includes('fragmentos [id N]')).toBe(hit);
      expect(armado.system.includes('FUERA DE COBERTURA')).toBe(!hit);

      const conMemorias = caso.entrada.memorias.length > 0;
      expect(armado.system.includes('MEMORIA PREVIA')).toBe(conMemorias);
      expect(armado.system.includes('PRIMERA INTERACCIÓN')).toBe(!conMemorias);
    },
  );
});

describe('goldenSet — generadorSimulado × evaluador (regresión CI, E4·T2)', () => {
  const generador = new GeneradorSimulado();

  it.each(CASOS_GOLDEN)('$id pasa el evaluador golden con la respuesta simulada', async (caso) => {
    const respuesta = await generador.generarRespuesta(caso.entrada);
    expect(evaluarRespuestaGolden(caso, respuesta.texto)).toEqual({ pasa: true, violaciones: [] });
  });
});

describe('evaluarRespuestaGolden — cobertura (cita_kb / sigue_indicacion)', () => {
  it('cita_kb: respuesta con todos los términos pasa; insensible a mayúsculas y tildes', () => {
    const caso = casoDePrueba({
      expectativa: { tipo: 'cita_kb', terminosClave: ['24 horas', 'facturación'] },
    });
    const bien = evaluarRespuestaGolden(
      caso,
      'Su FACTURACIÓN viaja con el reporte; el estudio está listo en 24 HORAS.',
    );
    expect(bien).toEqual({ pasa: true, violaciones: [] });
  });

  it('cita_kb: un término clave ausente → violación termino_faltante con el término original', () => {
    const caso = casoDePrueba({
      expectativa: { tipo: 'cita_kb', terminosClave: ['24 horas', 'facturación'] },
    });
    const malo = evaluarRespuestaGolden(caso, 'Los resultados llegan en 24 horas.');
    expect(malo.pasa).toBe(false);
    expect(malo.violaciones).toEqual(['termino_faltante: facturación']);
  });

  it('sigue_indicacion: los términos clave de la propia indicación deben aparecer', () => {
    const caso = casoDePrueba({
      entrada: {
        ...SIN_FUENTES,
        consulta: '¿Me confirmás lo de la campaña?',
        indicacionHumana: 'Confirmale que la campaña va el viernes 15 a las 8:00, sin ayuno.',
      },
      expectativa: { tipo: 'sigue_indicacion', terminosClave: ['viernes 15', '8:00'] },
    });
    const bien = evaluarRespuestaGolden(caso, 'Confirmado: viernes 15 a las 8:00, sin ayuno.');
    expect(bien).toEqual({ pasa: true, violaciones: [] });

    const malo = evaluarRespuestaGolden(caso, 'Le confirmo la campaña recién el lunes.');
    expect(malo.pasa).toBe(false);
    expect(malo.violaciones).toEqual([
      'termino_faltante: viernes 15',
      'termino_faltante: 8:00',
    ]);
  });
});

describe('evaluarRespuestaGolden — no invención (escala_sin_dato)', () => {
  it('moneda fuera de las fuentes → dato_inventado + termino_prohibido', () => {
    const caso = casoDePrueba({
      entrada: SIN_FUENTES,
      expectativa: { tipo: 'escala_sin_dato', terminosProhibidos: ['$'] },
    });
    const veredicto = evaluarRespuestaGolden(caso, 'El examen le sale $ 150 por persona.');
    expect(veredicto.pasa).toBe(false);
    expect(veredicto.violaciones).toContain('dato_inventado: $ 150');
    expect(veredicto.violaciones).toContain('termino_prohibido: $');
  });

  it('plazo en días fuera de las fuentes → dato_inventado; un número sin unidad de dato no viola', () => {
    const caso = casoDePrueba({
      entrada: SIN_FUENTES,
      expectativa: { tipo: 'escala_sin_dato' },
    });
    const conPlazo = evaluarRespuestaGolden(caso, 'Le confirmo la fecha en 5 días hábiles.');
    expect(conPlazo.violaciones).toContain('dato_inventado: 5 días');

    const sinDato = evaluarRespuestaGolden(caso, 'Nos vemos el 15 en la oficina, ¿le va bien?');
    expect(sinDato).toEqual({ pasa: true, violaciones: [] });
  });

  it('whitelist: cifras presentes en conocimiento/memorias no cuentan como invención', () => {
    const caso = casoDePrueba({
      expectativa: { tipo: 'escala_sin_dato' },
    });
    const fiel = evaluarRespuestaGolden(
      caso,
      'Los resultados llegan en 24 horas y la factura se emite a los 120 días.',
    );
    expect(fiel).toEqual({ pasa: true, violaciones: [] });

    const inventado = evaluarRespuestaGolden(caso, 'Los resultados llegan en 48 horas.');
    expect(inventado.pasa).toBe(false);
    expect(inventado.violaciones).toEqual(['dato_inventado: 48 horas']);
  });
});

describe('evaluarRespuestaGolden — formato WhatsApp (E4·T2)', () => {
  const casoCortesia = casoDePrueba({
    entrada: SIN_FUENTES,
    expectativa: { tipo: 'cortesia' },
  });

  it.each([
    ['negrita markdown', 'El examen **incluye** audiometría.', 'formato_negrita'],
    ['encabezado markdown', '## Examen ocupacional', 'formato_encabezado'],
    ['code fence', '```\ncódigo\n```', 'formato_codigo'],
    ['tabla markdown', '| Estudio | Precio |\n|---|---|\n| Tox | — |', 'formato_tabla'],
    ['más de un emoji', '¡Listo! 👍🚀', 'formato_emoji_excesivo'],
  ])('%s → violación %s', (_nombre, respuesta, violacionEsperada) => {
    const veredicto = evaluarRespuestaGolden(casoCortesia, respuesta);
    expect(veredicto.pasa).toBe(false);
    expect(veredicto.violaciones).toContain(violacionEsperada);
  });

  it('un emoji está permitido y 600 caracteres exactos no violan el largo', () => {
    const conUnEmoji = evaluarRespuestaGolden(casoCortesia, '¡Qué gusto atenderle! 👍');
    expect(conUnEmoji).toEqual({ pasa: true, violaciones: [] });

    const alLimite = evaluarRespuestaGolden(casoCortesia, 'a'.repeat(600));
    expect(alLimite.pasa).toBe(true);

    const pasado = evaluarRespuestaGolden(casoCortesia, `${'a'.repeat(600)}!`);
    expect(pasado.pasa).toBe(false);
    expect(pasado.violaciones).toEqual(['largo_excesivo']);
  });
});

describe('evaluarRespuestaGolden — presencia (cortesía / presentación)', () => {
  const casoPresentacion = casoDePrueba({
    entrada: { ...SIN_FUENTES, contactoNuevo: true },
    expectativa: { tipo: 'presentacion_contacto_nuevo' },
  });

  it('respuesta vacía → respuesta_vacia; de 10 caracteres o menos → respuesta_corta', () => {
    const vacia = evaluarRespuestaGolden(casoPresentacion, '   ');
    expect(vacia.violaciones).toEqual(['respuesta_vacia']);

    const corta = evaluarRespuestaGolden(casoPresentacion, '¡Hola!');
    expect(corta.violaciones).toEqual(['respuesta_corta']);
  });

  it('una respuesta de más de 10 caracteres pasa el chequeo de presencia', () => {
    const bien = evaluarRespuestaGolden(
      casoPresentacion,
      '¡Hola! Soy La Guía, de Holomedic; ¿me contás tu nombre?',
    );
    expect(bien).toEqual({ pasa: true, violaciones: [] });
  });
});

describe('resumenGolden (E4·T2)', () => {
  it('arma la tabla con versión, conteo OK y el detalle de violaciones por caso', () => {
    const ok = casoDePrueba({ id: 'caso_ok' });
    const falla = casoDePrueba({ id: 'caso_falla' });
    const resumen = resumenGolden([
      { caso: ok, respuesta: 'texto ok', veredicto: { pasa: true, violaciones: [] } },
      {
        caso: falla,
        respuesta: 'texto que falla',
        veredicto: { pasa: false, violaciones: ['termino_faltante: factura'] },
      },
    ]);
    expect(resumen).toContain(`Golden set ${PROMPT_GOLDEN_VERSION}`);
    expect(resumen).toContain('1/2 casos OK');
    expect(resumen).toContain('caso_ok');
    expect(resumen).toContain('caso_falla');
    expect(resumen).toContain('termino_faltante: factura');
  });
});

describe.skipIf(!(process.env.E4_GOLDEN_LIVE === '1' && process.env.LLM_API_KEY))(
  'goldenSet — live contra el LLM real (opcional, E4·T2)',
  () => {
    const resultados: ResultadoCasoGolden[] = [];
    const generador = crearGeneradorRespuesta();

    afterAll(() => {
      console.info(`\n${resumenGolden(resultados)}\n`);
    });

    it.each(CASOS_GOLDEN)('$id pasa el evaluador golden contra el generador real', async (caso) => {
      const respuesta = await generador.generarRespuesta(caso.entrada);
      const veredicto = evaluarRespuestaGolden(caso, respuesta.texto);
      resultados.push({ caso, respuesta: respuesta.texto, veredicto });
      expect(veredicto).toEqual({ pasa: true, violaciones: [] });
    });
  },
);
