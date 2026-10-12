import { describe, expect, it } from 'vitest';

import { sugerirEtiquetas } from '../sugerirEtiquetas';

/**
 * Contrato puro del sugeridor de etiquetas (agente-ia-crm E4·T7):
 * sobre el texto de UN chunk, top 4 de términos frecuentes usando el
 * normalizador compartido (recuperarConocimiento.normalizarTerminos:
 * minúsculas + sin diacríticos + stopwords ES fuera) filtrando
 * longitud > 3, y SIEMPRE agrega 'subido' al final (sin duplicar).
 * Determinista: misma entrada → mismas etiquetas, en el mismo orden.
 */

describe('sugerirEtiquetas', () => {
  it('elige los términos más frecuentes (>3 chars) y siempre agrega "subido" al final', () => {
    const texto = [
      'certificados certificados certificados certificados',
      'ocupacional ocupacional ocupacional',
      'examenes examenes',
      'salud',
      'certificados',
    ].join(' ');
    const etiquetas = sugerirEtiquetas(texto);
    expect(etiquetas).toEqual(['certificados', 'ocupacional', 'examenes', 'salud', 'subido']);
  });

  it('descarta stopwords y términos de ≤3 chars (normalizador compartido)', () => {
    // 'para', 'con', 'que' son stopwords; 'sol', 'red' miden ≤3.
    const texto = 'para con que sol sol sol red red certificado';
    const etiquetas = sugerirEtiquetas(texto);
    expect(etiquetas).toEqual(['certificado', 'subido']);
  });

  it('normaliza diacríticos y mayúsculas como el resto del RAG', () => {
    const etiquetas = sugerirEtiquetas('MÉDICOS Médicos medicos CERTIFICADOS certificados');
    expect(etiquetas).toContain('medicos');
    expect(etiquetas).toContain('certificados');
    expect(etiquetas).not.toContain('médicos');
  });

  it('texto sin términos útiles → solo "subido"', () => {
    expect(sugerirEtiquetas('')).toEqual(['subido']);
    expect(sugerirEtiquetas('de la que sol')).toEqual(['subido']);
  });

  it('"subido" no se duplica si ya salió del conteo', () => {
    const etiquetas = sugerirEtiquetas('subido subido subido resultados');
    expect(etiquetas.filter((e) => e === 'subido')).toHaveLength(1);
  });

  it('respeta el tope de 4 términos frecuentes + "subido"', () => {
    const largo = [
      'anestesia anestesia anestesia',
      'laboratorio laboratorio laboratorio',
      'audiometria audiometria audiometria',
      'radiografia radiografia radiografia',
      'oftalmologia oftalmologia oftalmologia',
      'psicologia psicologia psicologia',
    ].join(' ');
    const etiquetas = sugerirEtiquetas(largo);
    expect(etiquetas).toHaveLength(5);
    expect(etiquetas[5 - 1]).toBe('subido');
  });

  it('es determinista (frecuencia DESC, desempate alfabético)', () => {
    const texto = 'espirometria espirometria vision vision audiometria';
    expect(sugerirEtiquetas(texto)).toEqual(sugerirEtiquetas(texto));
    expect(sugerirEtiquetas(texto)).toEqual(['espirometria', 'vision', 'audiometria', 'subido']);
  });
});
