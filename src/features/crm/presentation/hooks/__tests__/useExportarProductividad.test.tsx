import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildProductividadExcelPath,
  useExportarProductividad,
} from '../useExportarProductividad';
import type { Periodo } from '../../periodo';

/**
 * Hook contract for the "Exportar Excel" button (tasks pr17/WU2, spec
 * G6 "exportar Excel", useExportarValoraciones precedent): GETs
 * `/api/crm/productividad/excel?desde=&hasta=` for the CURRENT period
 * (the scope is the server's decision — no scope parameter exists),
 * streams the response into a blob download named by the server's
 * Content-Disposition, surfaces API errors verbatim, and exposes the
 * in-flight state so the button can disable itself.
 */

const PERIODO: Periodo = { desde: '2026-09-01', hasta: '2026-09-30' };

/** Probe component exposing the hook API. */
function Probe({ periodo }: { periodo: Periodo }) {
  const { exportar, exportando, error } = useExportarProductividad();
  return (
    <div>
      <button type="button" onClick={() => exportar(periodo)} disabled={exportando}>
        Exportar Excel
      </button>
      {exportando && <p>Exportando…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function stubDownload(): ReturnType<typeof vi.fn> {
  const clickMock = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickMock(this);
  });
  return clickMock;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildProductividadExcelPath (pure — no mocks)', () => {
  it('encodes the selected period as query params on the excel endpoint', () => {
    expect(buildProductividadExcelPath('2026-09-01', '2026-09-30')).toBe(
      '/api/crm/productividad/excel?desde=2026-09-01&hasta=2026-09-30',
    );
  });

  it('keeps single-digit months/days verbatim (the server re-validates)', () => {
    expect(buildProductividadExcelPath('2026-02-01', '2026-02-28')).toBe(
      '/api/crm/productividad/excel?desde=2026-02-01&hasta=2026-02-28',
    );
  });
});

describe('useExportarProductividad', () => {
  it('GETs the excel endpoint with the current period and triggers a blob download', async () => {
    const clickMock = stubDownload();
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="productividad_2026-09-01_2026-09-30.xlsx"',
        },
      }),
    );

    render(<Probe periodo={PERIODO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/crm/productividad/excel?desde=2026-09-01&hasta=2026-09-30');
    expect(init.method).toBe('GET');
    // The anchor downloads under the server-provided filename.
    const anchor = clickMock.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe('productividad_2026-09-01_2026-09-30.xlsx');
  });

  it('falls back to a productividad.xlsx name without a disposition header', async () => {
    const clickMock = stubDownload();
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 200 }),
    );

    render(<Probe periodo={PERIODO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    const anchor = clickMock.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe('productividad.xlsx');
  });

  it('marks the export in flight only while it runs', async () => {
    stubDownload();
    let resolveFetch: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<Probe periodo={PERIODO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    expect(await screen.findByText('Exportando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeDisabled();

    resolveFetch(new Response(new Uint8Array([1]), { status: 200 }));
    await waitFor(() =>
      expect(screen.queryByText('Exportando…')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
  });

  it('surfaces the API error message verbatim on a non-OK response', async () => {
    stubDownload();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: '"desde" y "hasta" son fechas obligatorias con formato AAAA-MM-DD',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 },
      ),
    );

    render(<Probe periodo={PERIODO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '"desde" y "hasta" son fechas obligatorias con formato AAAA-MM-DD',
      ),
    );
  });

  it('reports a network failure as a user-safe error (no throw)', async () => {
    stubDownload();
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<Probe periodo={PERIODO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Error de conexión al exportar'),
    );
  });
});
