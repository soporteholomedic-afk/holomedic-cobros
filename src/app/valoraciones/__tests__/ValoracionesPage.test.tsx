import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeRepFacturacion } from '@/features/valoraciones/domain/fixtures';

import ValoracionesPage from '../page';

/**
 * Page-level integration test (also the U2 runtime-harness proxy — the
 * dev server is not started in apply mode). Mocks `fetch` at the module
 * boundary and drives the real page: lookups on mount, Consultar →
 * `/api/valoraciones/sigla`, grouped rows rendered.
 */

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function mockFetchRouteBy(handler: (url: string) => Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(handler(input.toString())),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ValoracionesPage', () => {
  it('renders the filter panel and loads the mount-time lookups', async () => {
    const fetchMock = mockFetchRouteBy((url) => {
      if (url.includes('/lookups/sedes')) {
        return jsonResponse({ resultados: [{ codSed: 1, nomSed: 'SEDE SURQUILLO' }] });
      }
      if (url.includes('/lookups/tipos-trabajador')) {
        return jsonResponse({
          resultados: [
            { codTip: 620001, desTip: 'OBRERO' },
            { codTip: 620002, desTip: 'EMPLEADO' },
          ],
        });
      }
      return jsonResponse({ resultados: [] });
    });

    render(<ValoracionesPage />);

    // Page shell + the 11-filter panel render immediately.
    expect(screen.getByRole('heading', { name: 'Valorizaciones' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha inicio')).toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toBeInTheDocument();
    // Slice 2: consolidado is client-gated (disabled until a client is picked).
    expect(screen.getByLabelText('Consolidado')).toBeDisabled();

    // Mount-time lookups resolve after the debounce.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/valoraciones/lookups/sedes'),
    );
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'SEDE SURQUILLO' })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'OBRERO' })).toBeInTheDocument(),
    );
  });

  it('queries SIGLA on Consultar and renders the grouped results', async () => {
    const fetchMock = mockFetchRouteBy((url) => {
      if (url.includes('/api/valoraciones/sigla')) {
        return jsonResponse({ resultados: [makeRepFacturacion()] });
      }
      return jsonResponse({ resultados: [] });
    });

    render(<ValoracionesPage />);

    fireEvent.click(screen.getByRole('button', { name: /Consultar/ }));

    await waitFor(() => expect(screen.getByText('EMPRESA DEMO S.A.C.')).toBeInTheDocument());
    expect(screen.getByText('1 registros · 1 empresas')).toBeInTheDocument();

    const siglaCall = fetchMock.mock.calls
      .map((call) => call[0] as string)
      .find((url) => url.includes('/api/valoraciones/sigla'));
    expect(siglaCall).toBeDefined();
    const params = new URLSearchParams((siglaCall ?? '').split('?')[1]);
    expect(params.get('codMon')).toBe('1'); // SOLES default
    expect(params.get('indFac')).toBe('0'); // No Facturados default
  });

  it('opens the detail modal for a group and closes it', async () => {
    mockFetchRouteBy((url) => {
      if (url.includes('/api/valoraciones/sigla')) {
        return jsonResponse({ resultados: [makeRepFacturacion()] });
      }
      return jsonResponse({ resultados: [] });
    });

    render(<ValoracionesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Consultar/ }));

    const empresaRow = await screen.findByText('EMPRESA DEMO S.A.C.');
    fireEvent.click(empresaRow);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Detalle de Valorizaciones')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // ---- Slice 2: client → destinos + consolidado flow (Q-R5/Q-R6) ----

  it('selecting a client enables consolidado and queries the consolidado endpoint', async () => {
    const filas = [
      {
        codCli: 55,
        nomCom: 'EMPRESA DEMO',
        codDes: 101,
        desDes: 'SEDE NORTE',
        desTCh: 'PREOCUPACIONAL',
        canEva: 5,
        importe: 1062,
        venta: 900,
      },
    ];
    const totales = [
      { nomCom: 'EMPRESA DEMO', desDes: 'SEDE NORTE', codDes: 101, subtotal: 1000, igv: 180, total: 1180 },
    ];
    const fetchMock = mockFetchRouteBy((url) => {
      if (url.includes('/lookups/clientes')) {
        return jsonResponse({ resultados: [{ codCli: 55, nomCom: 'EMPRESA DEMO', nroRuc: '20512345678' }] });
      }
      if (url.includes('/lookups/destinos')) {
        return jsonResponse({ resultados: [{ codDes: 101, desDes: 'SEDE NORTE' }] });
      }
      if (url.includes('/api/valoraciones/sigla')) {
        return jsonResponse({ filas, totales });
      }
      return jsonResponse({ resultados: [] });
    });

    render(<ValoracionesPage />);

    // Consolidado is disabled before a client is chosen.
    expect(screen.getByLabelText('Consolidado')).toBeDisabled();

    // Pick the client from the autocomplete (the option's button holds the
    // click handler — the li is only the ARIA option).
    const clienteInput = screen.getByLabelText('Cliente');
    fireEvent.change(clienteInput, { target: { value: 'EMPRESA' } });
    const opcion = await screen.findByRole('option', { name: /EMPRESA DEMO/ }, { timeout: 3000 });
    fireEvent.click(opcion.querySelector('button') ?? opcion);

    // Destinos load for the client and Consolidado becomes enabled.
    await waitFor(
      () => expect(screen.getByRole('option', { name: 'SEDE NORTE' })).toBeInTheDocument(),
      { timeout: 3000 },
    );
    const consolidado = await screen.findByLabelText('Consolidado');
    await waitFor(() => expect(consolidado).toBeEnabled());
    fireEvent.click(consolidado);
    expect((consolidado as HTMLInputElement).checked).toBe(true);

    // Consultar → consolidado endpoint + table mode.
    fireEvent.click(screen.getByRole('button', { name: /Consultar/ }));

    await waitFor(
      () => expect(screen.getByText('Consolidado por destino')).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByText('PREOCUPACIONAL')).toBeInTheDocument();

    const siglaCall = fetchMock.mock.calls
      .map((call) => call[0] as string)
      .find((url) => url.includes('/api/valoraciones/sigla'));
    expect(siglaCall).toBeDefined();
    const params = new URLSearchParams((siglaCall ?? '').split('?')[1]);
    expect(params.get('consolidado')).toBe('true');
    expect(params.get('codCli')).toBe('55');
  });
});
