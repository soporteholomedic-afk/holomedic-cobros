import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { CrmBoard } from '../CrmBoard';
import { LISTA, empresa, llamadas, mockApi } from './crmFixtures';

function columna(nombre: string): HTMLElement {
  return screen.getByRole('region', { name: nombre });
}

async function cargado() {
  await screen.findByText('Constructora Andina S.A.C.');
}

function tarjeta(nombre: string): HTMLElement {
  const h = screen.getByRole('heading', { name: nombre });
  return h.closest('article') as HTMLElement;
}

function mover(nombre: string, hacia: string) {
  fireEvent.click(within(tarjeta(nombre)).getByRole('button', { name: new RegExp(`Mover .* a ${hacia}`) }));
}

function soltar(nombre: string, enColumna: string) {
  const data = new Map<string, string>();
  const dataTransfer = {
    setData: (k: string, v: string) => data.set(k, v),
    getData: (k: string) => data.get(k) ?? '',
    effectAllowed: '',
  };
  fireEvent.dragStart(tarjeta(nombre), { dataTransfer });
  fireEvent.dragOver(columna(enColumna), { dataTransfer });
  fireEvent.drop(columna(enColumna), { dataTransfer });
}

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CrmBoard — tablero', () => {
  it('shows the five columns in order, each empresa in its own column with the counts', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const nombres = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(nombres).toEqual(['Por contactar', 'Contactado', 'En seguimiento', 'Cliente', 'Perdido']);
    expect(within(columna('Por contactar')).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(within(columna('Contactado')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
    expect(within(columna('Cliente')).getByText('Agroindustrial Valle Verde S.A.C.')).toBeInTheDocument();
    expect(within(columna('Perdido')).getByText('Ferretería El Maestro S.R.L.')).toBeInTheDocument();
    expect(within(columna('Por contactar')).getByText('2')).toBeInTheDocument();
    expect(within(columna('En seguimiento')).getByText('Arrastra una empresa aquí')).toBeInTheDocument();
  });

  it('shows the principal contact, "+1 contacto" for extra contacts, the medium chip and no medium before contact', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const sin = tarjeta('Constructora Andina S.A.C.');
    expect(within(sin).getByText('Marcela Quispe')).toBeInTheDocument();
    expect(within(sin).getByText('987 654 321')).toBeInTheDocument();
    expect(within(sin).queryByText(/contacto/)).toBeNull();
    expect(within(sin).queryByText(/Medio:/)).toBeNull();
    const varios = tarjeta('Textiles Pacífico S.A.C.');
    expect(within(varios).getByText('Renzo Vargas')).toBeInTheDocument();
    expect(within(varios).getByText('+1 contacto')).toBeInTheDocument();
    expect(within(varios).queryByText('Lucía Prado')).toBeNull();
    expect(within(varios).getByRole('button', { name: /Medio: Llamada/ })).toBeInTheDocument();
  });

  it('shows the loss reason summary on a lost empresa', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const t = tarjeta('Ferretería El Maestro S.R.L.');
    expect(within(t).getByText(/Ya tienen proveedor/)).toBeInTheDocument();
    expect(within(t).getByText(/Proveedor: Distribuidora Norte S\.A\.C\./)).toBeInTheDocument();
    expect(within(t).getByText(/Contrato hasta: diciembre 2027/)).toBeInTheDocument();
  });

  it('filters by empresa, RUC, sector and by ANY contact, not only the principal', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const buscar = screen.getByRole('searchbox', { name: 'Buscar empresa o contacto' });
    fireEvent.change(buscar, { target: { value: 'lucía' } });
    expect(screen.getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
    expect(screen.queryByText('Constructora Andina S.A.C.')).toBeNull();
    fireEvent.change(buscar, { target: { value: '20601' } });
    expect(screen.getByText('Minera Los Tres Picos S.A.')).toBeInTheDocument();
    expect(screen.queryByText('Textiles Pacífico S.A.C.')).toBeNull();
    fireEvent.change(buscar, { target: { value: 'comercio' } });
    expect(screen.getByText('Ferretería El Maestro S.R.L.')).toBeInTheDocument();
  });

  it('shows an error with a retry button when the list cannot be loaded', async () => {
    mockApi({ lista: { status: 500, body: { success: false, error: 'x' } } });
    render(<CrmBoard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las empresas');
    const fn = mockApi();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await cargado();
    expect(llamadas(fn, 'GET', '/api/crm/empresas')).toHaveLength(1);
  });

  it('disables the previous arrow in the first column and the next arrow in the last', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    expect(within(tarjeta('Constructora Andina S.A.C.')).getByRole('button', { name: 'Sin columna anterior' })).toBeDisabled();
    expect(within(tarjeta('Ferretería El Maestro S.R.L.')).getByRole('button', { name: 'Sin columna siguiente' })).toBeDisabled();
  });
});

describe('CrmBoard — mover', () => {
  it('moves an empresa that already has a medium with just {etapa}, with no dialog', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Textiles Pacífico S.A.C.', 'En seguimiento');
    await waitFor(() => expect(within(columna('En seguimiento')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([{ url: '/api/crm/empresas/e-3/etapa', body: { etapa: 'en_seguimiento' } }]);
  });

  it('asks for the medium when entering Contactado without one, and the card does not move until it is saved', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Constructora Andina S.A.C.', 'Contactado');
    const dialogo = screen.getByRole('dialog', { name: /Cómo lo contactaste/ });
    expect(within(dialogo).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['llamada', 'correo', 'whatsapp']);
    expect(within(columna('Por contactar')).getByText('Constructora Andina S.A.C.')).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);

    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Elige el medio de contacto');
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);

    fireEvent.click(within(dialogo).getByRole('radio', { name: /WhatsApp/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(columna('Contactado')).getByText('Constructora Andina S.A.C.')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([{ url: '/api/crm/empresas/e-1/etapa', body: { etapa: 'contactado', medio: 'whatsapp' } }]);
    expect(within(tarjeta('Constructora Andina S.A.C.')).getByRole('button', { name: /Medio: WhatsApp/ })).toBeInTheDocument();
  });

  it.each([
    ['Cancelar', () => fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('%s on the medium dialog leaves the empresa where it was and sends nothing', async (_n, cerrar) => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Constructora Andina S.A.C.', 'Contactado');
    cerrar();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(columna('Por contactar')).getByText('Constructora Andina S.A.C.')).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);
  });

  it('going back to Por contactar sends {etapa} and the card loses its medium chip', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Textiles Pacífico S.A.C.', 'Por contactar');
    await waitFor(() => expect(within(columna('Por contactar')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /etapa$/)[0]?.body).toEqual({ etapa: 'por_contactar' });
    expect(within(tarjeta('Textiles Pacífico S.A.C.')).queryByText(/Medio:/)).toBeNull();
  });

  it('asks for the reason when entering Perdido: category required, details required by category, then moves', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Agroindustrial Valle Verde S.A.C.', 'Perdido');
    const dialogo = screen.getByRole('dialog', { name: /Motivo de la pérdida/ });
    expect(within(dialogo).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual([
      'precio', 'proveedor', 'sin_interes', 'no_contestan', 'otro',
    ]);
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Elige el motivo');

    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Precio' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Precio que les ofrecimos');
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);
    expect(within(columna('Cliente')).getByText('Agroindustrial Valle Verde S.A.C.')).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText(/Precio que les ofrecimos/), { target: { value: 'S/ 7,000' } });
    fireEvent.change(within(dialogo).getByLabelText(/Notas/), { target: { value: 'Muy caro' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(columna('Perdido')).getByText('Agroindustrial Valle Verde S.A.C.')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([
      { url: '/api/crm/empresas/e-4/etapa', body: { etapa: 'perdido', motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: 'Muy caro' } } },
    ]);
    expect(within(tarjeta('Agroindustrial Valle Verde S.A.C.')).getByText(/Ofrecimos: S\/ 7,000/)).toBeInTheDocument();
  });

  it('the supplier field is optional, "Otro" needs a detail, and the fields change with the category', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Agroindustrial Valle Verde S.A.C.', 'Perdido');
    const dialogo = screen.getByRole('dialog', { name: /Motivo de la pérdida/ });
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Otro' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Cuéntanos el motivo');
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Ya tienen proveedor' }));
    expect(within(dialogo).queryByLabelText(/Cuéntanos el motivo/)).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(1));
    expect(llamadas(fn, 'PATCH', /etapa$/)[0]?.body).toEqual({
      etapa: 'perdido',
      motivo: { categoria: 'proveedor', detalle1: null, detalle2: null, notas: null },
    });
  });

  it('Cancelar on the reason dialog leaves the empresa and sends nothing', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Agroindustrial Valle Verde S.A.C.', 'Perdido');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(columna('Cliente')).getByText('Agroindustrial Valle Verde S.A.C.')).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);
  });

  it('leaving Perdido removes the reason from the card', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Ferretería El Maestro S.R.L.', 'Cliente');
    await waitFor(() => expect(within(columna('Cliente')).getByText('Ferretería El Maestro S.R.L.')).toBeInTheDocument());
    expect(within(tarjeta('Ferretería El Maestro S.R.L.')).queryByText(/Ya tienen proveedor/)).toBeNull();
  });

  it('keeps the empresa where it was and shows the server message when the move is rejected', async () => {
    mockApi({ etapa: () => ({ status: 400, body: { success: false, error: 'Elige cómo se contactó a la empresa' } }) });
    render(<CrmBoard />);
    await cargado();
    mover('Textiles Pacífico S.A.C.', 'En seguimiento');
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Elige cómo se contactó a la empresa'));
    expect(within(columna('Contactado')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
  });

  it('keeps the empresa and shows a generic message when the request fails', async () => {
    const fn = mockApi();
    fn.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') throw new Error('network');
      return url === '/api/crm/sectores'
        ? ({ ok: true, status: 200, json: async () => ({ success: true, sectores: [] }) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ success: true, empresas: LISTA }) } as Response);
    });
    render(<CrmBoard />);
    await cargado();
    mover('Textiles Pacífico S.A.C.', 'En seguimiento');
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo mover la empresa'));
    expect(within(columna('Contactado')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
  });

  it('dragging onto a column follows the same rules: Contactado asks for the medium', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    soltar('Constructora Andina S.A.C.', 'Contactado');
    expect(screen.getByRole('dialog', { name: /Cómo lo contactaste/ })).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    soltar('Textiles Pacífico S.A.C.', 'Cliente');
    await waitFor(() => expect(within(columna('Cliente')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([{ url: '/api/crm/empresas/e-3/etapa', body: { etapa: 'cliente' } }]);
  });

  it('dropping on the column the empresa is already in does nothing', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    soltar('Textiles Pacífico S.A.C.', 'Contactado');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(llamadas(fn, 'PATCH', /./)).toHaveLength(0);
  });
});

describe('CrmBoard — editar medio y motivo desde la tarjeta', () => {
  it('the medium chip opens the dialog with the current medium selected and PATCHes /seguimiento without moving', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta('Textiles Pacífico S.A.C.')).getByRole('button', { name: /Medio: Llamada/ }));
    const dialogo = screen.getByRole('dialog', { name: /Editar medio de contacto/ });
    expect(within(dialogo).getByRole('radio', { name: /Llamada/ })).toBeChecked();
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Correo/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(tarjeta('Textiles Pacífico S.A.C.')).getByRole('button', { name: /Medio: Correo/ })).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /seguimiento$/)).toEqual([{ url: '/api/crm/empresas/e-3/seguimiento', body: { medio: 'correo' } }]);
    expect(within(columna('Contactado')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
  });

  it('"Editar motivo" opens the reason dialog prefilled and PATCHes /seguimiento with the new reason', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta('Ferretería El Maestro S.R.L.')).getByRole('button', { name: /Editar motivo/ }));
    const dialogo = screen.getByRole('dialog', { name: /Motivo de la pérdida/ });
    expect(within(dialogo).getByRole('radio', { name: 'Ya tienen proveedor' })).toBeChecked();
    expect(within(dialogo).getByLabelText(/¿Qué proveedor tienen/)).toHaveValue('Distribuidora Norte S.A.C.');
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Precio' }));
    fireEvent.change(within(dialogo).getByLabelText(/Precio que les ofrecimos/), { target: { value: 'S/ 9,000' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(tarjeta('Ferretería El Maestro S.R.L.')).getByText(/Ofrecimos: S\/ 9,000/)).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /seguimiento$/)[0]?.body).toEqual({
      motivo: { categoria: 'precio', detalle1: 'S/ 9,000', detalle2: null, notas: null },
    });
    expect(within(columna('Perdido')).getByText('Ferretería El Maestro S.R.L.')).toBeInTheDocument();
  });

  it('the buttons inside a card do not trigger the card click', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta('Textiles Pacífico S.A.C.')).getByRole('button', { name: /Medio: Llamada/ }));
    expect(screen.queryByRole('dialog', { name: /Textiles Pacífico/ })).toBeNull();
  });
});

describe('CrmBoard — datos', () => {
  it('the page used to ship with one contact per row: an empresa without contacts does not crash the board', async () => {
    mockApi({ lista: { status: 200, body: { success: true, empresas: [empresa({ contactos: [] })] } } });
    render(<CrmBoard />);
    expect(await screen.findByText('Constructora Andina S.A.C.')).toBeInTheDocument();
  });
});
