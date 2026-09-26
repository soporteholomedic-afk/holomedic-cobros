import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HandoffModal } from '../HandoffModal';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HandoffModal', () => {
  it('renders the dialog with área, optional nota and both actions', () => {
    render(<HandoffModal empresaId={42} onSalir={vi.fn()} onExito={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Registrar handoff' })).toBeInTheDocument();
    expect(screen.getByLabelText('Área')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota (opcional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar handoff' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('blocks the submit without an área and does NOT call the endpoint', async () => {
    const user = userEvent.setup();
    render(<HandoffModal empresaId={42} onSalir={vi.fn()} onExito={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Registrar handoff' }));

    expect(await screen.findByText('El área es obligatoria.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the handoff payload (T5) and reports success — nota omitted when blank', async () => {
    const user = userEvent.setup();
    const onExito = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    render(<HandoffModal empresaId={42} onSalir={vi.fn()} onExito={onExito} />);

    await user.type(screen.getByLabelText('Área'), 'Operaciones');
    await user.type(screen.getByLabelText('Nota (opcional)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Registrar handoff' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/transiciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ evento: 'HandoffRegistrado', handoff: { area: 'Operaciones', nota: undefined } }),
      }),
    );
    expect(onExito).toHaveBeenCalledTimes(1);
  });

  it('sends the trimmed nota when provided', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    render(<HandoffModal empresaId={42} onSalir={vi.fn()} onExito={vi.fn()} />);

    await user.type(screen.getByLabelText('Área'), 'Cobranzas');
    await user.type(screen.getByLabelText('Nota (opcional)'), '  Coordinar entrega  ');
    await user.click(screen.getByRole('button', { name: 'Registrar handoff' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/crm/empresas/42/transiciones',
        expect.objectContaining({
          body: JSON.stringify({
            evento: 'HandoffRegistrado',
            handoff: { area: 'Cobranzas', nota: 'Coordinar entrega' },
          }),
        }),
      ),
    );
  });

  it('shows the API Spanish error verbatim and stays open on failure', async () => {
    const user = userEvent.setup();
    const onExito = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Transición no válida: el evento "HandoffRegistrado" no aplica desde INBOUND/SEGUIMIENTO',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 },
      ),
    );
    render(<HandoffModal empresaId={42} onSalir={vi.fn()} onExito={onExito} />);

    await user.type(screen.getByLabelText('Área'), 'Operaciones');
    await user.click(screen.getByRole('button', { name: 'Registrar handoff' }));

    expect(
      await screen.findByText(
        'Transición no válida: el evento "HandoffRegistrado" no aplica desde INBOUND/SEGUIMIENTO',
      ),
    ).toBeInTheDocument();
    expect(onExito).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Registrar handoff' })).toBeInTheDocument();
  });

  it('closes via Cancelar without any request', async () => {
    const user = userEvent.setup();
    const onSalir = vi.fn();
    render(<HandoffModal empresaId={42} onSalir={onSalir} onExito={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onSalir).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
