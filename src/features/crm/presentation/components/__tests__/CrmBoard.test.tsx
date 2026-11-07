import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
// T7/T8 own the side panels: these suites test the board and its cards only.
vi.mock('../PanelDia', () => ({ PanelDia: () => null }));
vi.mock('../DetallePanel', () => ({
  DetallePanel: (props: { empresa: { razonSocial: string } }) => (
    <aside role="dialog" aria-label={props.empresa.razonSocial} data-testid="detalle-mock" />
  ),
}));
vi.mock('../EntrantePanel', () => ({ EntrantePanel: () => null }));
vi.mock('../RegistrarContactoPanel', () => ({ RegistrarContactoPanel: () => null }));
vi.mock('../AltaPanel', () => ({ AltaPanel: () => null }));

import { CrmBoard } from '../CrmBoard';
import { LISTA, OPORTUNIDADES, empresa, llamadas, mockApi, oportunidad } from './crmFixtures';

function columna(nombre: string): HTMLElement {
  return screen.getByRole('region', { name: nombre });
}

async function cargado() {
  await screen.findByText('Constructora Andina S.A.C.');
}

/** The card of the oportunidad named `nombre` (a card is one deal, S2). */
function tarjeta(nombre: string): HTMLElement {
  return screen.getByText(nombre).closest('article') as HTMLElement;
}

function tarjetaEn(columnaNombre: string, nombre: string): HTMLElement {
  const t = within(columna(columnaNombre)).getByText(nombre);
  return t.closest('article') as HTMLElement;
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
  it('shows the six stages in order, one card per oportunidad, with the counts', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const nombres = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(nombres).toEqual(['Por contactar', 'Contactado', 'En seguimiento', 'Cotizado', 'Ganada', 'Perdida']);
    expect(within(columna('Por contactar')).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(within(columna('Contactado')).getByText('Exámenes de ingreso')).toBeInTheDocument();
    expect(within(columna('En seguimiento')).getByText('Ergonomía para planta')).toBeInTheDocument();
    expect(within(columna('Cotizado')).getByText('Vigilancia epidemiológica')).toBeInTheDocument();
    expect(within(columna('Ganada')).getByText('Campaña de vacunación 2025')).toBeInTheDocument();
    expect(within(columna('Perdida')).getByText('Ergonomía industrial')).toBeInTheDocument();
    expect(within(columna('Por contactar')).getByText('2')).toBeInTheDocument();
  });

  it('one empresa can sit in two columns: each of its oportunidades is its own card (S2)', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    expect(within(columna('Contactado')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
    expect(within(columna('Ganada')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
    expect(screen.getAllByText('Textiles Pacífico S.A.C.')).toHaveLength(2);
  });

  it('joins the empresa onto the card: name, RUC and sector come from the ficha (S2)', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const t = tarjetaEn('Cotizado', 'Vigilancia epidemiológica');
    expect(within(t).getByText('Minera Los Tres Picos S.A.')).toBeInTheDocument();
    expect(within(t).getByText('RUC 20601234567')).toBeInTheDocument();
    expect(within(t).getByText('Minería y Energía')).toBeInTheDocument();
    expect(within(t).getByText('Audiometrías')).toBeInTheDocument();
    expect(within(t).getByText('Luis Cárdenas')).toBeInTheDocument();
    expect(within(t).getByText('S/ 12,000')).toBeInTheDocument();
    expect(within(t).getByText('Referido por un cliente')).toBeInTheDocument();
  });

  it('shows the loss reason summary on a lost oportunidad', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const t = tarjetaEn('Perdida', 'Ergonomía industrial');
    expect(within(t).getByText(/Ya tienen proveedor/)).toBeInTheDocument();
    expect(within(t).getByText(/Proveedor: Distribuidora Norte S\.A\.C\./)).toBeInTheDocument();
    expect(within(t).getByText(/Contrato hasta: diciembre 2027/)).toBeInTheDocument();
  });

  it('search filters by empresa, oportunidad nombre, RUC, servicio and responsable', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const buscar = screen.getByRole('searchbox', { name: 'Buscar oportunidad, empresa o responsable' });
    // empresa name: both Textiles cards stay
    fireEvent.change(buscar, { target: { value: 'textiles' } });
    expect(screen.getAllByText('Textiles Pacífico S.A.C.')).toHaveLength(2);
    expect(screen.queryByText('Constructora Andina S.A.C.')).toBeNull();
    expect(within(columna('Por contactar')).getByText('Arrastra una oportunidad aquí')).toBeInTheDocument();
    // oportunidad nombre
    fireEvent.change(buscar, { target: { value: 'vacunación' } });
    expect(screen.getByText('Campaña de vacunación 2025')).toBeInTheDocument();
    expect(screen.queryByText('Exámenes de ingreso')).toBeNull();
    // servicio: the matched deal stays while its sibling oportunidad of the same empresa hides
    fireEvent.change(buscar, { target: { value: 'audiom' } });
    expect(screen.getByText('Vigilancia epidemiológica')).toBeInTheDocument();
    expect(screen.queryByText('Monitoreo ocupacional 2026')).toBeNull();
    // RUC (lives on the empresa)
    fireEvent.change(buscar, { target: { value: '20601' } });
    expect(screen.getByText('Monitoreo ocupacional 2026')).toBeInTheDocument();
    expect(screen.getByText('Vigilancia epidemiológica')).toBeInTheDocument();
    // responsable
    fireEvent.change(buscar, { target: { value: 'luis' } });
    expect(screen.getByText('Vigilancia epidemiológica')).toBeInTheDocument();
    expect(screen.queryByText('Monitoreo ocupacional 2026')).toBeNull();
  });

  it('shows an error with a retry button when the oportunidades cannot be loaded', async () => {
    mockApi({ oportunidades: { status: 500, body: { success: false, error: 'x' } } });
    render(<CrmBoard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las empresas y oportunidades');
    const fn = mockApi();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await cargado();
    expect(llamadas(fn, 'GET', '/api/crm/oportunidades')).toHaveLength(1);
  });

  it('shows the same alert when the empresas cannot be loaded', async () => {
    mockApi({ lista: { status: 500, body: { success: false, error: 'x' } } });
    render(<CrmBoard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las empresas y oportunidades');
  });

  it('disables the previous arrow in the first column and the next arrow in the last', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    expect(
      within(tarjetaEn('Por contactar', 'Equipos de protección para obra')).getByRole('button', { name: 'Sin columna anterior' }),
    ).toBeDisabled();
    expect(within(tarjetaEn('Perdida', 'Ergonomía industrial')).getByRole('button', { name: 'Sin columna siguiente' })).toBeDisabled();
  });
});

describe('CrmBoard — mover', () => {
  it('moves with just {etapa} when the deal already has a medium, with no dialog and no full refetch', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Exámenes de ingreso', 'En seguimiento');
    await waitFor(() => expect(within(columna('En seguimiento')).getByText('Exámenes de ingreso')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([{ url: '/api/crm/oportunidades/o-3/etapa', body: { etapa: 'en_seguimiento' } }]);
    expect(llamadas(fn, 'GET', '/api/crm/oportunidades')).toHaveLength(1);
  });

  it('asks for the medium when entering Contactado without one, and the card does not move until it is saved', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Equipos de protección para obra', 'Contactado');
    const dialogo = screen.getByRole('dialog', { name: /Cómo lo contactaste/ });
    expect(within(dialogo).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['llamada', 'correo', 'whatsapp']);
    expect(within(columna('Por contactar')).getByText('Equipos de protección para obra')).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);

    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Elige el medio de contacto');
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);

    fireEvent.click(within(dialogo).getByRole('radio', { name: /WhatsApp/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(columna('Contactado')).getByText('Equipos de protección para obra')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([
      { url: '/api/crm/oportunidades/o-1/etapa', body: { etapa: 'contactado', medio: 'whatsapp' } },
    ]);
    expect(within(tarjeta('Equipos de protección para obra')).getByRole('button', { name: /Medio: WhatsApp/ })).toBeInTheDocument();
  });

  it.each([
    ['Cancelar', () => fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('%s on the medium dialog leaves the oportunidad where it was and sends nothing', async (_n, cerrar) => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Equipos de protección para obra', 'Contactado');
    cerrar();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(columna('Por contactar')).getByText('Equipos de protección para obra')).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);
  });

  it('going back to Por contactar sends {etapa} and the card loses its medium chip', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Exámenes de ingreso', 'Por contactar');
    await waitFor(() => expect(within(columna('Por contactar')).getByText('Exámenes de ingreso')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /etapa$/)[0]?.body).toEqual({ etapa: 'por_contactar' });
    expect(within(tarjeta('Exámenes de ingreso')).queryByText(/Medio:/)).toBeNull();
  });

  it('asks for the reason when entering Perdida: category required, details by category, then moves', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Campaña de vacunación 2025', 'Perdida');
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
    expect(within(columna('Ganada')).getByText('Campaña de vacunación 2025')).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText(/Precio que les ofrecimos/), { target: { value: 'S/ 7,000' } });
    fireEvent.change(within(dialogo).getByLabelText(/Notas/), { target: { value: 'Muy caro' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(columna('Perdida')).getByText('Campaña de vacunación 2025')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([
      { url: '/api/crm/oportunidades/o-4/etapa', body: { etapa: 'perdida', motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: 'Muy caro' } } },
    ]);
    expect(within(tarjeta('Campaña de vacunación 2025')).getByText(/Ofrecimos: S\/ 7,000/)).toBeInTheDocument();
  });

  it('the supplier field is optional, "Otro" needs a detail, and the fields change with the category', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Campaña de vacunación 2025', 'Perdida');
    const dialogo = screen.getByRole('dialog', { name: /Motivo de la pérdida/ });
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Otro' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Cuéntanos el motivo');
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Ya tienen proveedor' }));
    expect(within(dialogo).queryByLabelText(/Cuéntanos el motivo/)).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(1));
    expect(llamadas(fn, 'PATCH', /etapa$/)[0]?.body).toEqual({
      etapa: 'perdida',
      motivo: { categoria: 'proveedor', detalle1: null, detalle2: null, notas: null },
    });
  });

  it('Cancelar on the reason dialog leaves the oportunidad and sends nothing', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Campaña de vacunación 2025', 'Perdida');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(columna('Ganada')).getByText('Campaña de vacunación 2025')).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);
  });

  it('leaving Perdida removes the reason from the card', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Ergonomía industrial', 'Ganada');
    await waitFor(() => expect(within(columna('Ganada')).getByText('Ergonomía industrial')).toBeInTheDocument());
    expect(within(tarjeta('Ergonomía industrial')).queryByText(/Ya tienen proveedor/)).toBeNull();
  });

  it('dragging to Ganada needs no dialog and the card loses its próxima acción', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    expect(within(tarjeta('Ergonomía para planta')).getByText(/^(Próximo|Vencida)/)).toBeInTheDocument();
    soltar('Ergonomía para planta', 'Ganada');
    await waitFor(() => expect(within(columna('Ganada')).getByText('Ergonomía para planta')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([{ url: '/api/crm/oportunidades/o-5/etapa', body: { etapa: 'ganada' } }]);
    expect(within(tarjeta('Ergonomía para planta')).queryByText(/^(Próximo|Vencida)/)).toBeNull();
  });

  it('the arrow into Ganada also needs no dialog', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    mover('Vigilancia epidemiológica', 'Ganada');
    await waitFor(() => expect(within(columna('Ganada')).getByText('Vigilancia epidemiológica')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the oportunidad where it was and shows the server message when the move is rejected', async () => {
    mockApi({ etapa: () => ({ status: 400, body: { success: false, error: 'Elige cómo se contactó a la empresa' } }) });
    render(<CrmBoard />);
    await cargado();
    mover('Exámenes de ingreso', 'En seguimiento');
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Elige cómo se contactó a la empresa'));
    expect(within(columna('Contactado')).getByText('Exámenes de ingreso')).toBeInTheDocument();
  });

  it('keeps the oportunidad and shows a generic message when the request fails', async () => {
    const fn = mockApi();
    fn.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') throw new Error('network');
      return url === '/api/crm/sectores'
        ? ({ ok: true, status: 200, json: async () => ({ success: true, sectores: [] }) } as Response)
        : url === '/api/crm/oportunidades'
          ? ({ ok: true, status: 200, json: async () => ({ success: true, oportunidades: OPORTUNIDADES }) } as Response)
          : ({ ok: true, status: 200, json: async () => ({ success: true, empresas: LISTA }) } as Response);
    });
    render(<CrmBoard />);
    await cargado();
    mover('Exámenes de ingreso', 'En seguimiento');
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo mover la oportunidad'));
    expect(within(columna('Contactado')).getByText('Exámenes de ingreso')).toBeInTheDocument();
    expect(llamadas(fn, 'GET', '/api/crm/oportunidades')).toHaveLength(1);
  });

  it('dragging onto a column follows the same rules: Contactado asks for the medium', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    soltar('Equipos de protección para obra', 'Contactado');
    expect(screen.getByRole('dialog', { name: /Cómo lo contactaste/ })).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /etapa$/)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    soltar('Exámenes de ingreso', 'Cotizado');
    await waitFor(() => expect(within(columna('Cotizado')).getByText('Exámenes de ingreso')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /etapa$/)).toEqual([{ url: '/api/crm/oportunidades/o-3/etapa', body: { etapa: 'cotizado' } }]);
  });

  it('dropping on the column the oportunidad is already in does nothing', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    soltar('Exámenes de ingreso', 'Contactado');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(llamadas(fn, 'PATCH', /./)).toHaveLength(0);
  });
});

describe('CrmBoard — editar medio y motivo desde la tarjeta', () => {
  it('the medium chip opens the dialog with the current medium selected and PATCHes /seguimiento without moving', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta('Exámenes de ingreso')).getByRole('button', { name: /Medio: Llamada/ }));
    const dialogo = screen.getByRole('dialog', { name: /Editar medio de contacto/ });
    expect(within(dialogo).getByRole('radio', { name: /Llamada/ })).toBeChecked();
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Correo/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(tarjeta('Exámenes de ingreso')).getByRole('button', { name: /Medio: Correo/ })).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /seguimiento$/)).toEqual([
      { url: '/api/crm/oportunidades/o-3/seguimiento', body: { medio: 'correo' } },
    ]);
    expect(within(columna('Contactado')).getByText('Exámenes de ingreso')).toBeInTheDocument();
  });

  it('"Editar motivo" opens the reason dialog prefilled and PATCHes /seguimiento with the new reason', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta('Ergonomía industrial')).getByRole('button', { name: /Editar motivo/ }));
    const dialogo = screen.getByRole('dialog', { name: /Motivo de la pérdida/ });
    expect(within(dialogo).getByRole('radio', { name: 'Ya tienen proveedor' })).toBeChecked();
    expect(within(dialogo).getByLabelText(/¿Qué proveedor tienen/)).toHaveValue('Distribuidora Norte S.A.C.');
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Precio' }));
    fireEvent.change(within(dialogo).getByLabelText(/Precio que les ofrecimos/), { target: { value: 'S/ 9,000' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(tarjeta('Ergonomía industrial')).getByText(/Ofrecimos: S\/ 9,000/)).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /seguimiento$/)[0]?.body).toEqual({
      motivo: { categoria: 'precio', detalle1: 'S/ 9,000', detalle2: null, notas: null },
    });
    expect(within(columna('Perdida')).getByText('Ergonomía industrial')).toBeInTheDocument();
  });

  it('the buttons inside a card do not open the empresa ficha', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta('Exámenes de ingreso')).getByRole('button', { name: /Medio: Llamada/ }));
    expect(screen.queryByTestId('detalle-mock')).toBeNull();
  });
});

describe('CrmBoard — datos', () => {
  it('an empresa without oportunidades renders no card and does not crash the board', async () => {
    mockApi({ lista: { status: 200, body: { success: true, empresas: [...LISTA, empresa({ idEmpresa: 'e-9', razonSocial: 'Sin negocios S.A.' })] } } });
    render(<CrmBoard />);
    await cargado();
    expect(screen.queryByText('Sin negocios S.A.')).toBeNull();
    expect(screen.getByText('Constructora Andina S.A.C.')).toBeInTheDocument();
  });

  it('an oportunidad whose empresa is missing from the list is skipped quietly', async () => {
    mockApi({
      oportunidades: {
        status: 200,
        body: { success: true, oportunidades: [...OPORTUNIDADES, oportunidad({ idOportunidad: 'o-99', idEmpresa: 'e-404' })] },
      },
    });
    render(<CrmBoard />);
    await cargado();
    expect(screen.getByText('Equipos de protección para obra')).toBeInTheDocument();
    expect(within(columna('Por contactar')).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7);
  });

  it('clicking the card body opens the ficha of its empresa', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta('Exámenes de ingreso')).getByText('Textiles Pacífico S.A.C.'));
    expect(await screen.findByTestId('detalle-mock')).toHaveAttribute('aria-label', 'Textiles Pacífico S.A.C.');
  });
});
