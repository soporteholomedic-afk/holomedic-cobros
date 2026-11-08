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
import { empresa, json, mockApi, oportunidad, type Respuesta } from './crmFixtures';

const NOMBRE = 'Monitoreo ocupacional 2026';
const card = (nombre: string) => screen.getByText(nombre).closest('article') as HTMLElement;

const OPORTUNIDADES_3 = [
  oportunidad({ idOportunidad: 'o-1', idEmpresa: 'e-1', nombre: 'Equipos de protección para obra' }),
  oportunidad({
    idOportunidad: 'o-2',
    idEmpresa: 'e-2',
    nombre: NOMBRE,
    etapa: 'contactado',
    medio: 'otro',
    medioOtro: 'Feria Expomina',
    intentosSinRespuesta: 3,
  }),
];

const LISTA_3 = [empresa({ idEmpresa: 'e-1', ruc: null }), empresa({ idEmpresa: 'e-2', razonSocial: 'Minera Los Tres Picos S.A.', ruc: '20601234567', sector: 'Minería y Energía' })];

/** mockApi plus the suggestion endpoint wrapped for assertions. */
function conSugerencia(respuesta: (accion: string) => Respuesta, oportunidades = OPORTUNIDADES_3) {
  const base = mockApi({
    lista: { status: 200, body: { success: true, empresas: LISTA_3 } },
    oportunidades: { status: 200, body: { success: true, oportunidades } },
  });
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (/\/sugerencia$/.test(url)) {
      const body = JSON.parse(String(init?.body)) as { accion: string };
      return json(respuesta(body.accion));
    }
    return base(url, init);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const posts = (fn: ReturnType<typeof conSugerencia>) =>
  fn.mock.calls
    .filter(([u]) => /\/sugerencia$/.test(u))
    .map(([u, i]) => ({ url: u, method: i?.method, headers: i?.headers, body: JSON.parse(String(i?.body)) }));

beforeEach(() => {
  Object.values(toastMock).forEach((m) => m.mockClear());
});
afterEach(() => vi.restoreAllMocks());

describe('CrmBoard — sugerencia de Perdida (S2)', () => {
  it('"Pasar a Perdida" posts {accion:"perder"}, replaces the card and shows the toast', async () => {
    const fn = conSugerencia(() => ({
      status: 200,
      body: {
        success: true,
        oportunidad: {
          ...OPORTUNIDADES_3[1],
          etapa: 'perdida',
          intentosSinRespuesta: 3,
          motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null },
        },
      },
    }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    fireEvent.click(within(card(NOMBRE)).getByRole('button', { name: 'Pasar a Perdida' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(`${NOMBRE} pasó a «Perdida» con el motivo «No contestan».`));
    const [p] = posts(fn);
    expect(p.url).toBe('/api/crm/oportunidades/o-2/sugerencia');
    expect(p.method).toBe('POST');
    expect(p.body).toEqual({ accion: 'perder' });
    expect(p.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(within(screen.getByRole('region', { name: 'Perdida' })).getByText(NOMBRE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Seguir intentando" posts {accion:"seguir"} and the banner disappears', async () => {
    const fn = conSugerencia(() => ({
      status: 200,
      body: { success: true, oportunidad: { ...OPORTUNIDADES_3[1], sugerenciaDescartadaEn: 3 } },
    }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    fireEvent.click(within(card(NOMBRE)).getByRole('button', { name: 'Seguir intentando' }));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Sugerencia ocultada. Vuelve a aparecer si suma otro intento sin respuesta.'),
    );
    expect(posts(fn)[0].body).toEqual({ accion: 'seguir' });
    expect(within(card(NOMBRE)).queryByRole('group')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a 400 (the suggestion no longer applies) shows the server error and leaves the card unchanged', async () => {
    conSugerencia(() => ({ status: 400, body: { success: false, error: 'La sugerencia ya no corresponde a esta tarjeta.' } }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    fireEvent.click(within(card(NOMBRE)).getByRole('button', { name: 'Pasar a Perdida' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('La sugerencia ya no corresponde a esta tarjeta.'));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(within(screen.getByRole('region', { name: 'Contactado' })).getByText(NOMBRE)).toBeInTheDocument();
    expect(within(card(NOMBRE)).getByRole('group')).toBeInTheDocument();
  });

  it('a network failure shows a generic error', async () => {
    const base = mockApi({ oportunidades: { status: 200, body: { success: true, oportunidades: OPORTUNIDADES_3 } } });
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (/\/sugerencia$/.test(url)) throw new Error('offline');
      return base(url, init);
    }) as unknown as typeof fetch;
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    fireEvent.click(within(card(NOMBRE)).getByRole('button', { name: 'Seguir intentando' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo guardar la sugerencia'));
  });
});

describe('CrmBoard — tarjeta (S2, S6, S8)', () => {
  it('shows Falta RUC and the free medium text', async () => {
    conSugerencia(() => ({ status: 200, body: {} }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    expect(within(card('Equipos de protección para obra')).getByText('Falta RUC')).toBeInTheDocument();
    expect(within(card('Equipos de protección para obra')).queryByText(/^RUC /)).toBeNull();
    expect(within(card(NOMBRE)).getByRole('button', { name: 'Medio: Feria Expomina' })).toBeInTheDocument();
  });

  it('clicking the card body opens the ficha of its empresa', async () => {
    conSugerencia(() => ({ status: 200, body: {} }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    fireEvent.click(within(card(NOMBRE)).getByText('Minera Los Tres Picos S.A.'));
    expect(await screen.findByTestId('detalle-mock')).toHaveAttribute('aria-label', 'Minera Los Tres Picos S.A.');
  });

  it('an oportunidad whose empresa is missing from the list is skipped quietly', async () => {
    conSugerencia(() => ({ status: 200, body: {} }), [
      ...OPORTUNIDADES_3,
      oportunidad({ idOportunidad: 'o-9', idEmpresa: 'e-404', nombre: 'Huérfana' }),
    ]);
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    expect(screen.queryByText('Huérfana')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Contactado' })).getByText(NOMBRE)).toBeInTheDocument();
  });
});
