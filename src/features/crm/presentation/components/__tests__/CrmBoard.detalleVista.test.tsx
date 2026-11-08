import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CrmBoard } from '../CrmBoard';
import { llamadas, mockApi } from './crmFixtures';

const TEXTILES = 'Textiles Pacífico S.A.C.';

function tarjeta(nombre: string): HTMLElement {
  return (screen.getAllByRole('heading', { level: 3, name: nombre }).map((h) => h.closest('article') as HTMLElement))[0]!;
}

function abrir(nombre: string): HTMLElement {
  fireEvent.click(within(tarjeta(nombre)).getByText(/^RUC /));
  return screen.getByRole('dialog', { name: nombre });
}

const oportunidades = (panel: HTMLElement) =>
  within(within(panel).getByRole('heading', { name: /^Oportunidades · / }).closest('section') as HTMLElement);

afterEach(() => vi.restoreAllMocks());

describe('Ficha — layout (S3)', () => {
  it('shows the relación right under the title, in the header, and no etapa row in the data list', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    const cabecera = panel.querySelector('header') as HTMLElement;
    expect(within(cabecera).getByText('Prospecto')).toBeInTheDocument();
    expect(within(panel).queryByText('Etapa')).toBeNull();
  });

  it('answers the three questions in order: quién es (Empresa), qué negocios (Oportunidades), qué conversamos (Historial)', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    const titulos = [...panel.querySelectorAll('h3')].map((h) => h.textContent);
    expect(titulos[0]).toBe('Empresa');
    expect(titulos[1]).toMatch(/^Oportunidades · 2 registradas$/);
    expect(titulos[titulos.length - 1]).toBe('Notas');
    expect(titulos.some((t) => t?.startsWith('Historial'))).toBe(true);
  });

  it('labels every contact phone and email, once per contact', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    expect(within(panel).getAllByText('Teléfono')).toHaveLength(2);
    expect(within(panel).getAllByText('Correo')).toHaveLength(2);
  });

  it('puts each deal with its etapa chip and its medio controls in the Oportunidades section', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir(TEXTILES);
    const seccion = oportunidades(panel);
    const items = seccion.getAllByRole('listitem');
    expect(within(items[0]!).getByText('Contactado')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Llamada').closest('span')?.querySelector('svg')).not.toBeNull();
    expect(within(items[0]!).getByRole('button', { name: 'Cambiar medio' })).toBeInTheDocument();
  });

  it('with no medium yet in an open deal, the item says so and offers no button while in Por contactar', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const panel = abrir('Constructora Andina S.A.C.');
    const items = oportunidades(panel).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Sin medio registrado')).toBeInTheDocument();
    expect(within(items[0]!).queryByRole('button')).toBeNull();
    expect(within(items[0]!).getByText('Por contactar')).toBeInTheDocument();
  });

  it('is 420 px wide like the design', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    expect(abrir(TEXTILES).className).toMatch(/w-\[420px\]/);
  });
});

describe('Ficha — an empresa with RUC is unchanged by the RUC completion', () => {
  it('shows the RUC as text without the inline field and still edits it with the 11-digit rule', async () => {
    const fn = mockApi();
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
