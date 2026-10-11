import { describe, expect, it } from 'vitest';

import type { MensajeHistorialGeneracion, ObservacionMemoria } from '../../domain/entities';
import { sintetizarHilo } from '../sintetizarHilo';

/**
 * Contrato de la síntesis del hilo (agente-ia-crm E4·T3): bloque
 * compacto en español con el conteo de intercambios, los temas
 * tratados (títulos de las memorias de chat, viejo→nuevo) y el último
 * pedido del cliente (una línea, ≤ 200 caracteres), con toco global
 * de ~700 caracteres. Sin nada que decir devuelve ''.
 */

const AHORA = new Date(2026, 5, 15, 10, 30, 0);
const DIA_MS = 24 * 60 * 60 * 1000;

function mensaje(emisor: MensajeHistorialGeneracion['emisor'], texto: string): MensajeHistorialGeneracion {
  return { emisor, texto };
}

function memoria(sobres: Partial<ObservacionMemoria> = {}): ObservacionMemoria {
  return {
    id: 1,
    nivel: 'chat',
    tipo: 'hecho_cliente',
    titulo: 'Tema',
    contenido: 'Contenido del tema.',
    creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS),
    ...sobres,
  };
}

describe('sintetizarHilo (E4·T3)', () => {
  it('cuenta intercambios: cliente vs la Guía (IA u HUMANO cuentan como lado Guía)', () => {
    const sintesis = sintetizarHilo({
      historial: [
        mensaje('CLIENTE', 'Buenas, quiero coordinar un examen'),
        mensaje('IA', 'Hola! Con gusto, ¿para cuántas personas?'),
        mensaje('CLIENTE', 'Para 12 trabajadores'),
      ],
      memoriasChat: [],
    });
    expect(sintesis).toBe(
      'Intercambios: 2 del cliente, 1 de la Guía.\nÚltimo pedido del cliente: Para 12 trabajadores',
    );
  });

  it('temas tratados: títulos de memorias chat ordenados viejo→nuevo por creadoEn, unidos con "; "', () => {
    const sintesis = sintetizarHilo({
      historial: [mensaje('CLIENTE', '¿Cuánto sale?')],
      memoriasChat: [
        memoria({ id: 2, titulo: 'Tema nuevo', creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS) }),
        memoria({ id: 1, titulo: 'Tema viejo', creadoEn: new Date(AHORA.getTime() - 5 * DIA_MS) }),
      ],
    });
    expect(sintesis).toContain('Temas tratados: Tema viejo; Tema nuevo.');
  });

  it('temas con creadoEn inválido: se conservan en el orden dado (sin reordenar)', () => {
    const sintesis = sintetizarHilo({
      historial: [],
      memoriasChat: [
        memoria({ id: 1, titulo: 'Primero', creadoEn: new Date(Number.NaN) }),
        memoria({ id: 2, titulo: 'Segundo', creadoEn: new Date(0) }),
      ],
    });
    expect(sintesis).toBe('Temas tratados: Primero; Segundo.');
  });

  it('último pedido: toma el ÚLTIMO mensaje del cliente, colapsado a una sola línea', () => {
    const sintesis = sintetizarHilo({
      historial: [
        mensaje('CLIENTE', 'Primer pedido\ncon salto de línea'),
        mensaje('IA', 'Respuesta'),
        mensaje('CLIENTE', 'Segundo pedido\ncon  salto y  espacios'),
      ],
      memoriasChat: [],
    });
    expect(sintesis).toContain('Último pedido del cliente: Segundo pedido con salto y espacios');
  });

  it('último pedido: se trunca a 200 caracteres', () => {
    const largo = 'x'.repeat(300);
    const sintesis = sintetizarHilo({
      historial: [mensaje('CLIENTE', largo)],
      memoriasChat: [],
    });
    const linea = sintesis.split('\n').find((l) => l.startsWith('Último pedido')) ?? '';
    expect(linea).toBe(`Último pedido del cliente: ${'x'.repeat(200)}`);
  });

  it('hilo vacío y sin memorias chat → cadena vacía', () => {
    expect(sintetizarHilo({ historial: [], memoriasChat: [] })).toBe('');
  });

  it('memoria desactivada (sin memorias chat): solo conteos y último pedido, sin "Temas tratados"', () => {
    const sintesis = sintetizarHilo({
      historial: [mensaje('CLIENTE', '¿Qué incluye el examen?')],
      memoriasChat: [],
    });
    expect(sintesis).toBe(
      'Intercambios: 1 del cliente, 0 de la Guía.\nÚltimo pedido del cliente: ¿Qué incluye el examen?',
    );
    expect(sintesis).not.toContain('Temas tratados');
  });

  it('sin mensajes del cliente no hay línea de último pedido', () => {
    const sintesis = sintetizarHilo({
      historial: [mensaje('IA', 'Te escribo para coordinar')],
      memoriasChat: [],
    });
    expect(sintesis).toBe('Intercambios: 0 del cliente, 1 de la Guía.');
  });

  it('toco global ~700 caracteres: el resultado nunca lo supera y conserva líneas completas cuando puede', () => {
    const titulosLargos = [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
      memoria({ id, titulo: `Tema ${id} ${'detalle '.repeat(10)}`.trim() }),
    );
    const sintesis = sintetizarHilo({
      historial: [mensaje('CLIENTE', 'Consulta larga '.repeat(20))],
      memoriasChat: titulosLargos,
    });
    expect(sintesis.length).toBeLessThanOrEqual(700);
    expect(sintesis.startsWith('Intercambios: 1 del cliente, 0 de la Guía.\n')).toBe(true);
  });
});
