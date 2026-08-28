import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useExportarValoraciones } from '../useExportarValoraciones';
import type { ValoracionesFilter } from '../../../domain/entities';

/** Probe component exposing the hook API. */
function Probe({
  tipo,
  filtro,
  empresa,
}: {
  tipo: 'pdf' | 'excel';
  filtro: ValoracionesFilter;
  empresa?: string;
}) {
  const { exportar, empresaEnCurso, error } = useExportarValoraciones(tipo);
  return (
    <div>
      <button type="button" onClick={() => exportar(filtro, empresa)}>
        Exportar {tipo}
      </button>
      {empresaEnCurso !== null && <p>Exportando {empresaEnCurso}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

const filtro: ValoracionesFilter = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
  codCli: 55,
};

function stubDownload(): ReturnType<typeof vi.fn> {
  const clickMock = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickMock(this);
  });
  return clickMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useExportarValoraciones', () => {
  it('POSTs the filter to the pdf endpoint and triggers a blob download', async () => {
    const clickMock = stubDownload();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="valoraciones_2026-01-01_2026-01-31.pdf"' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe tipo="pdf" filtro={filtro} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar pdf' }));

    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/valoraciones/pdf');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ fecIni: '2026-01-01', codCli: 55 });
    // No empresa field → global export body (legacy scope).
    expect(JSON.parse(init.body)).not.toHaveProperty('empresa');
  });

  it('includes the per-empresa scope in the body and downloads the server filename (U6)', async () => {
    const clickMock = stubDownload();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([9, 9]), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition':
            'attachment; filename="EMPRESA DEMO S.A.C._2026-01-01.pdf"; filename*=UTF-8\'\'EMPRESA%20DEMO%20S.A.C._2026-01-01.pdf',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe tipo="pdf" filtro={filtro} empresa="EMPRESA DEMO S.A.C." />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar pdf' }));

    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ empresa: 'EMPRESA DEMO S.A.C.' });
    // The anchor downloads under the server-provided [Empresa]_[fecha] name.
    const anchor = clickMock.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe('EMPRESA DEMO S.A.C._2026-01-01.pdf');
  });

  it('tracks the exporting empresa only while in flight and clears it after (U7)', async () => {
    const clickMock = stubDownload();
    // Hold the response open so the in-flight window is observable.
    let resolveFetch: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe tipo="pdf" filtro={filtro} empresa="EMPRESA DEMO S.A.C." />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar pdf' }));

    // While pending, ONLY the clicked empresa is marked as in flight.
    expect(await screen.findByText('Exportando EMPRESA DEMO S.A.C.')).toBeInTheDocument();

    resolveFetch(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );
    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    // Once settled, no empresa remains in flight.
    await waitFor(() =>
      expect(screen.queryByText('Exportando EMPRESA DEMO S.A.C.')).not.toBeInTheDocument(),
    );
  });

  it('marks a filter-only export with the global sentinel key while in flight (U7)', async () => {
    let resolveFetch: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe tipo="excel" filtro={filtro} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar excel' }));

    expect(await screen.findByText('Exportando __global__')).toBeInTheDocument();
    resolveFetch(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Exportando __global__')).not.toBeInTheDocument(),
    );
  });

  it('surfaces a user-visible error when the export fails (no throw)', async () => {
    vi.fn(() => 'blob:x');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'El generador de PDF no está disponible' }), { status: 502 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe tipo="pdf" filtro={filtro} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar pdf' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no está disponible');
  });
});
