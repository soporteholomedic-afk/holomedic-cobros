import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import type { Interaccion } from '../../../domain/entities';
import { CrmBoard } from '../CrmBoard';
import { empresa, json, llamadas, mockApi, type Api, type Respuesta } from './crmFixtures';

const TEXTILES = 'Textiles Pacífico S.A.C.';
const HISTORIAL_E3 = '/api/crm/empresas/e-3/historial';

function entrada(over: Partial<Interaccion> = {}): Interaccion {
  return {
    idInteraccion: 1,
    idEmpresa: 'e-3',
    fecha: '2026-10-31T15:15:00.000Z',
    idUsuario: 'u-1',
    nombreUsuario: 'Scott Palomino',
    direccion: 'saliente',
    medio: 'llamada',
    medioOtro: null,
    resultado: 'conversamos',
    resumen: null,
    ...over,
  };
}

type Rutas = (url: string, method: string, body: Record<string, unknown>) => Respuesta | Promise<Respuesta> | undefined;

/** The shared fake of the board plus the routes that do not exist there yet. */
function conRutas(rutas: Rutas, api: Api = {}) {
  mockApi(api);
  const base = global.fetch;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const r = await rutas(url, method, body);
    return r ? json(r) : base(url, init);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const historial = (interacciones: Interaccion[]): Respuesta => ({ status: 200, body: { success: true, interacciones } });

function abrir(nombre: string): HTMLElement {
  const card = screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;
  fireEvent.click(within(card).getByRole('heading', { level: 3 }));
  return screen.getByRole('dialog', { name: nombre });
}

async function cargado() {
  await screen.findByText('Constructora Andina S.A.C.');
}

const seccion = (panel: HTMLElement) =>
  within(within(panel).getByRole('heading', { name: /^Historial/ }).closest('section') as HTMLElement);

beforeEach(() => {
  // 11:00 in Lima on Saturday 31 Oct 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T16:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Historial — carga', () => {
  it('asks for the history of the opened empresa on open and shows a loading state meanwhile', async () => {
    let soltar: (r: Respuesta) => void = () => undefined;
    const espera = new Promise<Respuesta>((r) => (soltar = r));
    const fn = conRutas((url) => (url === HISTORIAL_E3 ? espera : undefined));
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(within(panel).getByRole('status')).toHaveTextContent('Cargando historial…');
    expect(llamadas(fn, 'GET', HISTORIAL_E3)).toHaveLength(1);
    soltar(historial([entrada()]));
    expect(await within(panel).findByRole('heading', { name: 'Historial (1)' })).toBeInTheDocument();
    expect(within(panel).queryByText('Cargando historial…')).toBeNull();
  });

  it('shows "Historial (N)" and the entries in the order the server sends them (newest first)', async () => {
    conRutas((url) =>
      url === HISTORIAL_E3
        ? historial([
            entrada({ idInteraccion: 3, resumen: 'Tercera' }),
            entrada({ idInteraccion: 2, resumen: 'Segunda', fecha: '2026-10-30T21:40:00.000Z' }),
            entrada({ idInteraccion: 1, resumen: 'Primera', fecha: '2026-10-28T21:40:00.000Z' }),
          ])
        : undefined,
    );
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(await within(panel).findByRole('heading', { name: 'Historial (3)' })).toBeInTheDocument();
    const items = seccion(panel).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('p')?.textContent)).toEqual(['Tercera', 'Segunda', 'Primera']);
  });

  it('shows the empty state', async () => {
    conRutas((url) => (url === HISTORIAL_E3 ? historial([]) : undefined));
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(await within(panel).findByText('Todavía no hay contactos registrados.')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Historial (0)' })).toBeInTheDocument();
  });

  it('shows an error with "Reintentar" that loads the history again', async () => {
    let intentos = 0;
    const fn = conRutas((url) => {
      if (url !== HISTORIAL_E3) return undefined;
      intentos++;
      return intentos === 1 ? { status: 500, body: { success: false, error: 'boom' } } : historial([entrada({ resumen: 'Ya cargó' })]);
    });
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No se pudo cargar el historial.');
    fireEvent.click(within(panel).getByRole('button', { name: 'Reintentar' }));
    expect(await within(panel).findByText('Ya cargó')).toBeInTheDocument();
    expect(within(panel).queryByRole('alert')).toBeNull();
    expect(llamadas(fn, 'GET', HISTORIAL_E3)).toHaveLength(2);
  });

  it('treats a network failure as the same error state', async () => {
    mockApi();
    const base = global.fetch;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === HISTORIAL_E3) throw new Error('offline');
      return base(url, init);
    }) as unknown as typeof fetch;
    render(<CrmBoard />);
    await cargado();
    expect(await within(abrir(TEXTILES)).findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('loads the history of the other empresa when the detail switches to another card', async () => {
    const fn = conRutas((url) => (url.endsWith('/historial') ? historial([]) : undefined));
    render(<CrmBoard />);
    await cargado();
    abrir(TEXTILES);
    await waitFor(() => expect(llamadas(fn, 'GET', HISTORIAL_E3)).toHaveLength(1));
    abrir('Minera Los Tres Picos S.A.');
    await waitFor(() => expect(llamadas(fn, 'GET', '/api/crm/empresas/e-2/historial')).toHaveLength(1));
  });

  it('reloads when the updatedAt of the empresa changes while the panel is open', async () => {
    let n = 0;
    const fn = conRutas(
      (url) => {
        if (url !== HISTORIAL_E3) return undefined;
        n++;
        return historial(n === 1 ? [entrada({ resumen: 'Antes' })] : [entrada({ idInteraccion: 2, resumen: 'Nuevo' }), entrada({ resumen: 'Antes' })]);
      },
      {
        etapa: (id) => ({
          status: 200,
          body: { success: true, empresa: empresa({ idEmpresa: id, razonSocial: TEXTILES, etapa: 'en_seguimiento', medio: 'llamada', updatedAt: '2026-10-31T15:59:00.000Z' }) },
        }),
      },
    );
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(await within(panel).findByRole('heading', { name: 'Historial (1)' })).toBeInTheDocument();
    const card = screen.getByRole('heading', { level: 3, name: TEXTILES }).closest('article') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Mover .* a En seguimiento/ }));
    expect(await within(panel).findByRole('heading', { name: 'Historial (2)' })).toBeInTheDocument();
    expect(within(panel).getByText('Nuevo')).toBeInTheDocument();
    expect(llamadas(fn, 'GET', HISTORIAL_E3)).toHaveLength(2);
  });
});

describe('Historial — cada entrada', () => {
  it.each([
    ['conversamos', 'saliente', 'Conversamos'],
    ['no_contesto', 'saliente', 'No contestó'],
    ['deje_mensaje', 'saliente', 'Dejé mensaje'],
    ['pendiente', 'entrante', 'Nos contactó · falta responder'],
    ['respondido', 'entrante', 'Nos contactó · ya le respondimos'],
  ] as const)('writes the result %s as «%s»', async (resultado, direccion, texto) => {
    conRutas((url) => (url === HISTORIAL_E3 ? historial([entrada({ resultado, direccion })]) : undefined));
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    const item = (await seccion(panel).findAllByRole('listitem'))[0]!;
    expect(item.querySelector('b')).toHaveTextContent(texto);
    expect(item.querySelector('b')?.textContent).toBe(texto);
  });

  it('writes the direction with the medium, using the free text when the medium is "otro"', async () => {
    conRutas((url) =>
      url === HISTORIAL_E3
        ? historial([
            entrada({ idInteraccion: 3, direccion: 'entrante', medio: 'otro', medioOtro: 'Visita a la clínica', resultado: 'pendiente' }),
            entrada({ idInteraccion: 2, direccion: 'saliente', medio: 'whatsapp' }),
            entrada({ idInteraccion: 1, direccion: 'entrante', medio: 'correo', resultado: 'respondido' }),
          ])
        : undefined,
    );
    render(<CrmBoard />);
    await cargado();
    const items = await seccion(abrir(TEXTILES)).findAllByRole('listitem');
    expect(within(items[0]!).getByText('Nos contactó · Visita a la clínica')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Contactamos · WhatsApp')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Nos contactó · Correo')).toBeInTheDocument();
  });

  it('shows the medium icon colored by the medium style, with an arrow in the direction line', async () => {
    conRutas((url) => (url === HISTORIAL_E3 ? historial([entrada({ medio: 'whatsapp' })]) : undefined));
    render(<CrmBoard />);
    await cargado();
    const item = (await seccion(abrir(TEXTILES)).findAllByRole('listitem'))[0]!;
    const icono = item.querySelector('[data-medio-icono]') as HTMLElement;
    expect(icono.className).toMatch(/emerald/);
    expect(icono.querySelector('svg')).not.toBeNull();
    expect(within(item).getByText('Contactamos · WhatsApp').querySelector('svg')).not.toBeNull();
  });

  it('writes the date as «Hoy», «Ayer» or weekday day month, in Lima time, followed by who registered it', async () => {
    conRutas((url) =>
      url === HISTORIAL_E3
        ? historial([
            entrada({ idInteraccion: 4, fecha: '2026-10-31T15:15:00.000Z', nombreUsuario: 'Scott Palomino' }),
            // 03:00 UTC is still the previous evening in Lima.
            entrada({ idInteraccion: 3, fecha: '2026-10-31T03:00:00.000Z', nombreUsuario: 'Laura Ríos' }),
            entrada({ idInteraccion: 2, fecha: '2026-10-30T21:40:00.000Z', nombreUsuario: 'Karina Soto' }),
            entrada({ idInteraccion: 1, fecha: '2026-10-28T21:40:00.000Z', nombreUsuario: 'Karina Soto' }),
          ])
        : undefined,
    );
    render(<CrmBoard />);
    await cargado();
    const items = await seccion(abrir(TEXTILES)).findAllByRole('listitem');
    const pie = (i: number) => items[i]!.querySelector('small')?.textContent;
    expect(pie(0)).toBe(' · Hoy 10:15 · Scott Palomino');
    expect(pie(1)).toBe(' · Ayer 22:00 · Laura Ríos');
    expect(pie(2)).toBe(' · Ayer 16:40 · Karina Soto');
    expect(pie(3)).toBe(' · mié 28 oct · 16:40 · Karina Soto');
  });

  it('shows the summary paragraph only when there is one', async () => {
    conRutas((url) =>
      url === HISTORIAL_E3
        ? historial([entrada({ idInteraccion: 2, resumen: 'Pidió cotización' }), entrada({ idInteraccion: 1, resumen: null })])
        : undefined,
    );
    render(<CrmBoard />);
    await cargado();
    const items = await seccion(abrir(TEXTILES)).findAllByRole('listitem');
    expect(within(items[0]!).getByText('Pidió cotización').tagName).toBe('P');
    expect(items[1]!.querySelector('p')).toBeNull();
  });
});
