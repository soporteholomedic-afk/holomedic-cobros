import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import type { Empresa } from '../../../domain/entities';
import { CrmBoard } from '../CrmBoard';
import { empresa, json, mockApi, type Respuesta } from './crmFixtures';

const NOMBRE = 'Minera Los Tres Picos S.A.';
const card = (nombre: string) => screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;

const LISTA_3 = [
  empresa({ idEmpresa: 'e-1', ruc: null, medioOtro: null }),
  empresa({
    idEmpresa: 'e-2',
    razonSocial: NOMBRE,
    etapa: 'contactado',
    medio: 'otro',
    medioOtro: 'Feria Expomina',
    intentosSinRespuesta: 3,
    contactos: [{ nombre: 'Jorge Salazar', telefono: '954 112 308', correo: null }],
  }),
];

/** mockApi plus the suggestion endpoint, which the shared fixture does not know yet. */
function conSugerencia(respuesta: (accion: string) => Respuesta, lista: Empresa[] = LISTA_3) {
  const base = mockApi({ lista: { status: 200, body: { success: true, empresas: lista } } });
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

describe('CrmBoard — sugerencia de Perdido (S2)', () => {
  it('"Pasar a Perdido" posts {accion:"perder"}, replaces the card and shows the toast', async () => {
    const fn = conSugerencia(() => ({
      status: 200,
      body: {
        success: true,
        empresa: { ...LISTA_3[1], etapa: 'perdido', intentosSinRespuesta: 3, motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null } },
      },
    }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    fireEvent.click(within(card(NOMBRE)).getByRole('button', { name: 'Pasar a Perdido' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(`${NOMBRE} pasó a «Perdido» con el motivo «No contestan».`));
    const [p] = posts(fn);
    expect(p.url).toBe('/api/crm/empresas/e-2/sugerencia');
    expect(p.method).toBe('POST');
    expect(p.body).toEqual({ accion: 'perder' });
    expect(p.headers).toEqual({ 'Content-Type': 'application/json' });
    const perdido = screen.getByRole('region', { name: 'Perdido' });
    expect(within(perdido).getByText(NOMBRE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Seguir intentando" posts {accion:"seguir"} and the banner disappears', async () => {
    const fn = conSugerencia(() => ({
      status: 200,
      body: { success: true, empresa: { ...LISTA_3[1], sugerenciaDescartadaEn: 3 } },
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
    fireEvent.click(within(card(NOMBRE)).getByRole('button', { name: 'Pasar a Perdido' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('La sugerencia ya no corresponde a esta tarjeta.'));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(within(screen.getByRole('region', { name: 'Contactado' })).getByText(NOMBRE)).toBeInTheDocument();
    expect(within(card(NOMBRE)).getByRole('group')).toBeInTheDocument();
  });

  it('a network failure shows a generic error', async () => {
    const base = mockApi({ lista: { status: 200, body: { success: true, empresas: LISTA_3 } } });
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

describe('CrmBoard — tarjeta (S4, S6, S8)', () => {
  it('shows Falta RUC and the free medium text, and the search matches the medium text', async () => {
    conSugerencia(() => ({ status: 200, body: {} }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    expect(within(card('Constructora Andina S.A.C.')).getByText('Falta RUC')).toBeInTheDocument();
    expect(within(card(NOMBRE)).getByRole('button', { name: 'Medio: Feria Expomina' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar empresa o contacto' }), { target: { value: 'expomina' } });
    expect(screen.getByText(NOMBRE)).toBeInTheDocument();
    expect(screen.queryByText('Constructora Andina S.A.C.')).toBeNull();
  });

  it('clicking the card body still opens the detail', async () => {
    conSugerencia(() => ({ status: 200, body: {} }));
    render(<CrmBoard />);
    await screen.findByText(NOMBRE);
    fireEvent.click(within(card(NOMBRE)).getByText('Jorge Salazar'));
    expect(await screen.findByRole('dialog', { name: NOMBRE })).toBeInTheDocument();
  });
});
