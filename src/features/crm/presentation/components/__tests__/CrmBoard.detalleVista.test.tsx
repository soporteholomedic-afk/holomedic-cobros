import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CrmBoard } from '../CrmBoard';
import { mockApi } from './crmFixtures';

const TEXTILES = 'Textiles Pacífico S.A.C.';

function abrir(nombre: string): HTMLElement {
  const card = screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;
  fireEvent.click(within(card).getByText(/^RUC /));
  return screen.getByRole('dialog', { name: nombre });
}

afterEach(() => vi.restoreAllMocks());

describe('Detail view — layout of the approved design', () => {
  it('shows the stage right under the title, in the header, and no longer as a row of the data list', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    const cabecera = panel.querySelector('header') as HTMLElement;
    expect(within(cabecera).getByText('Contactado')).toBeInTheDocument();
    expect(within(panel).queryByText('Etapa')).toBeNull();
  });

  it('labels every contact phone and email, once per contact', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    expect(within(panel).getAllByText('Teléfono')).toHaveLength(2);
    expect(within(panel).getAllByText('Correo')).toHaveLength(2);
  });

  it('puts the medium in a "Seguimiento" section with its label, its icon and "Cambiar medio" as a button', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    const seccion = within(panel).getByRole('heading', { name: 'Seguimiento' }).closest('section') as HTMLElement;
    expect(within(seccion).getByText('Medio de contacto')).toBeInTheDocument();
    expect(within(seccion).getByText('Llamada').closest('span')?.querySelector('svg')).not.toBeNull();
    expect(within(seccion).getByRole('button', { name: 'Cambiar medio' })).toBeInTheDocument();
  });

  it('with no medium yet, the Seguimiento section says so and offers no button while in Por contactar', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir('Constructora Andina S.A.C.');
    const seccion = within(panel).getByRole('heading', { name: 'Seguimiento' }).closest('section') as HTMLElement;
    expect(within(seccion).getByText('Sin medio registrado')).toBeInTheDocument();
    expect(within(seccion).queryByRole('button')).toBeNull();
  });

  it('is 420 px wide like the design', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    expect(abrir(TEXTILES).className).toMatch(/w-\[420px\]/);
  });
});
