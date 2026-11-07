import { describe, expect, it } from 'vitest';

import type { ICrmEmpresaRepository } from '../../domain/ports';
import { DatosEmpresaInvalidosError } from '../../domain/errors';
import {
  hoyEnLima,
  validarDatosEmpresa,
  validarDireccion,
  validarMedio,
  validarMedioContacto,
  validarOrigen,
  validarProximaAccion,
  validarResumen,
} from '../validar';

const mensaje = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(DatosEmpresaInvalidosError);
    return (e as Error).message;
  }
  throw new Error('did not throw');
};

describe('hoyEnLima', () => {
  it('uses the America/Lima calendar day, not UTC', () => {
    // 02:30 UTC on the 1st is still the 31st at 21:30 in Lima (UTC-5).
    expect(hoyEnLima(new Date('2026-11-01T02:30:00.000Z'))).toBe('2026-10-31');
    expect(hoyEnLima(new Date('2026-11-01T05:00:00.000Z'))).toBe('2026-11-01');
    expect(hoyEnLima(new Date('2026-12-31T23:59:00.000Z'))).toBe('2026-12-31');
  });
  it('defaults to now and returns YYYY-MM-DD', () => {
    expect(hoyEnLima()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('validarMedio (stage moves) rejects "otro": it cannot carry the free text', () => {
  it('accepts the three media and rejects otro and unknowns with the same message', () => {
    expect(validarMedio('llamada')).toBe('llamada');
    for (const malo of ['otro', 'paloma', 3, null]) {
      expect(mensaje(() => validarMedio(malo))).toBe('Elige el medio de contacto: llamada, correo o WhatsApp');
    }
  });
});

describe('validarMedioContacto', () => {
  it('requires "¿Cuál?" for otro and drops it for the other media', () => {
    expect(validarMedioContacto('otro', ' Feria ')).toEqual({ medio: 'otro', medioOtro: 'Feria' });
    expect(validarMedioContacto('correo', 'ignorado')).toEqual({ medio: 'correo', medioOtro: null });
    expect(mensaje(() => validarMedioContacto('otro', undefined))).toBe('Escribe cuál fue el medio.');
    expect(mensaje(() => validarMedioContacto('otro', '  '))).toBe('Escribe cuál fue el medio.');
    expect(mensaje(() => validarMedioContacto('otro', 'x'.repeat(41)))).toBe('El medio admite hasta 40 caracteres.');
    expect(validarMedioContacto('otro', 'x'.repeat(40)).medioOtro).toHaveLength(40);
  });
});

describe('validarProximaAccion', () => {
  const HOY = '2026-10-31';
  const req = { requerida: true, hoy: HOY };

  it('is required unless allowed to be empty; empty means null', () => {
    expect(mensaje(() => validarProximaAccion(null, req))).toBe('Elige la próxima acción.');
    expect(mensaje(() => validarProximaAccion(undefined, req))).toBe('Elige la próxima acción.');
    expect(validarProximaAccion(null, { requerida: false, hoy: HOY })).toBeNull();
    expect(validarProximaAccion(undefined, { requerida: false, hoy: HOY })).toBeNull();
  });

  it('accepts every type, trims the detail and keeps null when empty', () => {
    expect(validarProximaAccion({ tipo: 'llamar', fecha: HOY }, req)).toEqual({ tipo: 'llamar', detalle: null, fecha: HOY });
    expect(validarProximaAccion({ tipo: 'reunion', detalle: '  Planta  ', fecha: '2026-12-01' }, req)).toEqual({
      tipo: 'reunion', detalle: 'Planta', fecha: '2026-12-01',
    });
  });

  it('rejects unknown types and non-objects', () => {
    for (const malo of [{ tipo: 'bailar', fecha: HOY }, { fecha: HOY }, 'llamar', 7]) {
      expect(mensaje(() => validarProximaAccion(malo, req))).toBe('Elige la próxima acción.');
    }
  });

  it('otro needs a detail', () => {
    expect(mensaje(() => validarProximaAccion({ tipo: 'otro', fecha: HOY }, req))).toBe('Escribe cuál es la próxima acción.');
    expect(validarProximaAccion({ tipo: 'otro', detalle: 'Visita', fecha: HOY }, req)?.detalle).toBe('Visita');
  });

  it('the date is a real YYYY-MM-DD day not before today', () => {
    for (const mala of ['', '2026-1-5', '31-10-2026', '2026-02-30', '2026-13-01', 20261031, undefined]) {
      expect(mensaje(() => validarProximaAccion({ tipo: 'llamar', fecha: mala }, req))).toBe('Elige la fecha de la próxima acción.');
    }
    expect(mensaje(() => validarProximaAccion({ tipo: 'llamar', fecha: '2026-10-30' }, req))).toBe('La fecha de la próxima acción no puede ser pasada.');
    expect(validarProximaAccion({ tipo: 'llamar', fecha: '2026-10-31' }, req)?.fecha).toBe('2026-10-31');
  });

  it('the detail has at most 80 characters', () => {
    expect(mensaje(() => validarProximaAccion({ tipo: 'llamar', detalle: 'x'.repeat(81), fecha: HOY }, req))).toBe(
      'El detalle de la próxima acción admite hasta 80 caracteres.',
    );
  });
});

describe('validarResumen', () => {
  it('is required when asked, trimmed, and limited to 1000 characters', () => {
    expect(mensaje(() => validarResumen('  ', true))).toBe('Escribe un resumen de la conversación.');
    expect(mensaje(() => validarResumen(undefined, true))).toBe('Escribe un resumen de la conversación.');
    expect(validarResumen('  hola ', true)).toBe('hola');
    expect(validarResumen('', false)).toBeNull();
    expect(validarResumen(null, false)).toBeNull();
    expect(mensaje(() => validarResumen('x'.repeat(1001), false))).toBe('El resumen admite hasta 1000 caracteres.');
    expect(validarResumen('x'.repeat(1000), true)).toHaveLength(1000);
  });
});

describe('validarDireccion', () => {
  it('trims, keeps up to 300 characters, and turns empty into null', () => {
    expect(validarDireccion('  Av. Los Próceres 210, San Isidro  ')).toBe('Av. Los Próceres 210, San Isidro');
    expect(validarDireccion('x'.repeat(300))).toHaveLength(300);
    expect(validarDireccion('')).toBeNull();
    expect(validarDireccion('   ')).toBeNull();
    expect(validarDireccion(null)).toBeNull();
    expect(validarDireccion(undefined)).toBeNull();
  });

  it('rejects more than 300 characters', () => {
    expect(mensaje(() => validarDireccion('x'.repeat(301)))).toBe('La dirección admite hasta 300 caracteres.');
  });
});

describe('validarDatosEmpresa — direccion', () => {
  const BASE = {
    razonSocial: 'Andina',
    ruc: '20512345678',
    contactos: [{ nombre: 'Ana', telefono: '900111222' }],
  };
  const repoVacio = {
    findByRuc: async () => null,
    listSectores: async () => [],
  } as unknown as ICrmEmpresaRepository;

  it('flows the trimmed address through and defaults to null when absent', async () => {
    const con = await validarDatosEmpresa({ ...BASE, direccion: '  Av. Los Próceres 210  ' }, repoVacio);
    expect(con.direccion).toBe('Av. Los Próceres 210');
    const sin = await validarDatosEmpresa(BASE, repoVacio);
    expect(sin.direccion).toBeNull();
  });

  it('rejects a 301-character address', async () => {
    await expect(
      validarDatosEmpresa({ ...BASE, direccion: 'x'.repeat(301) }, repoVacio),
    ).rejects.toThrow('La dirección admite hasta 300 caracteres.');
  });
});

describe('validarOrigen', () => {
  it('accepts the four origins or nothing', () => {
    expect(validarOrigen('referido')).toBe('referido');
    expect(validarOrigen(null)).toBeNull();
    expect(validarOrigen(undefined)).toBeNull();
    expect(validarOrigen('')).toBeNull();
    expect(mensaje(() => validarOrigen('zzz'))).toBe('Elige cómo nos conoció.');
    expect(mensaje(() => validarOrigen(4))).toBe('Elige cómo nos conoció.');
  });
});
