import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AltaPanel } from '../AltaPanel';
import { json } from './crmFixtures';

const base: typeof fetch = global.fetch;

afterEach(() => {
  global.fetch = base;
  vi.restoreAllMocks();
});

function renderAlta(inicial: { razonSocial: string; ruc: string; contacto: string | null; telefono: string | null; correo: string | null }) {
  const onCrear = vi.fn().mockResolvedValue({ error: 'no guardar en este test' });
  render(
    <AltaPanel
      sectores={['Odontología']}
      oculto={false}
      onCerrar={vi.fn()}
      onCrearSector={vi.fn()}
      onCrear={onCrear}
      onCrearOportunidad={vi.fn()}
      inicial={inicial}
    />,
  );
  return { onCrear };
}

describe('AltaPanel — prellenado desde SIGLA (S11)', () => {
  it('seeds razón social, RUC, contacto, teléfono and correo from the SIGLA client', () => {
    renderAlta({
      razonSocial: 'Solo en SIGLA S.A.C.',
      ruc: '20900000001',
      contacto: 'Contacto SIGLA',
      telefono: '987 000 001',
      correo: 'contacto@sigla.pe',
    });
    expect(screen.getByDisplayValue('Solo en SIGLA S.A.C.')).toBeTruthy();
    expect(screen.getByDisplayValue('20900000001')).toBeTruthy();
    expect(screen.getByDisplayValue('Contacto SIGLA')).toBeTruthy();
    expect(screen.getByDisplayValue('987 000 001')).toBeTruthy();
    expect(screen.getByDisplayValue('contacto@sigla.pe')).toBeTruthy();
  });

  it('without inicial the form starts empty (existing behavior untouched)', () => {
    renderAlta({ razonSocial: '', ruc: '', contacto: null, telefono: null, correo: null });
    expect((screen.getByPlaceholderText('Ej. Constructora Andina S.A.C.') as HTMLInputElement).value).toBe('');
    expect(screen.queryByDisplayValue('Solo en SIGLA S.A.C.')).toBeNull();
  });

  it('the prefilled body keeps the same POST shape (razón social, RUC, contactos)', async () => {
    const { onCrear } = renderAlta({
      razonSocial: 'Solo en SIGLA S.A.C.',
      ruc: '20900000001',
      contacto: 'Contacto SIGLA',
      telefono: '987 000 001',
      correo: null,
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Crear empresa' }).closest('form')!);
    try {
      await waitFor(() => expect(onCrear).toHaveBeenCalled(), { timeout: 3000 });
    } catch {
      console.log('BODY:', document.body.textContent?.slice(0, 400));
    }
    expect(onCrear).toHaveBeenCalled();
    const cuerpo = onCrear.mock.calls[0][0] as Record<string, unknown>;
    expect(cuerpo.razonSocial).toBe('Solo en SIGLA S.A.C.');
    expect(cuerpo.ruc).toBe('20900000001');
    expect(Array.isArray(cuerpo.contactos)).toBe(true);
  });
});
