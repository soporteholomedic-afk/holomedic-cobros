import { describe, expect, it } from 'vitest';
import { empresa } from './crmFixtures';
import {
  estadoProximaAccion,
  etiquetaDeTarjeta,
  faltaRuc,
  sugerenciaVisible,
  textoSugerencia,
} from '../etiquetas';

const AHORA = new Date('2026-10-31T16:00:00.000Z');
const HOY = '2026-10-31';

describe('etiquetaDeTarjeta', () => {
  it('shows "Conversamos" in Contactado without attempts or pending reply', () => {
    expect(etiquetaDeTarjeta(empresa({ etapa: 'contactado', medio: 'llamada' }), AHORA)).toEqual({
      tipo: 'conversamos',
      texto: 'Conversamos',
    });
  });

  it('shows "Sin respuesta · N" in Contactado after failed attempts', () => {
    const e = empresa({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 2 });
    expect(etiquetaDeTarjeta(e, AHORA)).toEqual({ tipo: 'sin_respuesta', texto: 'Sin respuesta · 2' });
  });

  it('shows "Falta responder · hace X" while an inbound contact waits, before the attempts', () => {
    const e = empresa({
      etapa: 'contactado',
      medio: 'correo',
      intentosSinRespuesta: 1,
      faltaResponderDesde: '2026-10-31T13:00:00.000Z',
    });
    expect(etiquetaDeTarjeta(e, AHORA)).toEqual({ tipo: 'falta_responder', texto: 'Falta responder · hace 3 h' });
  });

  it('keeps "Falta responder" in later columns except Perdido', () => {
    const espera = { faltaResponderDesde: '2026-10-31T15:00:00.000Z', medio: 'correo' as const };
    expect(etiquetaDeTarjeta(empresa({ etapa: 'en_seguimiento', ...espera }), AHORA)?.texto).toBe(
      'Falta responder · hace 1 h',
    );
    expect(etiquetaDeTarjeta(empresa({ etapa: 'cliente', ...espera }), AHORA)?.tipo).toBe('falta_responder');
    expect(etiquetaDeTarjeta(empresa({ etapa: 'perdido', ...espera }), AHORA)).toBeNull();
  });

  it('counts failed attempts outside Contactado with the plain counter', () => {
    expect(etiquetaDeTarjeta(empresa({ etapa: 'en_seguimiento', intentosSinRespuesta: 1 }), AHORA)).toEqual({
      tipo: 'intentos',
      texto: '1 intento sin respuesta',
    });
    expect(etiquetaDeTarjeta(empresa({ etapa: 'por_contactar', intentosSinRespuesta: 2 }), AHORA)?.texto).toBe(
      '2 intentos sin respuesta',
    );
    expect(etiquetaDeTarjeta(empresa({ etapa: 'cliente', intentosSinRespuesta: 2 }), AHORA)).toBeNull();
  });

  it('shows nothing for a plain card outside Contactado', () => {
    expect(etiquetaDeTarjeta(empresa(), AHORA)).toBeNull();
    expect(etiquetaDeTarjeta(empresa({ etapa: 'en_seguimiento' }), AHORA)).toBeNull();
  });
});

describe('sugerencia de Perdido', () => {
  it('appears from 3 failed attempts in the open columns', () => {
    expect(sugerenciaVisible(empresa({ etapa: 'contactado', intentosSinRespuesta: 2 }))).toBe(false);
    expect(sugerenciaVisible(empresa({ etapa: 'contactado', intentosSinRespuesta: 3 }))).toBe(true);
    expect(sugerenciaVisible(empresa({ etapa: 'en_seguimiento', intentosSinRespuesta: 4 }))).toBe(true);
    expect(sugerenciaVisible(empresa({ etapa: 'cliente', intentosSinRespuesta: 3 }))).toBe(false);
    expect(sugerenciaVisible(empresa({ etapa: 'perdido', intentosSinRespuesta: 3 }))).toBe(false);
  });

  it('hides after "Seguir intentando" until one more failed attempt', () => {
    const e = { etapa: 'contactado' as const, sugerenciaDescartadaEn: 3 };
    expect(sugerenciaVisible(empresa({ ...e, intentosSinRespuesta: 3 }))).toBe(false);
    expect(sugerenciaVisible(empresa({ ...e, intentosSinRespuesta: 4 }))).toBe(true);
  });

  it('uses the prototype wording', () => {
    expect(textoSugerencia(empresa({ intentosSinRespuesta: 3 }))).toBe(
      '3 intentos sin respuesta. ¿Pasar a Perdido con el motivo «No contestan»?',
    );
  });
});

describe('estadoProximaAccion', () => {
  const accion = (fecha: string) => ({ tipo: 'llamar' as const, detalle: null, fecha });

  it('classifies the next action against today', () => {
    expect(estadoProximaAccion(empresa(), HOY)).toBe('ninguna');
    expect(estadoProximaAccion(empresa({ proximaAccion: accion('2026-10-30') }), HOY)).toBe('vencida');
    expect(estadoProximaAccion(empresa({ proximaAccion: accion('2026-10-31') }), HOY)).toBe('hoy');
    expect(estadoProximaAccion(empresa({ proximaAccion: accion('2026-11-02') }), HOY)).toBe('futura');
  });

  it('ignores the next action of Cliente and Perdido cards', () => {
    expect(estadoProximaAccion(empresa({ etapa: 'cliente', proximaAccion: accion('2026-10-30') }), HOY)).toBe(
      'ninguna',
    );
  });
});

describe('faltaRuc', () => {
  it('is true only without a RUC', () => {
    expect(faltaRuc(empresa({ ruc: null }))).toBe(true);
    expect(faltaRuc(empresa())).toBe(false);
  });
});
