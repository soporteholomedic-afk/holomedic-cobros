import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ModalAgregarEmpresa } from '../ModalAgregarEmpresa';
import type { Empresa } from '../../../domain/entities';

/**
 * UI contract for the board quick-capture dialog (crm-ux redesign):
 * TWO visible paths behind one button. "Seleccionar existente"
 * (default) searches the registry and self-claims a pool empresa via
 * POST /asignar; "Crear nueva" registers a minimal empresa
 * auto-assigned to the session user (responsable in the POST body,
 * origen Inbound so it is born with a pipeline row). Typed errors
 * (409 duplicate RUC, 403 foreign-owner) surface in-Spanish without
 * closing the dialog.
 */

function empresaFixture(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id: 42,
    ruc: '900123456',
    rucNormalizado: '900123456',
    razonSocial: 'Constructora X',
    tipo: 'Prospecto',
    origen: null,
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    contactos: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const empresaCreada: Empresa = empresaFixture({
  id: 1,
  ruc: '900-999888',
  razonSocial: 'Constructora Nueva',
  origen: 'Inbound',
  responsable: 'u-1',
  contactos: [
    {
      id: 11,
      empresaId: 1,
      nombre: 'Ana',
      telefono: null,
      esPrincipal: true,
      correos: [{ id: 111, contactoId: 11, correo: 'ana@nueva.com' }],
    },
  ],
});

const fetchMock = vi.fn();
const onCreada = vi.fn();
const onAsignada = vi.fn();
const onCerrar = vi.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Route fetch mocks by method+URL so tab bodies coexist peacefully. */
function mockFetchPorRuta(reglas: { metodo: string; sufijo: string; respuesta: () => Response }[]): void {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const regla = reglas.find((r) => r.metodo === metodo && url.includes(r.sufijo));
    if (!regla) throw new Error(`fetch inesperado: ${metodo} ${url}`);
    return Promise.resolve(regla.respuesta());
  });
}

function renderModal() {
  render(
    <ModalAgregarEmpresa
      usuario="u-1"
      nombreUsuario="Juana Perez"
      onCerrar={onCerrar}
      onCreada={onCreada}
      onAsignada={onAsignada}
    />,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  onCreada.mockReset();
  onAsignada.mockReset();
  onCerrar.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModalAgregarEmpresa — pestaña "Seleccionar existente" (default)', () => {
  it('renders the two tabs with "Seleccionar existente" active by default', async () => {
    mockFetchPorRuta([
      { metodo: 'GET', sufijo: '/api/crm/empresas', respuesta: () => jsonResponse({ success: true, empresas: [] }) },
    ]);
    renderModal();

    expect(await screen.findByRole('dialog', { name: 'Agregar empresa' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Seleccionar existente' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Crear nueva' })).toHaveAttribute('aria-selected', 'false');
  });

  it('claims a pool empresa for the session user and reports it to onAsignada', async () => {
    mockFetchPorRuta([
      {
        metodo: 'GET',
        sufijo: '/api/crm/empresas?',
        respuesta: () => jsonResponse({ success: true, empresas: [empresaFixture()] }),
      },
      {
        metodo: 'GET',
        sufijo: '/api/crm/empresas',
        respuesta: () => jsonResponse({ success: true, empresas: [] }),
      },
      {
        metodo: 'POST',
        sufijo: '/asignar',
        respuesta: () =>
          jsonResponse({ success: true, accion: 'ASIGNADO', responsable: 'u-1', responsablePrevio: null }),
      },
    ]);
    renderModal();

    // Debounced search: typing fires the ?q= GET after 300ms.
    await userEvent.type(screen.getByLabelText(/Buscar empresa/), 'Constructora');
    await waitFor(() => expect(screen.getByText('Constructora X')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Tomar' }));

    await waitFor(() => expect(onAsignada).toHaveBeenCalledWith(empresaFixture()));
    const llamadaAsignar = fetchMock.mock.calls.find(([u]) => String(u).includes('/asignar'));
    expect(llamadaAsignar).toBeDefined();
    const [url, init] = llamadaAsignar as [string, RequestInit];
    expect(url).toBe('/api/crm/empresas/42/asignar');
    expect(JSON.parse(String(init.body))).toEqual({ responsable: 'u-1' });
  });

  it('marks own empresas inert while owned ones stay takeable through confirmation', async () => {
    mockFetchPorRuta([
      {
        metodo: 'GET',
        sufijo: '/api/crm/empresas',
        respuesta: () =>
          jsonResponse({
            success: true,
            empresas: [
              empresaFixture({ id: 1, razonSocial: 'Mia SA', responsable: 'u-1' }),
              empresaFixture({ id: 2, razonSocial: 'De Otro SA', responsable: 'jperez' }),
            ],
          }),
      },
    ]);
    renderModal();

    await waitFor(() => expect(screen.getByText('De Otro SA')).toBeInTheDocument());
    expect(screen.getByText('Ya es tuya')).toBeInTheDocument();
    expect(screen.getByText('De jperez')).toBeInTheDocument();
    // Only the OWNED empresa offers a Tomar button — the own one is inert.
    expect(screen.getAllByRole('button', { name: 'Tomar' })).toHaveLength(1);
  });

  it('confirms before taking an owned empresa, then reassigns it to the session user', async () => {
    const deOtro = empresaFixture({ id: 2, razonSocial: 'De Otro SA', responsable: 'jperez' });
    mockFetchPorRuta([
      {
        metodo: 'GET',
        sufijo: '/api/crm/empresas',
        respuesta: () => jsonResponse({ success: true, empresas: [deOtro] }),
      },
      {
        metodo: 'POST',
        sufijo: '/asignar',
        respuesta: () =>
          jsonResponse({ success: true, accion: 'REASIGNADO', responsable: 'u-1', responsablePrevio: 'jperez' }),
      },
    ]);
    renderModal();

    await waitFor(() => expect(screen.getByText('De Otro SA')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Tomar' }));

    const confirmacion = await screen.findByRole('dialog', { name: 'Tomar empresa' });
    expect(confirmacion).toBeInTheDocument();
    // Exact match — the owner span inside the popup (not the row badge "De jperez").
    expect(screen.getByText('jperez')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sí, tomar' }));

    await waitFor(() => expect(onAsignada).toHaveBeenCalledWith(deOtro));
    const llamadaAsignar = fetchMock.mock.calls.find(([u]) => String(u).includes('/asignar'));
    expect(llamadaAsignar).toBeDefined();
    const [url, init] = llamadaAsignar as [string, RequestInit];
    expect(url).toBe('/api/crm/empresas/2/asignar');
    expect(JSON.parse(String(init.body))).toEqual({ responsable: 'u-1' });
  });
});

describe('ModalAgregarEmpresa — pestaña "Crear nueva"', () => {
  async function irACrear() {
    await userEvent.click(screen.getByRole('tab', { name: 'Crear nueva' }));
  }

  async function llenarFormulario() {
    await userEvent.type(screen.getByLabelText(/Razón social/), 'Constructora Nueva');
    await userEvent.type(screen.getByLabelText(/RUC/), '900-999888');
    await userEvent.type(screen.getByLabelText(/Encargado/), 'Ana');
    await userEvent.type(screen.getByLabelText(/Correos/), 'ana@nueva.com');
  }

  it('validates the required fields before fetching', async () => {
    mockFetchPorRuta([
      { metodo: 'GET', sufijo: '/api/crm/empresas', respuesta: () => jsonResponse({ success: true, empresas: [] }) },
    ]);
    renderModal();
    await irACrear();

    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Completa razón social');
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el GET inicial del tab existente
  });

  it('creates the empresa auto-assigned to the session user with Inbound origen', async () => {
    mockFetchPorRuta([
      { metodo: 'GET', sufijo: '/api/crm/empresas', respuesta: () => jsonResponse({ success: true, empresas: [] }) },
      { metodo: 'POST', sufijo: '/api/crm/empresas', respuesta: () => jsonResponse({ success: true, empresa: empresaCreada }, 201) },
    ]);
    renderModal();
    await irACrear();

    await llenarFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    await waitFor(() => expect(onCreada).toHaveBeenCalledWith(empresaCreada));
    const llamadaCrear = fetchMock.mock.calls.find(
      ([u, i]) => String(u) === '/api/crm/empresas' && (i?.method ?? '').toUpperCase() === 'POST',
    );
    expect(llamadaCrear).toBeDefined();
    const [url, init] = llamadaCrear as [string, RequestInit];
    expect(url).toBe('/api/crm/empresas');
    expect(JSON.parse(String(init.body))).toMatchObject({
      razonSocial: 'Constructora Nueva',
      responsable: 'u-1',
      tipo: 'Prospecto',
      origen: 'Inbound',
    });
  });

  it('surfaces the duplicate-RUC 409 without closing the dialog', async () => {
    mockFetchPorRuta([
      { metodo: 'GET', sufijo: '/api/crm/empresas', respuesta: () => jsonResponse({ success: true, empresas: [] }) },
      {
        metodo: 'POST',
        sufijo: '/api/crm/empresas',
        respuesta: () => jsonResponse({ success: false, error: 'conflicto', code: 'CONFLICT_ERROR' }, 409),
      },
    ]);
    renderModal();
    await irACrear();

    await llenarFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('Ya existe una empresa con ese RUC.')).toBeInTheDocument();
    expect(onCreada).not.toHaveBeenCalled();
  });
});
