import { describe, expect, it } from 'vitest';

import type { FilaImportCrm } from '../columnas';
import { validarImportacion } from '../validarImportacion';

/** Valid canonical row (all optional cells empty unless overridden). */
function fila(overrides: Partial<FilaImportCrm> = {}): FilaImportCrm {
  return {
    empresa: 'Constructora X',
    ruc: '900123456',
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: '',
    destinoComun: '',
    responsable: '',
    notas: '',
    encargado: 'Ana',
    correos: 'ana@x.com',
    telefono: '',
    principal: '',
    ...overrides,
  };
}

describe('validarImportacion — agrupamiento por RUC normalizado', () => {
  it('crea un grupo por RUC aunque el formato varíe entre filas (escenario "Grouping by RUC")', () => {
    const resultado = validarImportacion([
      fila({ ruc: ' 900-123456 ', encargado: 'Ana' }),
      fila({ ruc: '900123456', encargado: 'Luis' }),
      fila({ empresa: 'Obra Y', ruc: '20512345678', encargado: 'Marta' }),
    ]);

    expect(resultado.errores).toEqual([]);
    expect(resultado.grupos).toHaveLength(2);
    expect(resultado.grupos[0]).toMatchObject({
      ruc: '900123456',
      razonSocial: 'Constructora X',
      tipo: 'Cliente',
    });
    expect(resultado.grupos[0]!.contactos.map((c) => c.nombre)).toEqual(['Ana', 'Luis']);
    expect(resultado.grupos[1]).toMatchObject({ ruc: '20512345678', razonSocial: 'Obra Y' });
    expect(resultado.grupos[1]!.contactos).toHaveLength(1);
    expect(resultado.totalFilas).toBe(3);
    expect(resultado.filasValidas).toBe(3);
  });

  it('archivo sin filas → resultado vacío', () => {
    expect(validarImportacion([])).toEqual({
      grupos: [],
      errores: [],
      totalFilas: 0,
      filasValidas: 0,
    });
  });
});

describe('validarImportacion — validación por fila ({fila, columna, mensaje})', () => {
  it('reporta Encargado faltante y RUC malformado sin bloquear las filas válidas', () => {
    const resultado = validarImportacion([
      fila({ encargado: 'Ana' }),
      fila({ encargado: '   ' }),
      fila({ empresa: 'Obra Y', ruc: '12.345', encargado: 'Marta' }),
    ]);

    // Header en fila 1 → la primera fila de datos es la fila 2.
    expect(resultado.errores).toEqual([
      { fila: 3, columna: 'Encargado', mensaje: '"Encargado" es obligatorio' },
      {
        fila: 4,
        columna: 'RUC',
        mensaje: '"RUC" inválido: debe tener entre 8 y 11 dígitos (solo números)',
      },
    ]);
    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.grupos[0]!.contactos.map((c) => c.nombre)).toEqual(['Ana']);
    expect(resultado.totalFilas).toBe(3);
    expect(resultado.filasValidas).toBe(1);
  });

  it('Tipo inválido reporta los valores válidos y excluye solo esa fila', () => {
    const resultado = validarImportacion([
      fila({ empresa: 'Obra Y', ruc: '20512345678', tipo: 'Lead', encargado: 'Marta' }),
    ]);

    expect(resultado.errores).toEqual([
      { fila: 2, columna: 'Tipo', mensaje: '"Tipo" debe ser "Cliente" o "Prospecto"' },
    ]);
    expect(resultado.grupos).toEqual([]);
    expect(resultado.filasValidas).toBe(0);
    expect(resultado.totalFilas).toBe(1);
  });

  it('Origen inválido reporta los valores válidos', () => {
    const resultado = validarImportacion([fila({ origen: 'Email' })]);

    expect(resultado.errores).toEqual([
      { fila: 2, columna: 'Origen', mensaje: '"Origen" debe ser "Inbound" o "Outbound"' },
    ]);
    expect(resultado.filasValidas).toBe(0);
  });

  it('RUC con letras tras normalizar es malformado', () => {
    const resultado = validarImportacion([fila({ ruc: 'ABC-123' })]);

    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0]).toMatchObject({ fila: 2, columna: 'RUC' });
  });

  it('Correos vacíos tras separar por ";" reportan error', () => {
    const resultado = validarImportacion([fila({ correos: ' ;  ; ' })]);

    expect(resultado.errores).toEqual([
      {
        fila: 2,
        columna: 'Correos',
        mensaje: '"Correos" es obligatorio: indique al menos un correo (separe varios con ";")',
      },
    ]);
  });

  it('reporta todos los errores de una fila en orden de columna', () => {
    const resultado = validarImportacion([fila({ empresa: '', tipo: 'Lead' })]);

    expect(resultado.errores.map((e) => [e.fila, e.columna])).toEqual([
      [2, 'Empresa'],
      [2, 'Tipo'],
    ]);
  });

  it('valor de Principal distinto de "Sí" es inválido', () => {
    const resultado = validarImportacion([fila({ principal: 'No' })]);

    expect(resultado.errores).toEqual([
      {
        fila: 2,
        columna: 'Principal',
        mensaje: '"Principal" solo admite el valor "Sí" (vacío = sin marcar)',
      },
    ]);
  });
});

describe('validarImportacion — conflicto de campos de empresa repetidos', () => {
  it('filas 2 y 5 con mismo RUC y Tipo distinto: ambas en conflicto, grupo excluido, otros RUC intactos', () => {
    const resultado = validarImportacion([
      fila({ encargado: 'Ana' }), // fila 2 — RUC A, Cliente
      fila({ empresa: 'Obra Y', ruc: '20512345678', encargado: 'Marta' }), // fila 3 — RUC B
      fila({ empresa: 'Obra Y', ruc: '20512345678', encargado: 'Pedro' }), // fila 4 — RUC B
      fila({ tipo: 'Prospecto', encargado: 'Luis' }), // fila 5 — RUC A, Prospecto
    ]);

    expect(resultado.errores).toEqual([
      {
        fila: 2,
        columna: 'Tipo',
        mensaje: '"Tipo" tiene valores distintos para el mismo RUC ("Cliente" y "Prospecto")',
      },
      {
        fila: 5,
        columna: 'Tipo',
        mensaje: '"Tipo" tiene valores distintos para el mismo RUC ("Cliente" y "Prospecto")',
      },
    ]);
    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.grupos[0]).toMatchObject({ ruc: '20512345678', razonSocial: 'Obra Y' });
    expect(resultado.grupos[0]!.contactos.map((c) => c.nombre)).toEqual(['Marta', 'Pedro']);
    expect(resultado.totalFilas).toBe(4);
    expect(resultado.filasValidas).toBe(2);
  });

  it('la regla cubre cualquier campo de empresa (Notas distinto empata y excluye el grupo)', () => {
    const resultado = validarImportacion([
      fila({ encargado: 'Ana', notas: 'visita agendada' }),
      fila({ encargado: 'Luis', notas: '' }),
    ]);

    expect(resultado.errores).toHaveLength(2);
    expect(resultado.errores[0]).toMatchObject({ fila: 2, columna: 'Notas' });
    expect(resultado.errores[1]).toMatchObject({ fila: 3, columna: 'Notas' });
    expect(resultado.grupos).toEqual([]);
    expect(resultado.filasValidas).toBe(0);
  });

  it('con mayoría consistente solo la fila divergente se excluye y el grupo se importa', () => {
    const resultado = validarImportacion([
      fila({ encargado: 'Ana' }), // Cliente
      fila({ encargado: 'Luis' }), // Cliente
      fila({ tipo: 'Prospecto', encargado: 'Marta' }), // divergente
    ]);

    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0]).toMatchObject({ fila: 4, columna: 'Tipo' });
    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.grupos[0]).toMatchObject({ ruc: '900123456', tipo: 'Cliente' });
    expect(resultado.grupos[0]!.contactos.map((c) => c.nombre)).toEqual(['Ana', 'Luis']);
    expect(resultado.filasValidas).toBe(2);
  });
});

describe('validarImportacion — colapso in-file de contactos y principal', () => {
  it('mismo RUC + mismo encargado normalizado colapsan en un contacto uniendo correos', () => {
    const resultado = validarImportacion([
      fila({
        encargado: 'Ana  Pérez',
        correos: 'Ana@X.com; b@y.com',
        telefono: ' 987654321 ',
      }),
      fila({
        encargado: 'ana perez',
        correos: 'B@Y.COM; c@z.com',
        telefono: '',
      }),
    ]);

    expect(resultado.errores).toEqual([]);
    expect(resultado.grupos).toHaveLength(1);
    const contactos = resultado.grupos[0]!.contactos;
    expect(contactos).toHaveLength(1);
    expect(contactos[0]).toMatchObject({
      nombre: 'Ana Pérez',
      telefono: '987654321',
      correos: ['ana@x.com', 'b@y.com', 'c@z.com'],
      esPrincipal: true,
    });
    expect(resultado.filasValidas).toBe(2);
  });

  it('Principal: sin marcar queda el primero; con "Sí" el marcado desplaza el default', () => {
    const sinMarcar = validarImportacion([
      fila({ encargado: 'Ana' }),
      fila({ encargado: 'Luis' }),
    ]);
    expect(sinMarcar.grupos[0]!.contactos.map((c) => c.esPrincipal)).toEqual([true, false]);

    const conMarca = validarImportacion([
      fila({ encargado: 'Ana' }),
      fila({ encargado: 'Luis', principal: 'Sí' }),
    ]);
    expect(conMarca.grupos[0]!.contactos.map((c) => c.esPrincipal)).toEqual([false, true]);
  });

  it('los campos opcionales de empresa llegan recortados o null', () => {
    const resultado = validarImportacion([
      fila({
        origen: '',
        proyectoObra: '   ',
        destinoComun: ' Obra Central ',
        responsable: ' jperez ',
        notas: '',
      }),
    ]);

    expect(resultado.grupos[0]).toMatchObject({
      origen: null,
      proyectoObra: null,
      destinoComun: 'Obra Central',
      responsable: 'jperez',
      notas: null,
    });
  });
});
