import { describe, expect, it } from 'vitest';

import { normalizarNombre } from '../../normalizar';
import type { ContactoExistenteMerge } from '../mergeContactos';
import { planificarMergeContactos } from '../mergeContactos';
import type { ContactoImportado } from '../validarImportacion';

/**
 * Pure contract of the D1 contacto merge rule (design D1): a re-import
 * row whose NORMALIZED name matches an existing contacto of the SAME
 * empresa updates that contacto (teléfono overwritten if provided,
 * correos UNIONed, never removed); no name match → new contacto;
 * correo overlap WITHOUT name match is NOT a merge — a non-blocking
 * warning row is emitted and the contacto is still created. The
 * planner is scoped to ONE empresa's existing contactos: merging never
 * happens across empresas (DB backstop: UQ_CRM_Contactos_EmpresaNombre,
 * proven at the adapter level in importadorCrm.test.ts).
 */

function existente(id: number, nombre: string, telefono: string | null, correos: string[]): ContactoExistenteMerge {
  return { id, nombre, nombreNormalizado: normalizarNombre(nombre), telefono, correos };
}

function entrante(
  nombre: string,
  correos: string[],
  telefono: string | null = null,
  esPrincipal = false,
): ContactoImportado {
  return { nombre, telefono, correos, esPrincipal };
}

describe('planificarMergeContactos — D1 name-match merge rule', () => {
  it('name-match (case/space/accent-insensitive) updates the contacto: teléfono overwritten if provided, new correos added', () => {
    const existentes = [existente(7, 'José Pérez', '0981 111 222', ['jose@x.com'])];
    const plan = planificarMergeContactos(
      existentes,
      [entrante('JOSE   perez', ['jose@x.com', 'nuevo@y.com'], '0999 888 777')],
      4,
    );

    expect(plan.actualizaciones).toEqual([
      { contactoId: 7, telefono: '0999 888 777', correosNuevos: ['nuevo@y.com'] },
    ]);
    expect(plan.creaciones).toEqual([]);
    expect(plan.advertencias).toEqual([]);
  });

  it('correos are UNIONed, never removed: a subset incoming keeps every existing correo and only the teléfono path applies', () => {
    const existentes = [existente(3, 'Ana Díaz', '0981 000 111', ['a@x.com', 'b@x.com'])];
    const plan = planificarMergeContactos(
      existentes,
      [entrante('ana diaz', ['b@x.com'])], // telefono not provided → existing kept
      2,
    );

    expect(plan.actualizaciones).toEqual([{ contactoId: 3, telefono: '0981 000 111', correosNuevos: [] }]);
    expect(plan.creaciones).toEqual([]);
    expect(plan.advertencias).toEqual([]); // overlapping correos via name-match = union, never a warning
  });

  it('no name match → new contacto, keeping nombre/teléfono/correos/principal as imported', () => {
    const existentes = [existente(1, 'Ana', '999', ['ana@x.com'])];
    const plan = planificarMergeContactos(
      existentes,
      [entrante('Luis Gómez', ['luis@x.com'], '555', true)],
      9,
    );

    expect(plan.creaciones).toEqual([
      { nombre: 'Luis Gómez', telefono: '555', correos: ['luis@x.com'], esPrincipal: true },
    ]);
    expect(plan.actualizaciones).toEqual([]);
    expect(plan.advertencias).toEqual([]);
  });

  it('correo overlap WITHOUT name match is NOT a merge: the contacto is created AND a non-blocking warning is emitted', () => {
    const existentes = [existente(1, 'Ana', null, ['ana@x.com'])];
    const plan = planificarMergeContactos(
      existentes,
      [entrante('Anita López', ['ana@x.com', 'anita@x.com'])],
      5,
    );

    expect(plan.creaciones).toHaveLength(1);
    expect(plan.creaciones[0]?.nombre).toBe('Anita López');
    expect(plan.actualizaciones).toEqual([]);
    expect(plan.advertencias).toEqual([
      {
        fila: 5,
        columna: 'Correos',
        mensaje: expect.stringContaining('Posible contacto duplicado'),
      },
    ]);
    expect(plan.advertencias[0]?.mensaje).toContain('ana@x.com');
  });

  it('is scoped per empresa: the planner only sees the contactos it is given, so the same incoming row merges independently per empresa', () => {
    const empresaA = [existente(10, 'Pedro', '111', ['pedro@a.com'])];
    const empresaB = [existente(20, 'Luis', '222', ['luis@b.com'])];
    const entrantePedro = entrante('pedro', ['pedro@a.com']);

    // Against empresa A: name-match update. Against empresa B: Pedro is
    // unknown → NEW contacto (never fused with A's Pedro).
    const planA = planificarMergeContactos(empresaA, [entrantePedro], 2);
    const planB = planificarMergeContactos(empresaB, [entrantePedro], 2);

    expect(planA.actualizaciones.map((a) => a.contactoId)).toEqual([10]);
    expect(planB.creaciones).toHaveLength(1);
    expect(planB.actualizaciones).toEqual([]);
  });

  it('handles a mixed batch: one update, one untouched update, one warned creation — warnings anchored at the group fila', () => {
    const existentes = [
      existente(1, 'José Pérez', '111', ['jose@x.com']),
      existente(2, 'Ana Díaz', '222', ['ana@x.com']),
    ];
    const plan = planificarMergeContactos(
      existentes,
      [
        entrante('jose perez', ['jose@x.com'], '333'),
        entrante('Ana Díaz', ['ana@x.com']), // no changes at all → still an update intent, no warning
        entrante('Ana Suárez', ['ana@x.com', 'asuarez@x.com']), // correo overlap, different person
      ],
      8,
    );

    expect(plan.actualizaciones.map((a) => a.contactoId)).toEqual([1, 2]);
    expect(plan.actualizaciones[0]).toEqual({ contactoId: 1, telefono: '333', correosNuevos: [] });
    expect(plan.creaciones).toHaveLength(1);
    expect(plan.creaciones[0]?.nombre).toBe('Ana Suárez');
    expect(plan.advertencias).toHaveLength(1);
    expect(plan.advertencias[0]?.fila).toBe(8);
  });

  it('empty existing contactos (fresh empresa import): every incoming contacto is a creation with no warnings', () => {
    const plan = planificarMergeContactos(
      [],
      [entrante('Uno', ['uno@x.com']), entrante('Dos', ['dos@x.com'])],
      2,
    );

    expect(plan.creaciones).toHaveLength(2);
    expect(plan.actualizaciones).toEqual([]);
    expect(plan.advertencias).toEqual([]);
  });
});
