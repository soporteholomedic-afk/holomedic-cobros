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
 * intact. Destilación e identificación remain v1 VERBATIM (their v2
 * rewrite is a later task): this module only relocates them.
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

describe('promptGeneracion — versiones (E4·T1)', () => {
  it('generación firma v2; destilación e identificación siguen en v1', () => {
    expect(PROMPT_VERSION).toBe('v2');
    expect(PROMPT_VERSION_DESTILACION).toBe('v1');
    expect(PROMPT_VERSION_IDENTIFICACION).toBe('v1');
  });

  it('cada armado lleva su versión (generación v2, destilación/identificación v1)', () => {
    expect(armarPromptGeneracion(entrada()).version).toBe('v2');
    expect(armarPromptDestilacion({ consulta: 'c', respuesta: 'r' }).version).toBe('v1');
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

  it('destilación e identificación mantienen sus users CONSULTA/RESPUESTA verbatim (v1)', () => {
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

  it('destilación e identificación conservan el system v1 verbatim (la reescritura es otra tarea)', () => {
    const destilar = armarPromptDestilacion({ consulta: 'c', respuesta: 'r' });
    expect(destilar.system).toContain('Eres el distilador de La Guía');
    expect(destilar.system).toContain('ficha');
    expect(destilar.system).toContain('cargo');
    expect(destilar.system).toContain('trabajadores');
    expect(destilar.system).toContain('sedes');

    const identificar = armarPromptIdentificacion({ consulta: 'c', respuesta: 'r' });
    expect(identificar.system).toContain('Eres el extractor de identificación de La Guía');
    expect(identificar.system).toContain('{"nombre": string|null, "empresa": string|null}');
  });
});
