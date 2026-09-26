import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RechazoModal } from '../RechazoModal';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RechazoModal', () => {
  it('renders the dialog with the motivo field and both actions', () => {
    render(<RechazoModal empresaId={42} onSalir={vi.fn()} onExito={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Rechazar empresa' })).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('blocks the submit with an empty motivo and does NOT call the endpoint', async () => {
    const user = userEvent.setup();
    render(<RechazoModal empresaId={42} onSalir={vi.fn()} onExito={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(await screen.findByText('El motivo es obligatorio.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the trimmed motivo to the transitions endpoint and reports success', async () => {
    const user = userEvent.setup();
    const onExito = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    render(<RechazoModal empresaId={42} onSalir={vi.fn()} onExito={onExito} />);

    await user.type(screen.getByLabelText('Motivo'), '  Ya tiene proveedor  ');
    await user.click(screen.getByRole('button', { name: 'Rechazar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/transiciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ evento: 'Rechazo', motivo: 'Ya tiene proveedor' }),
      }),
    );
    expect(onExito).toHaveBeenCalledTimes(1);
  });

  it('shows the API Spanish error verbatim and stays open on failure', async () => {
    const user = userEvent.setup();
    const onExito = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: 'La empresa no se encuentra en el pipeline', code: 'NOT_FOUND_ERROR' }),
        { status: 404 },
      ),
    );
    render(<RechazoModal empresaId={42} onSalir={vi.fn()} onExito={onExito} />);

    await user.type(screen.getByLabelText('Motivo'), 'Ya tiene proveedor');
    await user.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(
      await screen.findByText('La empresa no se encuentra en el pipeline'),
    ).toBeInTheDocument();
    expect(onExito).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Rechazar empresa' })).toBeInTheDocument();
  });

  it('closes via Cancelar without any request', async () => {
    const user = userEvent.setup();
    const onSalir = vi.fn();
    render(<RechazoModal empresaId={42} onSalir={onSalir} onExito={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onSalir).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
