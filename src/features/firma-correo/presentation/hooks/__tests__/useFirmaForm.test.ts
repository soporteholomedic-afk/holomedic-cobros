/**
 * Tests for `useFirmaForm` (editor-firmas task 3.4).
 *
 * Spec `firma-correo` / "Field Validation" + "Signature Editing":
 *  - Invalid input → field-level errors shown, NOTHING persisted.
 *  - Valid input → persisted through `saveFirmaApi` (delegated — the
 *    hook contains no raw fetch), success feedback.
 *  - Server-side 400 fields are the source of truth and map back onto
 *    the fields (client validation is only a first-pass UX filter).
 *
 * `saveFirmaApi` is mocked at the module boundary (repo testing rule).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFirmaForm } from '../useFirmaForm';
import type { FirmaCorreo } from '../../../domain/entities';

const saveFirmaApiMock = vi.hoisted(() => vi.fn());

vi.mock('../../helpers/saveFirmaApi', () => ({
  saveFirmaApi: saveFirmaApiMock,
}));

const VALID: FirmaCorreo = {
  nombre: 'Dr. Juan Doe',
  area: 'Medicina',
  correo: 'juan.doe@holomedic.pe',
  telefono: '',
  anexo: '',
};

describe('useFirmaForm', () => {
  beforeEach(() => {
    saveFirmaApiMock.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('starts from the initial values with no errors and idle status', () => {
    const { result } = renderHook(() => useFirmaForm(VALID));

    expect(result.current.values).toEqual(VALID);
    expect(result.current.errors).toEqual({});
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
  });

  it('setField updates one field while keeping the rest', () => {
    const { result } = renderHook(() => useFirmaForm(VALID));

    act(() => {
      result.current.setField('telefono', '999 888 777');
    });

    expect(result.current.values).toEqual({ ...VALID, telefono: '999 888 777' });
  });

  it('an invalid submit shows field errors and NEVER calls the API', async () => {
    const { result } = renderHook(() => useFirmaForm({ ...VALID, correo: 'abc' }));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors).toEqual({
      correo: 'El correo no tiene un formato válido.',
    });
    expect(saveFirmaApiMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('an empty required field shows its own error (per-field, not a single banner)', async () => {
    const { result } = renderHook(() =>
      useFirmaForm({ nombre: '', area: '', correo: '', telefono: '', anexo: '' }),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.nombre).toBe('El nombre es obligatorio.');
    expect(result.current.errors.area).toBe('El área es obligatoria.');
    expect(result.current.errors.correo).toBe('El correo es obligatorio.');
    expect(saveFirmaApiMock).not.toHaveBeenCalled();
  });

  it('a valid submit delegates persistence and reports success', async () => {
    saveFirmaApiMock.mockResolvedValue({
      ok: true,
      firma: { ...VALID, nombre: 'Guardado' },
      firmaHtml: '<table>…</table>',
    });
    const { result } = renderHook(() => useFirmaForm(VALID));

    await act(async () => {
      await result.current.submit();
    });

    expect(saveFirmaApiMock).toHaveBeenCalledWith(VALID);
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.errorMessage).toBeNull();
  });

  it('a server 400 maps its fields back onto the form', async () => {
    saveFirmaApiMock.mockResolvedValue({
      ok: false,
      error: 'La firma contiene campos inválidos',
      fields: { telefono: 'El móvil debe contener al menos 6 dígitos.' },
    });
    const { result } = renderHook(() => useFirmaForm(VALID));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errors).toEqual({
      telefono: 'El móvil debe contener al menos 6 dígitos.',
    });
    expect(result.current.errorMessage).toBe('La firma contiene campos inválidos');
  });

  it('a transport/network failure reports the error banner without field errors', async () => {
    saveFirmaApiMock.mockResolvedValue({ ok: false, error: 'No se pudo conectar con el servidor' });
    const { result } = renderHook(() => useFirmaForm(VALID));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errors).toEqual({});
    expect(result.current.errorMessage).toBe('No se pudo conectar con el servidor');
  });
});
