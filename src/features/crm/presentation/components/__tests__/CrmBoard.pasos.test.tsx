import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CrmBoard } from '../CrmBoard';
import { mockApi } from './crmFixtures';

const TEXTILES = 'Textiles Pacífico S.A.C.';

afterEach(() => vi.restoreAllMocks());

async function altaAbierta(): Promise<HTMLElement> {
  render(<CrmBoard />);
  await screen.findByText('Constructora Andina S.A.C.');
  fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
  return screen.getByRole('dialog', { name: /Nueva empresa/ });
}

function pasos(panel: HTMLElement) {
  const lista = within(panel).getByRole('list', { name: 'Pasos' });
  return within(lista).getAllByRole('listitem');
}

describe('Alta — indicador de dos pasos', () => {
  it('shows "1 Empresa" and "2 Contacto", with the first one current when the panel opens', async () => {
    mockApi();
    const panel = await altaAbierta();
    const [uno, dos] = pasos(panel);
    expect(uno).toHaveTextContent('1Empresa');
    expect(dos).toHaveTextContent('2Contacto');
    expect(uno).toHaveAttribute('aria-current', 'step');
    expect(dos).not.toHaveAttribute('aria-current');
  });

  it('moves to "Contacto" when the focus enters the contact fields, and back to "Empresa" when it returns', async () => {
    mockApi();
    const panel = await altaAbierta();
    fireEvent.focus(within(panel).getByLabelText(/^Nombre/));
    expect(pasos(panel)[1]).toHaveAttribute('aria-current', 'step');
    expect(pasos(panel)[0]).not.toHaveAttribute('aria-current');
    fireEvent.focus(within(panel).getByLabelText(/^RUC/));
    expect(pasos(panel)[0]).toHaveAttribute('aria-current', 'step');
  });

  it('starts again at "Empresa" after the panel is closed and reopened', async () => {
    mockApi();
    const panel = await altaAbierta();
    fireEvent.focus(within(panel).getByLabelText(/^Teléfono/));
    fireEvent.click(within(panel).getByRole('button', { name: 'Cerrar panel' }));
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    expect(pasos(screen.getByRole('dialog', { name: /Nueva empresa/ }))[0]).toHaveAttribute('aria-current', 'step');
  });
});

describe('Edición — maquetación del diseño', () => {
  async function edicion(): Promise<HTMLElement> {
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const card = screen.getByRole('heading', { level: 3, name: TEXTILES }).closest('article') as HTMLElement;
    fireEvent.click(within(card).getByText(/^RUC /));
    const panel = screen.getByRole('dialog', { name: TEXTILES });
    fireEvent.click(within(panel).getByRole('button', { name: 'Editar' }));
    return panel;
  }

  it('calls the first contact "Contacto principal" and the others "Contacto N"', async () => {
    mockApi();
    const panel = await edicion();
    const grupos = within(panel).getAllByRole('group', { name: /^Contacto/ });
    expect(grupos[0]).toHaveAccessibleName('Contacto principal');
    expect(grupos[1]).toHaveAccessibleName('Contacto 2');
  });

  it('stacks the contact fields (name, phone, email) one under the other, unlike the create panel', async () => {
    mockApi();
    const panel = await edicion();
    for (const campos of panel.querySelectorAll('[data-disposicion]')) {
      expect(campos).toHaveAttribute('data-disposicion', 'apilada');
    }
    expect(panel.querySelectorAll('[data-disposicion]').length).toBe(2);
  });

  it('the create panel keeps name and phone side by side', async () => {
    mockApi();
    const alta = await altaAbierta();
    expect(alta.querySelector('[data-disposicion]')).toHaveAttribute('data-disposicion', 'dos-columnas');
  });
});
