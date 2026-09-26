import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EmpresaList } from '../EmpresaList';
import type { Empresa } from '../../../domain/entities';

// ---- Fixtures ----

function makeEmpresa(sobreNombre: Partial<Empresa> = {}): Empresa {
  return {
    id: 1,
    ruc: '900123456',
    rucNormalizado: '900123456',
    razonSocial: 'Constructora X',
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    contactos: [
      { id: 11, empresaId: 1, nombre: 'Ana', telefono: null, esPrincipal: true, correos: [] },
      { id: 12, empresaId: 1, nombre: 'Luis', telefono: null, esPrincipal: false, correos: [] },
    ],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...sobreNombre,
  };
}

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EmpresaList', () => {
  it('renders the fetched empresas (Spanish labels, pool rows as "Sin asignar")', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        success: true,
        empresas: [makeEmpresa(), makeEmpresa({ id: 2, razonSocial: 'Clinica Y', responsable: 'mgarcia' })],
      }),
    );

    render(<EmpresaList esAdmin={false} />);

    expect(await screen.findByText('Constructora X')).toBeInTheDocument();
    expect(screen.getByText('Clinica Y')).toBeInTheDocument();
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    expect(screen.getByText('mgarcia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();
  });

  it('links each row to its empresa detail page (registry → detail flow)', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        success: true,
        empresas: [makeEmpresa(), makeEmpresa({ id: 2, razonSocial: 'Clinica Y' })],
      }),
    );

    render(<EmpresaList esAdmin={false} />);

    expect(await screen.findByRole('link', { name: 'Constructora X' })).toHaveAttribute(
      'href',
      '/crm/empresas/1',
    );
    expect(screen.getByRole('link', { name: 'Clinica Y' })).toHaveAttribute(
      'href',
      '/crm/empresas/2',
    );
  });

  it('refetches with the q filter when the search form is submitted', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: [] }));

    render(<EmpresaList esAdmin={false} />);
    await screen.findByText('No se encontraron empresas.');

    await user.type(screen.getByLabelText('Buscar empresa'), 'constructora');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('/api/crm/empresas?q=constructora', {
        method: 'GET',
      }),
    );
  });

  it('refetches immediately when the tipo filter changes', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: [] }));

    render(<EmpresaList esAdmin={false} />);
    await screen.findByText('No se encontraron empresas.');

    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'Prospecto');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('/api/crm/empresas?tipo=Prospecto', {
        method: 'GET',
      }),
    );
  });

  it('shows the error with a Reintentar action that recovers the list', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }), { status: 403 }),
      )
      .mockResolvedValueOnce(okResponse({ success: true, empresas: [makeEmpresa()] }));

    render(<EmpresaList esAdmin={false} />);

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No autorizado');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Constructora X')).toBeInTheDocument();
  });

  it('shows the empty state after a filter with no results', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: [] }));

    render(<EmpresaList esAdmin={false} />);

    expect(await screen.findByText('No se encontraron empresas.')).toBeInTheDocument();
  });

  it('offers the Nueva empresa entry only to crm_admin (the POST is crm_admin-gated)', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: [makeEmpresa()] }));

    render(<EmpresaList esAdmin={true} />);

    expect(await screen.findByRole('link', { name: 'Nueva empresa' })).toHaveAttribute(
      'href',
      '/crm/empresas/nueva',
    );
  });

  it('hides the Nueva empresa entry for plain crm users', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: [makeEmpresa()] }));

    render(<EmpresaList esAdmin={false} />);

    expect(await screen.findByText('Constructora X')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva empresa' })).not.toBeInTheDocument();
  });
});
