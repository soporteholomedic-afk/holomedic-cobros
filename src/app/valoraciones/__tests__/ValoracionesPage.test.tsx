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
    expect(screen.getByLabelText('Consolidado (próximamente)')).toBeDisabled();

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
});
