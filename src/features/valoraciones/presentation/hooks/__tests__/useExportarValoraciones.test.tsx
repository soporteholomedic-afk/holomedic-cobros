import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useExportarValoraciones } from '../useExportarValoraciones';
import type { ValoracionesFilter } from '../../../domain/entities';

/** Probe component exposing the hook API. */
function Probe({ tipo, filtro }: { tipo: 'pdf' | 'excel'; filtro: ValoracionesFilter }) {
  const { exportar, exportando, error } = useExportarValoraciones(tipo);
  return (
    <div>
      <button type="button" onClick={() => exportar(filtro)}>
        Exportar {tipo}
      </button>
      {exportando && <p>Exportando…</p>}
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
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickMock);
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
        headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="valoraciones_2026-01-01_2026-01-31.pdf"' },
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
