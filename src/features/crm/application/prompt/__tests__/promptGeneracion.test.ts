import { describe, expect, it } from 'vitest';

import type { EntradaGenerarRespuesta } from '../../../domain/entities';
import {
  PROMPT_VERSION,
  PROMPT_VERSION_DESTILACION,
  PROMPT_VERSION_IDENTIFICACION,
  armarPromptDestilacion,
  armarPromptGeneracion,
  armarPromptIdentificacion,
  mensajeUsuarioGenerar,
} from '../promptGeneracion';

/**
 * Contract for the E4·T1 modular generation prompt (prompt v2):
 * the application layer owns ALL prompt engineering — persona,
 * WhatsApp format, hard anti-invention rules — and appends the
 * CONDITIONAL blocks (indicación, contacto nuevo, KB hit/miss,
 * memoria hit/miss) only when applicable. The USER message keeps the
 * E2·T3 labeled-section contract VERBATIM (INDICACIÓN DEL OPERADOR →
 * CONSULTA → HISTORIAL → CONOCIMIENTO → MEMORIAS → CONTACTO NUEVO,
 * "[id N] titulo\ncontenido" formats, "(vacío)" for empty sections)
 * so the wire contract with the model and every existing test stays
 * intact. Destilación firma v2 desde E4·T4 (misma forma de salida JSON
 * con ficha, más la disciplina de autocontención/títulos/pineado/
 * sensibles/fidelidad); identificación remains v1 VERBATIM.
 */

function entrada(overrides: Partial<EntradaGenerarRespuesta> = {}): EntradaGenerarRespuesta {
  return {
    consulta: '¿Qué incluye el examen médico ocupacional?',
    contactoNuevo: false,
    historial: [{ emisor: 'CLIENTE', texto: 'Hola, buenas tardes' }],
    conocimiento: [
      {
        id: 7,
        titulo: 'Examen ocupacional',
        contenido: 'Incluye examen médico, audiometría y espirometría.',
      },
    ],
    memorias: [
      {
        tipo: 'preferencia',
        titulo: 'Prefiere la tarde',
        contenido: 'El cliente prefiere turnos de tarde.',
      },
    ],
    ...overrides,
  };
}

describe('promptGeneracion — versiones (E4·T1, destilación v2 E4·T4)', () => {
  it('generación firma v3 (E5·T8); destilación v2; identificación sigue en v1', () => {
    expect(PROMPT_VERSION).toBe('v3');
    expect(PROMPT_VERSION_DESTILACION).toBe('v2');
    expect(PROMPT_VERSION_IDENTIFICACION).toBe('v1');
  });

  it('cada armado lleva su versión (generación v3, destilación v2, identificación v1)', () => {
    expect(armarPromptGeneracion(entrada()).version).toBe('v3');
    expect(armarPromptDestilacion({ consulta: 'c', respuesta: 'r' }).version).toBe('v2');
    expect(armarPromptIdentificacion({ consulta: 'c', respuesta: 'r' }).version).toBe('v1');
  });
});

describe('promptGeneracion — system base SIEMPRE presente (E4·T1)', () => {
  it('persona Holomedic: La Guía, salud ocupacional, español cálido con voseo', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toContain('La Guía');
    expect(system).toContain('Holomedic');
    expect(system).toContain('salud ocupacional');
  });

  it('formato WhatsApp: corto, sin markdown ni tablas, bullets "-", máximo 1 emoji, ~600 caracteres', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toContain('WhatsApp');
    expect(system).toContain('markdown');
    expect(system).toContain('600');
    expect(system).toContain('emoji');
  });

  it('reglas duras anti-invención: solo fuentes, jamás inventar, derivar a asesor, datos sensibles', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toContain('JAMÁS');
    expect(system).toContain('precios, plazos, descuentos, disponibilidad');
    expect(system).toContain('datos médicos o laborales');
    expect(system).toContain('asesor');
    expect(system).toContain('salud, sueldos, documentos');
  });

  it('contrato de salida JSON estricto intacto (scoreConfianza/enScope/idsConocimiento)', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toMatch(/JSON/);
    expect(system).toContain('scoreConfianza');
    expect(system).toContain('enScope');
    expect(system).toContain('idsConocimiento');
  });

  it('contrato JSON pide fidelidad self-score (E4·T5): definición y forma exacta con el campo', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toContain('fidelidad es tu autoevaluación (entre 0 y 1)');
    expect(system).toContain('"fidelidad": number');
  });

  it('cláusula de saludos/cortesía y derivación SOLO de negocio (regresión E2·T9)', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toContain('Los saludos, agradecimientos y cortesía general SIEMPRE se responden');
    expect(system).toContain('solo derivás a un humano las consultas de NEGOCIO que no puedas responder');
  });
});

describe('promptGeneracion — bloques condicionales del system (E4·T1)', () => {
  it('indicación humana activa → bloque PRIORIDAD MÁXIMA; ausente → sin bloque', () => {
    const con = armarPromptGeneracion(entrada({ indicacionHumana: 'Confirmale el viernes 9.' }));
    expect(con.system).toContain('PRIORIDAD MÁXIMA');

    const sin = armarPromptGeneracion(entrada());
    expect(sin.system).not.toContain('PRIORIDAD MÁXIMA');
  });

  it('indicación en blanco cuenta como AUSENTE (trim, igual que la sección del user)', () => {
    const { system } = armarPromptGeneracion(entrada({ indicacionHumana: '   ' }));
    expect(system).not.toContain('PRIORIDAD MÁXIMA');
  });

  it('contactoNuevo true → bloque presentación inicial; false → sin bloque', () => {
    const con = armarPromptGeneracion(entrada({ contactoNuevo: true }));
    expect(con.system).toContain('PRESENTACIÓN INICIAL');

    const sin = armarPromptGeneracion(entrada({ contactoNuevo: false }));
    expect(sin.system).not.toContain('PRESENTACIÓN INICIAL');
  });

  it('CONOCIMIENTO con fragmentos → bloque de uso de [id N]; vacío → bloque fuera de cobertura', () => {
    const hit = armarPromptGeneracion(entrada());
    expect(hit.system).toContain('fragmentos [id N]');
    expect(hit.system).not.toContain('FUERA DE COBERTURA');

    const miss = armarPromptGeneracion(entrada({ conocimiento: [] }));
    expect(miss.system).toContain('FUERA DE COBERTURA');
    expect(miss.system).toContain('asesor humano');
    expect(miss.system).not.toContain('fragmentos [id N]');
  });

  it('MEMORIAS presentes → bloque contexto previo; vacías → bloque primera interacción', () => {
    const hit = armarPromptGeneracion(entrada());
    expect(hit.system).toContain('MEMORIA PREVIA');
    expect(hit.system).not.toContain('PRIMERA INTERACCIÓN');

    const miss = armarPromptGeneracion(entrada({ memorias: [] }));
    expect(miss.system).toContain('PRIMERA INTERACCIÓN');
    expect(miss.system).not.toContain('MEMORIA PREVIA');
  });
});

describe('promptGeneracion — mensaje de usuario (contrato E2·T3 intacto)', () => {
  it('orden de secciones: INDICACIÓN → CONSULTA → HISTORIAL → CONOCIMIENTO → MEMORIAS → CONTACTO NUEVO', () => {
    const user = mensajeUsuarioGenerar(
      entrada({
        contactoNuevo: true,
        indicacionHumana: 'Confirmale el examen del viernes a las 9.',
      }),
    );
    const pos = (marca: string): number => {
      const indice = user.indexOf(marca);
      expect(indice).toBeGreaterThanOrEqual(0);
      return indice;
    };
    expect(pos('INDICACIÓN DEL OPERADOR')).toBe(0);
    expect(pos('INDICACIÓN DEL OPERADOR')).toBeLessThan(pos('CONSULTA:'));
    expect(pos('CONSULTA:')).toBeLessThan(pos('HISTORIAL:'));
    expect(pos('HISTORIAL:')).toBeLessThan(pos('CONOCIMIENTO:'));
    expect(pos('CONOCIMIENTO:')).toBeLessThan(pos('MEMORIAS:'));
    expect(pos('MEMORIAS:')).toBeLessThan(pos('CONTACTO NUEVO:'));
  });

  it('formatos de fila intactos: [id N] titulo\\ncontenido, [tipo] titulo\\ncontenido, [emisor] texto', () => {
    const user = mensajeUsuarioGenerar(entrada());
    expect(user).toContain('[id 7] Examen ocupacional\nIncluye examen médico, audiometría y espirometría.');
    expect(user).toContain('[preferencia] Prefiere la tarde\nEl cliente prefiere turnos de tarde.');
    expect(user).toContain('[CLIENTE] Hola, buenas tardes');
  });

  it('secciones vacías renderizan "(vacío)" (contrato actual)', () => {
    const user = mensajeUsuarioGenerar(
      entrada({ historial: [], conocimiento: [], memorias: [] }),
    );
    expect(user).toContain('HISTORIAL:\n(vacío)');
    expect(user).toContain('CONOCIMIENTO:\n(vacío)');
    expect(user).toContain('MEMORIAS:\n(vacío)');
  });

  it('armarPromptGeneracion expone ese mismo user junto al system', () => {
    const dato = entrada({ indicacionHumana: 'Indicación.' });
    const armado = armarPromptGeneracion(dato);
    expect(armado.user).toBe(mensajeUsuarioGenerar(dato));
  });

  it('destilación e identificación mantienen sus users CONSULTA/RESPUESTA verbatim (contrato intacto)', () => {
    const destilar = armarPromptDestilacion({ consulta: '¿Hacemos el martes?', respuesta: 'Sí, agendado.' });
    expect(destilar.user).toContain('CONSULTA:\n¿Hacemos el martes?');
    expect(destilar.user).toContain('RESPUESTA:\nSí, agendado.');

    const identificar = armarPromptIdentificacion({
      consulta: 'Hola, soy Ana de Constructora X',
      respuesta: '¡Gracias Ana!',
    });
    expect(identificar.user).toContain('CONSULTA:\nHola, soy Ana de Constructora X');
    expect(identificar.user).toContain('RESPUESTA:\n¡Gracias Ana!');
  });

  it('sintesisHilo presente → sección SINTESIS DEL HILO entre CONSULTA y HISTORIAL (E4·T3)', () => {
    const user = mensajeUsuarioGenerar(
      entrada({
        sintesisHilo:
          'Intercambios: 2 del cliente, 2 de la Guía.\nTemas tratados: Turnos de tarde.',
      }),
    );
    expect(user).toContain(
      'SINTESIS DEL HILO:\nIntercambios: 2 del cliente, 2 de la Guía.\nTemas tratados: Turnos de tarde.',
    );
    const pos = (marca: string): number => {
      const indice = user.indexOf(marca);
      expect(indice).toBeGreaterThanOrEqual(0);
      return indice;
    };
    expect(pos('CONSULTA:')).toBeLessThan(pos('SINTESIS DEL HILO:'));
    expect(pos('SINTESIS DEL HILO:')).toBeLessThan(pos('HISTORIAL:'));
  });

  it('sintesisHilo ausente o en blanco → sección omitida por completo (sin "(vacío)")', () => {
    const ausente = mensajeUsuarioGenerar(entrada());
    expect(ausente).not.toContain('SINTESIS DEL HILO');
    // Sin sección intermedia, CONSULTA empalma directo con HISTORIAL.
    expect(ausente).toContain('ocupacional?\n\nHISTORIAL:');

    const enBlanco = mensajeUsuarioGenerar(entrada({ sintesisHilo: '   ' }));
    expect(enBlanco).not.toContain('SINTESIS DEL HILO');
  });

  it('identificación conserva su system v1 verbatim (la reescritura es otra tarea)', () => {
    const identificar = armarPromptIdentificacion({ consulta: 'c', respuesta: 'r' });
    expect(identificar.system).toContain('Eres el extractor de identificación de La Guía');
    expect(identificar.system).toContain('{"nombre": string|null, "empresa": string|null}');
  });
});

describe('promptGeneracion — destilación v2 (E4·T4)', () => {
  it('persona distilador y catálogo de hechos duraderos intactos (regresión v1)', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('Eres el distilador de La Guía');
    expect(system).toContain('datos del cliente, acuerdos, compromisos, preferencias u objeciones');
    expect(system).toContain('ignorá saludos y charla pasajera');
  });

  it('regresión: contrato JSON EXACTO con ficha, JSON estricto y caso vacío (misma forma que v1)', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('Respondé ÚNICAMENTE con JSON válido, sin texto adicional');
    expect(system).toContain(
      '{"observaciones": [{"tipo": "hecho_cliente"|"acuerdo"|"compromiso"|"preferencia"|"objecion", "titulo": string (máximo 60 caracteres),',
    );
    expect(system).toContain('"contenido": string (máximo 300 caracteres), "pinear": boolean}],');
    expect(system).toContain(
      '"ficha": {"cargo": string|null, "trabajadores": string|null, "sedes": string|null}}',
    );
    expect(system).toContain(
      'Si no hay nada duradero ni datos de ficha, respondé {"observaciones": [], "ficha": null}.',
    );
  });

  it('regresión: la ficha se pide en la MISMA llamada (cargo/trabajadores/sedes, nunca deducir)', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('la ficha del contacto SOLO si el cliente la declaró explícitamente');
    expect(system).toContain('Nunca los deduzcas, completes ni inventes');
  });

  it('autocontención: cada observación se entiende SIN la conversación, con sujeto y contexto', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('AUTOCONTENIDA');
    expect(system).toContain('SIN leer la conversación');
    expect(system).toContain('el sujeto (nombres de personas y empresas tal como aparecen');
    expect(system).toContain('"María Pérez de Acme confirma visita viernes 15"');
    expect(system).toContain('nunca "acepta la visita"');
  });

  it('títulos accionables: máximo 8 palabras, con sujeto y verbo, escaneables', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('ACCIONABLES');
    expect(system).toContain('máximo 8 palabras');
    expect(system).toContain('sujeto y verbo');
    expect(system).toContain('"María Pérez: visita viernes 15 confirmada"');
  });

  it('disciplina de pineado: SOLO obligaciones de una parte; jamás hechos informativos ni preferencias', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('pinear=true SOLO');
    expect(system).toContain('fechas, montos, confirmaciones de servicio');
    expect(system).toContain('JAMÁS pinees hechos informativos ni preferencias');
  });

  it('nada de datos sensibles en memoria: resultados médicos, documentos, sueldos NO se destilan', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('resultados médicos, documentos, sueldos');
    expect(system).toContain('NO los destiles');
  });

  it('fidelidad: montos y fechas se copian LITERAL del hilo, sin parafrasear', () => {
    const { system } = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(system).toContain('no parafrasees montos ni fechas');
    expect(system).toContain('copialos literal del hilo');
  });
});

describe('promptGeneracion — bloque CIERRE condicional (E5·T8)', () => {
  it('con cierresPosibles no vacío → bloque CIERRE que lista EXACTAMENTE los tipos permitidos', () => {
    const { system } = armarPromptGeneracion(entrada({ cierresPosibles: ['ACEPTACION', 'CONVERSION_CLIENTE'] }));
    expect(system).toContain('CIERRE');
    expect(system).toContain('senalCierre');
    expect(system).toContain('ACEPTACION');
    expect(system).toContain('CONVERSION_CLIENTE');
    expect(system).not.toContain('CONFIRMACION_PRESENTACION');
  });

  it('el bloque trae las reglas: nunca inferir de cortesía/dudas, null si hay duda, texto sin afirmar registro', () => {
    const { system } = armarPromptGeneracion(entrada({ cierresPosibles: ['CONFIRMACION_PRESENTACION'] }));
    expect(system).toContain('CONFIRMACION_PRESENTACION');
    expect(system).toContain('cortesía');
    expect(system).toContain('negociación de precio');
    expect(system).toContain('"capaz"');
    expect(system).toContain('"lo vemos"');
    expect(system).toContain('"después te aviso"');
    expect(system).toContain('senalCierre null');
    expect(system).toContain('fuera de la lista');
    expect(system).toContain('NO afirmes en el texto');
  });

  it('cierresPosibles vacío o ausente → SIN bloque CIERRE', () => {
    expect(armarPromptGeneracion(entrada({ cierresPosibles: [] })).system).not.toContain('CIERRE AUTÓNOMO');
    expect(armarPromptGeneracion(entrada()).system).not.toContain('CIERRE AUTÓNOMO');
    expect(armarPromptGeneracion(entrada({ cierresPosibles: ['ACEPTACION'] })).system).toContain('CIERRE AUTÓNOMO');
  });

  it('el contrato JSON menciona senalCierre y exige null sin el bloque CIERRE', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toContain('"senalCierre": null | {"tipo": string, "confianza": number}');
    expect(system).toContain('senalCierre debe ser null cuando no hay bloque CIERRE');
  });

  it('la redacción de JSON estricto no cambia', () => {
    const { system } = armarPromptGeneracion(entrada());
    expect(system).toContain('Respondé ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:');
  });
});
