import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryList, formatSentAt } from '../HistoryList';
import type {
  EnvioAttachmentSnapshot,
  EnvioHistorySummary,
} from '@/features/envio-resultados/domain/entities';

const { mockRouterPush, searchParamsRef } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/consolidados/historial-envios',
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockRouterPush.mockReset();
  searchParamsRef.current = new URLSearchParams();
  global.fetch = mockFetch as unknown as typeof fetch;
});

const uncAtt: EnvioAttachmentSnapshot = {
  source: 'unc',
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  path: 'LEGAJOS',
  storedName: 'cert.pdf',
  deliveryName: 'CERT - JUAN GARCIA.pdf',
};

const localAtt: EnvioAttachmentSnapshot = {
  source: 'local',
  storedName: 'informe-adicional.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 2048,
};

function makeRow(overrides: Partial<EnvioHistorySummary> = {}): EnvioHistorySummary {
  return {
    id: 'env-001',
    sentAt: '2026-06-15T15:30:00.000Z',
    status: 'enviado',
    errorDetail: null,
    sentBy: 'jperez',
    destino: 'UNACEM',
    companyId: 'c-1',
    companyName: 'ACME S.A.',
    nombreCompleto: 'GARCIA LOPEZ JUAN',
    toRecipients: ['destino@acme.com'],
    ccRecipients: [],
    subject: 'Resultados consolidados junio',
    attachments: [uncAtt],
    ...overrides,
  };
}

function resolveRows(rows: EnvioHistorySummary[], total = rows.length, page = 1) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, rows, total, page, pageSize: 20 }),
  });
}

async function renderList() {
  render(<HistoryList />);
  await waitFor(() => {
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
}

describe('HistoryList', () => {
  it('shows the loading spinner (and still the buscador) while fetching', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<HistoryList />);

    expect(screen.getByText(/Cargando historial/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Server-side search: the buscador must remain usable while loading.
    expect(screen.getByPlaceholderText(/Buscar por destinatario/i)).toBeInTheDocument();
  });

  it('shows the error state with a Reintentar button, then recovers', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, rows: [makeRow()], total: 1, page: 1, pageSize: 20 }),
      });

    render(<HistoryList />);
    await waitFor(() => {
      expect(screen.getByText(/Error al cargar el historial/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state when the API returns no rows', async () => {
    resolveRows([]);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText(/No se encontraron envíos/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders status badges: enviado, error + visible detail, pendiente', async () => {
    resolveRows([
      makeRow({ id: 'env-1' }),
      makeRow({ id: 'env-2', status: 'error', errorDetail: 'SMTP 554 rejection quota exceeded' }),
      makeRow({ id: 'env-3', status: 'pendiente' }),
    ]);

    await renderList();

    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('SMTP 554 rejection quota exceeded')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('renders sentAt in local time (es-PE), never the raw UTC ISO string', async () => {
    resolveRows([makeRow()]);

    const { container } = render(<HistoryList />);
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    const expected = formatSentAt('2026-06-15T15:30:00.000Z');
    // TextContent compare: es-PE output contains a narrow no-break space
    // (U+202F) that getByText's normalizer mangles.
    expect(container.textContent).toContain(expected);
    expect(container.innerHTML).not.toContain('2026-06-15T15:30:00.000Z');
  });

  it('expands a row to show the UNC durable address and renamed delivery name', async () => {
    resolveRows([makeRow()]);

    await renderList();

    fireEvent.click(screen.getByRole('button', { name: /1 adjunto/i }));

    expect(screen.getByText(/LEGAJOS\/cert\.pdf/)).toBeInTheDocument();
    expect(screen.getByText('CERT - JUAN GARCIA.pdf')).toBeInTheDocument();
    expect(screen.getByText(/RUC 20123456789/)).toBeInTheDocument();
    expect(screen.getByText(/DNI 12345678/)).toBeInTheDocument();
    expect(screen.getByText(/AT-001/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /1 adjunto/i }));
    expect(screen.queryByText(/LEGAJOS\/cert\.pdf/)).not.toBeInTheDocument();
  });

  it('badges local attachments as "ya no disponible" with metadata only', async () => {
    resolveRows([makeRow({ attachments: [localAtt] })]);

    await renderList();

    fireEvent.click(screen.getByRole('button', { name: /1 adjunto/i }));

    expect(screen.getByText('informe-adicional.xlsx')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByText(/ya no disponible/i)).toBeInTheDocument();
    // No UNC reference fields are rendered for a local drop.
    expect(screen.queryByText(/IdAten/)).not.toBeInTheDocument();
  });

  it('renders "0" (no expand button) for rows without attachments', async () => {
    resolveRows([makeRow({ attachments: [] })]);

    await renderList();

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adjunto/i })).not.toBeInTheDocument();
  });

  it('pagers: shows "Página X de Y", disables prev on page 1, next pushes page 2', async () => {
    searchParamsRef.current = new URLSearchParams('q=acme');
    resolveRows([makeRow()], 47, 1);

    await renderList();

    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anterior/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    expect(mockRouterPush).toHaveBeenCalledWith('/consolidados/historial-envios?q=acme&page=2');
  });

  it('disables next on the last page and prev pushes the previous page', async () => {
    searchParamsRef.current = new URLSearchParams('page=3');
    resolveRows([makeRow()], 47, 3);

    await renderList();

    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Siguiente/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Anterior/i }));
    // buildUrl(2) with no q/dates keeps page=2 explicit (only page 1 is omitted).
    expect(mockRouterPush).toHaveBeenCalledWith('/consolidados/historial-envios?page=2');
  });

  it('Reenviar pushes /consolidados?reenvio=<id> (inert URL push; PR4 hydrates)', async () => {
    resolveRows([makeRow({ id: 'env-777' })]);

    await renderList();

    fireEvent.click(screen.getByRole('button', { name: /Reenviar/i }));
    expect(mockRouterPush).toHaveBeenCalledWith('/consolidados?reenvio=env-777');
  });

  it('buscador submit pushes q + date range as URL params (page reset)', async () => {
    resolveRows([makeRow()]);

    await renderList();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por destinatario/i), {
      target: { value: 'acme' },
    });
    fireEvent.change(screen.getByLabelText('Fecha Inicio'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Fecha Fin'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      '/consolidados/historial-envios?q=acme&fechaInicio=2026-06-01&fechaFin=2026-06-30',
    );
  });

  it('reads q/fecha/page from the URL and fetches the API with them', async () => {
    searchParamsRef.current = new URLSearchParams(
      'q=acme&fechaInicio=2026-06-01&fechaFin=2026-06-30&page=2',
    );
    resolveRows([makeRow()], 25, 2);

    await renderList();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/consolidados/envios?q=acme&fechaInicio=2026-06-01&fechaFin=2026-06-30&page=2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });

  it('never renders bodyHtml even if a summary payload carries it (D10)', async () => {
    const leaky = makeRow() as EnvioHistorySummary & {
      bodyHtml: string;
    };
    leaky.bodyHtml = '<script>alert("xss")</script><p>cuerpo secreto</p>';
    resolveRows([leaky]);

    const { container } = render(<HistoryList />);
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    expect(container.innerHTML).not.toContain('alert("xss")');
    expect(container.innerHTML).not.toContain('cuerpo secreto');
    expect(container.querySelector('script')).not.toBeInTheDocument();
  });
});
