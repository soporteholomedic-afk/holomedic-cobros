import { describe, expect, it } from 'vitest';

import { limpiarCitasRespuesta } from '../limpiarCitasRespuesta';

describe('limpiarCitasRespuesta', () => {
  it('quita un marcador a mitad de frase junto con el espacio previo', () => {
    expect(
      limpiarCitasRespuesta('Ofrecemos salud ocupacional para empresas [id 47], por lo que aplica.'),
    ).toBe('Ofrecemos salud ocupacional para empresas, por lo que aplica.');
  });

  it('quita el marcador antes del punto', () => {
    expect(limpiarCitasRespuesta('Es según nuestras condiciones [id 245]. ¿Te gustaría agendar?')).toBe(
      'Es según nuestras condiciones. ¿Te gustaría agendar?',
    );
  });

  it('quita marcadores con varios ids separados por coma o punto y coma', () => {
    expect(limpiarCitasRespuesta('Incluye audiometría [id 47, 48] y más.')).toBe(
      'Incluye audiometría y más.',
    );
    expect(limpiarCitasRespuesta('Incluye audiometría [id 47;48] y más.')).toBe(
      'Incluye audiometría y más.',
    );
  });

  it('quita marcadores adyacentes', () => {
    expect(limpiarCitasRespuesta('Cuesta 1800 [id 47][id 48]. Gracias.')).toBe('Cuesta 1800. Gracias.');
  });

  it('es insensible a mayúsculas', () => {
    expect(limpiarCitasRespuesta('Cuesta 1800 [ID 3].')).toBe('Cuesta 1800.');
  });

  it('no toca otros textos entre corchetes', () => {
    expect(limpiarCitasRespuesta('Llama al [teléfono] o escribe [2] y [id] ya.')).toBe(
      'Llama al [teléfono] o escribe [2] y [id] ya.',
    );
  });

  it('devuelve idéntico el texto sin marcadores', () => {
    const texto = 'El examen incluye audiometría y espirometría.';
    expect(limpiarCitasRespuesta(texto)).toBe(texto);
  });

  it('si solo había marcadores devuelve el texto original', () => {
    expect(limpiarCitasRespuesta('[id 7]')).toBe('[id 7]');
    expect(limpiarCitasRespuesta(' [id 7] [id 8] ')).toBe(' [id 7] [id 8] ');
  });

  it('conserva los saltos de línea', () => {
    expect(limpiarCitasRespuesta('Primera línea [id 1]\nSegunda línea [id 2].\n\nTercera.')).toBe(
      'Primera línea\nSegunda línea.\n\nTercera.',
    );
  });
});
