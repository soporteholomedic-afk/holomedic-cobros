import { describe, expect, it } from 'vitest';

import { crearConfigAgente, type ConfigAgente } from '../configAgente';

/**
 * Agent engine configuration contract (agente-ia-crm E2·T4):
 * every AGENTE_* env var is optional with a documented default, invalid
 * values fall back to the default (never crash the process on a typo),
 * AGENTE_HABILITADO parses a closed truthy set (kill-switch semantics —
 * anything not explicitly truthy DISABLES the agent) and the overnight
 * window (hasta < desde) is preserved verbatim for the use case to
 * interpret — the config never "corrects" it.
 */

const TEXTO_ESCALADO_DEFAULT =
  'Gracias por tu consulta. En breve se comunica con vos una persona del equipo de Holomedic.';

const CONFIG_DEFAULT: ConfigAgente = {
  habilitado: true,
  umbralConfianza: 0.6,
  maxIntercambios: 8,
  horarioDesde: 8,
  horarioHasta: 18,
  textoEscalado: TEXTO_ESCALADO_DEFAULT,
};

describe('crearConfigAgente — defaults (E2·T4)', () => {
  it('env vacío → todos los defaults', () => {
    expect(crearConfigAgente({})).toEqual(CONFIG_DEFAULT);
  });

  it('variables definidas pero vacías caen al default (unset-equivalent)', () => {
    expect(
      crearConfigAgente({
        AGENTE_HABILITADO: '',
        AGENTE_UMBRAL_CONF: '',
        AGENTE_MAX_INTERCAMBIOS: '',
        AGENTE_HORARIO_DESDE: '',
        AGENTE_HORARIO_HASTA: '',
        AGENTE_TEXTO_ESCALADO: '',
      }),
    ).toEqual(CONFIG_DEFAULT);
  });
});

describe('crearConfigAgente — overrides (E2·T4)', () => {
  it('todos los valores válidos se aplican', () => {
    expect(
      crearConfigAgente({
        AGENTE_HABILITADO: 'false',
        AGENTE_UMBRAL_CONF: '0.85',
        AGENTE_MAX_INTERCAMBIOS: '3',
        AGENTE_HORARIO_DESDE: '9',
        AGENTE_HORARIO_HASTA: '17',
        AGENTE_TEXTO_ESCALADO: 'Texto custom de derivación.',
      }),
    ).toEqual({
      habilitado: false,
      umbralConfianza: 0.85,
      maxIntercambios: 3,
      horarioDesde: 9,
      horarioHasta: 17,
      textoEscalado: 'Texto custom de derivación.',
    });
  });

  it('textoEscalado custom se usa verbatim (trim del parser, contenido intacto)', () => {
    const config = crearConfigAgente({ AGENTE_TEXTO_ESCALADO: ' Gracias! Un especialista te escribe. ' });
    expect(config.textoEscalado).toBe(' Gracias! Un especialista te escribe. ');
  });
});

describe('crearConfigAgente — valores inválidos caen al default (E2·T4)', () => {
  it('umbralConfianza: basura, 0 y negativos → default 0.60', () => {
    expect(crearConfigAgente({ AGENTE_UMBRAL_CONF: 'alto' }).umbralConfianza).toBe(0.6);
    expect(crearConfigAgente({ AGENTE_UMBRAL_CONF: '0' }).umbralConfianza).toBe(0.6);
    expect(crearConfigAgente({ AGENTE_UMBRAL_CONF: '-0.2' }).umbralConfianza).toBe(0.6);
  });

  it('umbralConfianza > 1 se acota a 1 (clamp (0,1])', () => {
    expect(crearConfigAgente({ AGENTE_UMBRAL_CONF: '1.7' }).umbralConfianza).toBe(1);
    expect(crearConfigAgente({ AGENTE_UMBRAL_CONF: '1' }).umbralConfianza).toBe(1);
  });

  it('maxIntercambios: basura, 0 y negativos → default 8 (>= 1 requerido)', () => {
    expect(crearConfigAgente({ AGENTE_MAX_INTERCAMBIOS: 'ocho' }).maxIntercambios).toBe(8);
    expect(crearConfigAgente({ AGENTE_MAX_INTERCAMBIOS: '0' }).maxIntercambios).toBe(8);
    expect(crearConfigAgente({ AGENTE_MAX_INTERCAMBIOS: '-3' }).maxIntercambios).toBe(8);
  });

  it('horarios fuera de 0-23 o basura → defaults 8/18', () => {
    expect(crearConfigAgente({ AGENTE_HORARIO_DESDE: '24' }).horarioDesde).toBe(8);
    expect(crearConfigAgente({ AGENTE_HORARIO_DESDE: '-1' }).horarioDesde).toBe(8);
    expect(crearConfigAgente({ AGENTE_HORARIO_DESDE: 'manana' }).horarioDesde).toBe(8);
    expect(crearConfigAgente({ AGENTE_HORARIO_HASTA: '24' }).horarioHasta).toBe(18);
    expect(crearConfigAgente({ AGENTE_HORARIO_HASTA: 'tarde' }).horarioHasta).toBe(18);
  });

  it('horarios decimales se redondean a entero dentro de 0-23', () => {
    expect(crearConfigAgente({ AGENTE_HORARIO_DESDE: '7.6' }).horarioDesde).toBe(8);
    expect(crearConfigAgente({ AGENTE_HORARIO_HASTA: '17.4' }).horarioHasta).toBe(17);
  });
});

describe('crearConfigAgente — AGENTE_HABILITADO (kill switch, E2·T4)', () => {
  it('acepta 1/true/si/yes en cualquier combinación de mayúsculas → true', () => {
    for (const valor of ['1', 'true', 'si', 'yes', 'TRUE', 'Yes', 'sI', '  1  ']) {
      expect(crearConfigAgente({ AGENTE_HABILITADO: valor }).habilitado).toBe(true);
    }
  });

  it('cualquier otro valor (0/false/no/basura) → false: fail-safe ante typo', () => {
    for (const valor of ['0', 'false', 'no', 'off', 'banana', ' ']) {
      expect(crearConfigAgente({ AGENTE_HABILITADO: valor }).habilitado).toBe(false);
    }
  });
});

describe('crearConfigAgente — ventana horaria (E2·T4)', () => {
  it('hasta < desde (ventana nocturna) se preserva verbatim — sin corrección', () => {
    const config = crearConfigAgente({ AGENTE_HORARIO_DESDE: '20', AGENTE_HORARIO_HASTA: '6' });
    expect(config.horarioDesde).toBe(20);
    expect(config.horarioHasta).toBe(6);
  });

  it('límites válidos del rango 0-23 se aceptan', () => {
    const config = crearConfigAgente({ AGENTE_HORARIO_DESDE: '0', AGENTE_HORARIO_HASTA: '23' });
    expect(config.horarioDesde).toBe(0);
    expect(config.horarioHasta).toBe(23);
  });
});
