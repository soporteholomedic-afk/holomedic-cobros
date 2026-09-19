import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EmpresaDetalle } from '../EmpresaDetalle';
import type { DetalleEmpresa } from '../../../application/obtenerDetalleEmpresa';

// ---- Fixtures ----

const DETALLE_URL = '/api/crm/empresas/42/detalle';

function makeDetalle(overrides: {
  pipeline?: DetalleEmpresa['pipeline'];
  transiciones?: DetalleEmpresa['transiciones'];
  handoffs?: DetalleEmpresa['handoffs'];
} = {}): DetalleEmpresa {
  return {
    empresa: {
      id: 42,
      ruc: '900123456',
      rucNormalizado: '900123456',
      razonSocial: 'Constructora X',
      tipo: 'Prospecto',
      origen: 'Inbound',
      proyectoObra: 'Ampliación Planta Norte',
      destinoComun: null,
      notas: null,
      responsable: 'jperez',
      contactos: [
        {
          id: 11,
          empresaId: 42,
          nombre: 'Ana',
          telefono: '987654321',
          esPrincipal: true,
          correos: [
            { id: 111, contactoId: 11, correo: 'ana@x.com' },
            { id: 112, contactoId: 11, correo: 'ana.perez@x.com' },
          ],
        },
        {
          id: 12,
          empresaId: 42,
          nombre: 'Luis',
          telefono: null,
          esPrincipal: false,
          correos: [{ id: 113, contactoId: 12, correo: 'luis@x.com' }],
        },
      ],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    pipeline: {
      empresaId: 42,
      flujo: 'INBOUND',
      etapa: 'REGISTRADO',
      ciclo: 1,
      enviosCiclo: 0,
      fechaCicloInicio: null,
      fechaUltimoEnvio: null,
      descansoHasta: null,
      rechazadoHasta: null,
      motivoRechazo: null,
      updatedBy: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    transiciones: [
      {
        id: 9,
        empresaId: 42,
        flujoPrevio: 'INBOUND',
        etapaPrevia: 'REGISTRADO',
        flujoNuevo: 'INBOUND',
        etapaNueva: 'SEGUIMIENTO',
        evento: 'CotizaciónEnviada',
        motivo: null,
        usuario: 'jperez',
        createdAt: '2026-09-02T10:30:00.000Z',
      },
    ],
    handoffs: [
      {
        id: 4,
        empresaId: 42,
        area: 'Operaciones',
        nota: 'Coordinar entrega',
        usuario: 'jperez',
        createdAt: '2026-09-15T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const fetchMock = vi.fn();

function okDetalle(payload: DetalleEmpresa): Response {
  return new Response(JSON.stringify({ success: true, ...payload }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockDetalle(detalle: DetalleEmpresa): void {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === DETALLE_URL) return Promise.resolve(okDetalle(detalle));
    return Promise.reject(new Error(`URL inesperada en el test: ${url}`));
  });
}

function llamadasDetalle(): number {
  return fetchMock.mock.calls.filter((llamada) => String(llamada[0]) === DETALLE_URL).length;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EmpresaDetalle', () => {
  it('shows the loading state while the detail is in flight', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<EmpresaDetalle id={42} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando empresa…');
  });

  it('renders the empresa header with datos and the "Sin asignar" pool fallback', async () => {
    const detalle = makeDetalle();
    detalle.empresa.responsable = null;
    mockDetalle(detalle);
    render(<EmpresaDetalle id={42} />);

    expect(await screen.findByText('Constructora X')).toBeInTheDocument();
    expect(screen.getByText('900123456')).toBeInTheDocument();
    expect(screen.getByText('Prospecto')).toBeInTheDocument();
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    expect(screen.getByText('Ampliación Planta Norte')).toBeInTheDocument();
  });

  it('renders the contactos with correos, teléfono and exactly one Principal badge', async () => {
    mockDetalle(makeDetalle());
    render(<EmpresaDetalle id={42} />);

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Luis')).toBeInTheDocument();
    expect(screen.getByText('ana@x.com')).toBeInTheDocument();
    expect(screen.getByText('ana.perez@x.com')).toBeInTheDocument();
    expect(screen.getByText('luis@x.com')).toBeInTheDocument();
    expect(screen.getByText(/987654321/)).toBeInTheDocument();
    expect(screen.getAllByText('Principal')).toHaveLength(1);
  });

  it('renders the pipeline state in Spanish and offers ONLY the machine-legal transitions', async () => {
    mockDetalle(makeDetalle());
    render(<EmpresaDetalle id={42} />);

    await screen.findByText('Constructora X');
    const pipeline = within(screen.getByLabelText('Pipeline'));
    expect(pipeline.getByText('Inbound')).toBeInTheDocument();
    expect(pipeline.getByText('Registrado')).toBeInTheDocument();
    // From INBOUND/REGISTRADO the machine fires T2 and the T14 fork.
    expect(screen.getByRole('button', { name: 'Cotización enviada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Presentación enviada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('renders the Timeline with the transition audit and handoff records', async () => {
    mockDetalle(makeDetalle());
    render(<EmpresaDetalle id={42} />);

    await screen.findByText('Constructora X');
    const historial = within(screen.getByLabelText('Historial'));
    expect(historial.getByText('Cotización enviada')).toBeInTheDocument();
    expect(historial.getByText('Operaciones')).toBeInTheDocument();
    expect(historial.getByText(/Coordinar entrega/)).toBeInTheDocument();
  });

  it('POSTs a direct transition and refreshes the detail on success', async () => {
    const user = userEvent.setup();
    const detalle = makeDetalle();
    mockDetalle(detalle);
    render(<EmpresaDetalle id={42} />);
    await screen.findByText('Constructora X');

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/crm/empresas/42/transiciones') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, estado: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' } }),
            { status: 200 },
          ),
        );
      }
      if (url === DETALLE_URL) return Promise.resolve(okDetalle(detalle));
      return Promise.reject(new Error(`URL inesperada en el test: ${url}`));
    });

    await user.click(screen.getByRole('button', { name: 'Cotización enviada' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/transiciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ evento: 'CotizaciónEnviada' }),
      }),
    );
    await waitFor(() => expect(llamadasDetalle()).toBe(2));
  });

  it('shows the rejection motivo, cooldown and the Reactivar action from RECHAZADO', async () => {
    mockDetalle(
      makeDetalle({
        pipeline: {
          empresaId: 42,
          flujo: 'INBOUND',
          etapa: 'RECHAZADO',
          ciclo: 1,
          enviosCiclo: 1,
          fechaCicloInicio: null,
          fechaUltimoEnvio: '2026-09-10',
          descansoHasta: null,
          rechazadoHasta: '2026-12-10',
          motivoRechazo: 'Ya tiene proveedor',
          updatedBy: 'mgarcia',
          updatedAt: '2026-09-10T08:00:00.000Z',
        },
      }),
    );
    render(<EmpresaDetalle id={42} />);

    await screen.findByText('Constructora X');
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.getByText(/Ya tiene proveedor/)).toBeInTheDocument();
    expect(screen.getByText(/10\/12\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('shows a pipeline-less aviso with no transition actions (origen null)', async () => {
    mockDetalle(makeDetalle({ pipeline: null, transiciones: [], handoffs: [] }));
    render(<EmpresaDetalle id={42} />);

    await screen.findByText('Constructora X');
    expect(screen.getByText('Esta empresa no tiene pipeline registrado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cotización enviada' })).not.toBeInTheDocument();
  });

  it('shows the error with Reintentar and recovers', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Empresa no encontrada', code: 'NOT_FOUND_ERROR' }), {
          status: 404,
        }),
      ),
    );
    mockDetalle(makeDetalle());
    render(<EmpresaDetalle id={42} />);

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Empresa no encontrada');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Constructora X')).toBeInTheDocument();
  });
});

describe('EmpresaDetalle — modal wiring (tasks pr11/WU3)', () => {
  it('opens the rejection modal from the Rechazar button and refreshes the detail on success', async () => {
    const user = userEvent.setup();
    const detalle = makeDetalle();
    mockDetalle(detalle);
    render(<EmpresaDetalle id={42} />);
    await screen.findByText('Constructora X');

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Rechazar empresa' });
    expect(dialogo).toBeInTheDocument();

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/crm/empresas/42/transiciones') {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      if (url === DETALLE_URL) return Promise.resolve(okDetalle(detalle));
      return Promise.reject(new Error(`URL inesperada en el test: ${url}`));
    });

    await user.type(screen.getByLabelText('Motivo'), 'Ya tiene proveedor');
    await user.click(within(dialogo).getByRole('button', { name: 'Rechazar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/crm/empresas/42/transiciones',
        expect.objectContaining({
          body: JSON.stringify({ evento: 'Rechazo', motivo: 'Ya tiene proveedor' }),
        }),
      ),
    );
    // Success refreshes the detail (initial load + post-mutation reload).
    await waitFor(() => expect(llamadasDetalle()).toBe(2));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Rechazar empresa' })).not.toBeInTheDocument(),
    );
  });

  it('opens the handoff modal from the Registrar handoff button and posts the T5 payload', async () => {
    const user = userEvent.setup();
    // T5 fires only from INBOUND/CONFIRMADA — seed that state.
    const detalle = makeDetalle({
      pipeline: {
        empresaId: 42,
        flujo: 'INBOUND',
        etapa: 'CONFIRMADA',
        ciclo: 1,
        enviosCiclo: 0,
        fechaCicloInicio: null,
        fechaUltimoEnvio: null,
        descansoHasta: null,
        rechazadoHasta: null,
        motivoRechazo: null,
        updatedBy: null,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      transiciones: [],
      handoffs: [],
    });
    mockDetalle(detalle);
    render(<EmpresaDetalle id={42} />);
    await screen.findByText('Constructora X');

    await user.click(screen.getByRole('button', { name: 'Registrar handoff' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar handoff' });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/crm/empresas/42/transiciones') {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      if (url === DETALLE_URL) return Promise.resolve(okDetalle(detalle));
      return Promise.reject(new Error(`URL inesperada en el test: ${url}`));
    });

    await user.type(screen.getByLabelText('Área'), 'Operaciones');
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar handoff' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/crm/empresas/42/transiciones',
        expect.objectContaining({
          body: JSON.stringify({
            evento: 'HandoffRegistrado',
            handoff: { area: 'Operaciones', nota: undefined },
          }),
        }),
      ),
    );
    await waitFor(() => expect(llamadasDetalle()).toBe(2));
  });
});
