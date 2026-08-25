import { describe, it, expect } from 'vitest';

import { filterUsuarios } from './filterUsuarios';

const users = [
  { idUsuario: '1', usuario: 'jdoe', nombre: 'John Doe', area: 'cobranza' },
  { idUsuario: '2', usuario: 'asmith', nombre: 'Alice Smith', area: 'consolidados' },
  { idUsuario: '3', usuario: 'mperez', nombre: 'María Pérez', area: 'cobranza' },
];

describe('filterUsuarios (admin usuarios search)', () => {
  it('matches by nombre ("john" finds John Doe)', () => {
    const result = filterUsuarios(users, 'john');
    expect(result).toHaveLength(1);
    expect(result[0]?.usuario).toBe('jdoe');
  });

  it('matches by usuario ("asmith" finds the Alice Smith account)', () => {
    const result = filterUsuarios(users, 'asmith');
    expect(result).toHaveLength(1);
    expect(result[0]?.nombre).toBe('Alice Smith');
  });

  it('still matches by area', () => {
    const result = filterUsuarios(users, 'consolidados');
    expect(result).toHaveLength(1);
    expect(result[0]?.usuario).toBe('asmith');
  });

  it('is case-insensitive and trims the search term', () => {
    const result = filterUsuarios(users, '  JOHN ');
    expect(result).toHaveLength(1);
    expect(result[0]?.usuario).toBe('jdoe');
  });

  it('returns every user for an empty search term', () => {
    expect(filterUsuarios(users, '')).toHaveLength(3);
    expect(filterUsuarios(users, '   ')).toHaveLength(3);
  });

  it('returns nothing when no field matches', () => {
    expect(filterUsuarios(users, 'zzz-no-match')).toHaveLength(0);
  });
});

describe('filterUsuarios — correo matching (usuarios-correo)', () => {
  const correoUsers = [
    { idUsuario: '1', usuario: 'jdoe', nombre: 'John Doe', area: 'cobranza', correo: 'Maria@holomedic.com' },
    { idUsuario: '2', usuario: 'asmith', nombre: 'Alice Smith', area: 'consolidados', correo: null as string | null },
  ];

  it('matches by correo case-insensitively ("maria@holo" finds Maria@holomedic.com)', () => {
    const result = filterUsuarios(correoUsers, 'maria@holo');
    expect(result).toHaveLength(1);
    expect(result[0]?.usuario).toBe('jdoe');
  });

  it('does not crash on a null correo (row still matchable by other fields)', () => {
    const result = filterUsuarios(correoUsers, 'alice');
    expect(result).toHaveLength(1);
    expect(result[0]?.usuario).toBe('asmith');
  });

  it('still returns nothing when only a null-correo user exists for a correo-like term', () => {
    expect(filterUsuarios([correoUsers[1]!], 'maria@holo')).toHaveLength(0);
  });
});
