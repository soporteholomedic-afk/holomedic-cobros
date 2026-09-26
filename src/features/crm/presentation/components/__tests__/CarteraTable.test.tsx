import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CarteraTable } from '../CarteraTable';
import type { FilaCartera } from '../../../application/listarCartera';

/**
 * UI contract for the cartera table (tasks pr15/WU2, spec G5):
 * columns empresa (link to detail), RUC, tipo, etapa, responsable and
 * próxima acción; the "Ver todas" toggle renders for admins ONLY; the
 * panel action opens the per-empresa assignment dialog. API errors
 * surface with a retry (EmpresaList/ColaHoy model).
 */

function fila(overrides: Partial<FilaCartera>): FilaCartera {
  return {
    empresaId: 42,
    ruc: '900123456',
    razonSocial: 'Constructora X',
    tipo: 'Prospecto',
    responsable: 'jperez',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    proximaAccion: 'Enviar seguimiento (vencido hoy)',
    ...overrides,
  };
}

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function carteraOk(filas: FilaCartera[], todas = false): Response {
  return okResponse({ success: true, filas, todas });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((url: string | URL | Request) => {
    const path = String(url);
    if (path.includes('/asignaciones')) {
      return Promise.resolve(okResponse({ success: true, asignaciones: [] }));
    }
    return Promise.resolve(
      carteraOk([
        fila({}),
        fila({
          empresaId: 43,
          ruc: '900999999',
          razonSocial: 'Clínica del Sol',
          tipo: 'Cliente',
          responsable: 'mgarcia',
          flujo: 'INBOUND',
          etapa: 'CONFIRMADA',
          proximaAccion: 'Sin acción pendiente',
        }),
      ]),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CarteraTable — Mi cartera (spec G5)', () => {
  it('renders the Spanish columns and routes each empresa to its detail page', async () => {
    render(<CarteraTable esAdmin={false} />);

    expect(await screen.findByText('Constructora X')).toBeInTheDocument();
    for (const columna of ['Empresa', 'RUC', 'Tipo', 'Etapa', 'Responsable', 'Próxima acción']) {
      expect(screen.getByRole('columnheader', { name: columna })).toBeInTheDocument();
    }
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .sort();
    expect(hrefs).toEqual(['/crm/empresas/42', '/crm/empresas/43']);
    expect(screen.getByText('900999999')).toBeInTheDocument();
    // Spanish etapa label (ETIQUETA_ETAPA), not the raw enum value.
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('Enviar seguimiento (vencido hoy)')).toBeInTheDocument();
    expect(screen.getByText('mgarcia')).toBeInTheDocument();
  });

  it('a plain user gets NO "Ver todas" toggle and the fetch stays own-scoped', async () => {
    render(<CarteraTable esAdmin={false} />);

    await screen.findByText('Constructora X');
    expect(screen.queryByRole('checkbox', { name: 'Ver todas' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/cartera', { method: 'GET' });
  });

  it('the admin toggle re-fetches with ?todas=true', async () => {
    render(<CarteraTable esAdmin={true} />);

    await screen.findByText('Constructora X');
    fetchMock.mockImplementation((url: string | URL | Request) =>
      Promise.resolve(
        String(url).includes('todas=true')
          ? carteraOk(
              [
                fila({}),
                fila({ empresaId: 43, razonSocial: 'De mgarcia', responsable: 'mgarcia' }),
                fila({ empresaId: 44, razonSocial: 'Del pool', responsable: null }),
              ],
              true,
            )
          : carteraOk([fila({})]),
      ),
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Ver todas' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/crm/cartera?todas=true', { method: 'GET' }),
    );
    expect(await screen.findByText('Del pool')).toBeInTheDocument();
  });

  it('shows the empty state when the cartera has no empresas', async () => {
    fetchMock.mockImplementation((url: string | URL | Request) =>
      String(url).includes('/asignaciones')
        ? Promise.resolve(okResponse({ success: true, asignaciones: [] }))
        : Promise.resolve(carteraOk([])),
    );

    render(<CarteraTable esAdmin={false} />);

    expect(await screen.findByText('Sin empresas en la cartera.')).toBeInTheDocument();
  });

  it('surfaces API errors with a retry that re-fetches', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'No autenticado', code: 'UNAUTHORIZED' }), {
          status: 401,
        }),
      ),
    );

    render(<CarteraTable esAdmin={false} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No autenticado');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Constructora X')).toBeInTheDocument());
  });

  it('opens the per-empresa assignment panel from the row action', async () => {
    render(<CarteraTable esAdmin={true} />);

    await screen.findByText('Constructora X');
    await userEvent.click(screen.getByRole('button', { name: 'Ver asignación de Constructora X' }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Asignación — Constructora X');
  });
});
