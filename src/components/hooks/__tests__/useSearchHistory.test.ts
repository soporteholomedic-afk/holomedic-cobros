import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearchHistory } from '../useSearchHistory';

const STORAGE_KEY = 'holomedic:search-history:company-list';

describe('useSearchHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('debe iniciar con historial vacío cuando no hay nada en localStorage', () => {
    const { result } = renderHook(() => useSearchHistory('company-list'));

    expect(result.current.history).toEqual([]);
  });

  it('debe añadir un término al historial', () => {
    const { result } = renderHook(() => useSearchHistory('company-list'));

    act(() => {
      result.current.addTerm('clinica');
    });

    expect(result.current.history).toEqual(['clinica']);
  });

  it('debe persistir los términos en localStorage', () => {
    const { result } = renderHook(() => useSearchHistory('company-list'));

    act(() => {
      result.current.addTerm('clinica');
    });

    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual(['clinica']);
  });

  it('debe rehidratar el historial desde localStorage en montaje', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 'b']));

    const { result } = renderHook(() => useSearchHistory('company-list'));

    expect(result.current.history).toEqual(['a', 'b']);
  });

  it('debe deduplicar insensible a mayúsculas y mover el término al tope', () => {
    const { result } = renderHook(() => useSearchHistory('company-list'));

    act(() => {
      result.current.addTerm('clinica');
    });
    act(() => {
      result.current.addTerm('hospital');
    });
    act(() => {
      result.current.addTerm('CLINICA');
    });

    expect(result.current.history).toEqual(['CLINICA', 'hospital']);
  });

  it('debe respetar el límite maxItems', () => {
    const { result } = renderHook(() =>
      useSearchHistory('company-list', 3),
    );

    act(() => {
      result.current.addTerm('a');
    });
    act(() => {
      result.current.addTerm('b');
    });
    act(() => {
      result.current.addTerm('c');
    });
    act(() => {
      result.current.addTerm('d');
    });

    expect(result.current.history).toEqual(['d', 'c', 'b']);
  });

  it('debe ignorar términos vacíos o con solo espacios', () => {
    const { result } = renderHook(() => useSearchHistory('company-list'));

    act(() => {
      result.current.addTerm('   ');
    });
    act(() => {
      result.current.addTerm('');
    });

    expect(result.current.history).toEqual([]);
  });

  it('debe eliminar un término específico del historial', () => {
    const { result } = renderHook(() => useSearchHistory('company-list'));

    act(() => {
      result.current.addTerm('clinica');
    });
    act(() => {
      result.current.addTerm('hospital');
    });

    act(() => {
      result.current.removeTerm('clinica');
    });

    expect(result.current.history).toEqual(['hospital']);
  });

  it('debe limpiar todo el historial', () => {
    const { result } = renderHook(() => useSearchHistory('company-list'));

    act(() => {
      result.current.addTerm('clinica');
    });
    act(() => {
      result.current.addTerm('hospital');
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.history).toEqual([]);
    expect(
      window.localStorage.getItem(STORAGE_KEY),
    ).toEqual(JSON.stringify([]));
  });

  it('debe manejar localStorage corrupto sin romper', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json');

    const { result } = renderHook(() => useSearchHistory('company-list'));

    expect(result.current.history).toEqual([]);
  });

  it('debe aislar historiales por scope', () => {
    const companyHook = renderHook(() => useSearchHistory('company-list'));
    const clientHook = renderHook(() => useSearchHistory('client-list'));

    act(() => {
      companyHook.result.current.addTerm('empresa-x');
    });
    act(() => {
      clientHook.result.current.addTerm('cliente-y');
    });

    expect(companyHook.result.current.history).toEqual(['empresa-x']);
    expect(clientHook.result.current.history).toEqual(['cliente-y']);
  });
});
