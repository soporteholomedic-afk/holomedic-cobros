import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CrmBoard } from '../CrmBoard';
import { json, llamadas, mockApi } from './crmFixtures';

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

describe('Detail view — an empresa with RUC is unchanged by the RUC completion', () => {
  it('shows the RUC as text without the inline field and still edits it with the 11-digit rule', async () => {
    const fn = mockApi();
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string, i?: RequestInit) =>
      u.endsWith('/historial') ? json({ status: 200, body: { interacciones: [] } }) : base(u, i),
    ) as unknown as typeof fetch;
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    expect(within(panel).getByText('20556677889')).toBeInTheDocument();
    expect(within(panel).queryByText('Falta RUC')).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Guardar RUC' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Editar' }));
    const ruc = within(panel).getByLabelText(/^RUC/);
    expect(ruc).toHaveValue('20556677889');
    fireEvent.change(ruc, { target: { value: '20556677880' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('20556677880');
    expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)[0]?.body).toMatchObject({ ruc: '20556677880' });
  });
});
