import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PanelAsignacion } from '../PanelAsignacion';
import type { FilaCartera } from '../../../application/listarCartera';
import type { AsignacionHistorial } from '../../../domain/ports';

/**
 * UI contract for the per-empresa assignment panel (tasks pr15/WU2,
 * spec G5): the ASIGNADO/REASIGNADO/DEVUELTO history with actor and
 * timestamp (traceability scenario), the admin assign/reassign input
 * hitting pr14's endpoint, the owner's "Devolver al pool" action, and
 * Spanish API errors surfaced verbatim inside the panel.
 */

const empresa: FilaCartera = {
  empresaId: 42,
  ruc: '900123456',
  razonSocial: 'Constructora X',
  tipo: 'Prospecto',
  responsable: 'jperez',
  flujo: 'OUTBOUND',
  etapa: 'CADENCIA',
  proximaAccion: 'Enviar seguimiento (vencido hoy)',
};

const historial: AsignacionHistorial[] = [
  {
    id: 3,
    empresaId: 42,
    accion: 'DEVUELTO',
    responsablePrevio: 'jperez',
    responsableNuevo: null,
    actorUsuario: 'u-jperez',
    createdAt: '2026-09-03T10:00:00.000Z',
  },
  {
    id: 2,
    empresaId: 42,
    accion: 'REASIGNADO',
    responsablePrevio: null,
    responsableNuevo: 'jperez',
    actorUsuario: 'u-admin',
    createdAt: '2026-09-02T09:00:00.000Z',
  },
];

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
  fetchMock.mockImplementation((url: string | URL | Request) =>
    Promise.resolve(
      String(url).includes('/asignaciones')
        ? okResponse({ success: true, asignaciones: historial })
        : okResponse({ success: true, accion: 'REASIGNADO', responsable: 'jperez' }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(overrides: { esAdmin?: boolean; onCambio?: () => void } = {}): void {
  render(
    <PanelAsignacion
      empresa={empresa}
      esAdmin={overrides.esAdmin ?? true}
      onSalir={() => {}}
      onCambio={overrides.onCambio ?? (() => {})}
    />,
  );
}

describe('PanelAsignacion — assignment history + management (spec G5)', () => {
  it('renders the history newest first with Spanish action labels, actor and date', async () => {
    renderPanel();

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Asignación — Constructora X');
    expect(await screen.findByText('Devuelto')).toBeInTheDocument();
    expect(screen.getByText('Reasignado')).toBeInTheDocument();
    expect(dialogo).toHaveTextContent('03/09/2026 10:00 · u-jperez');
    expect(dialogo).toHaveTextContent('02/09/2026 09:00 · u-admin');
    expect(dialogo).toHaveTextContent('Pool → jperez');
  });

  it('shows the empty state for an empresa with no assignment events', async () => {
    fetchMock.mockImplementation((url: string | URL | Request) =>
      Promise.resolve(
        String(url).includes('/asignaciones')
          ? okResponse({ success: true, asignaciones: [] })
          : okResponse({ success: true }),
      ),
    );

    renderPanel();

    expect(await screen.findByText('Sin asignaciones registradas.')).toBeInTheDocument();
  });

  it('the admin assigns/reassigns via pr14’s endpoint and notifies the parent', async () => {
    const onCambio = vi.fn();
    renderPanel({ onCambio });

    const input = await screen.findByLabelText('Responsable');
    await userEvent.type(input, 'jperez');
    await userEvent.click(screen.getByRole('button', { name: 'Reasignar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/asignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsable: 'jperez' }),
      }),
    );
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it('does not POST when the responsable input is blank', async () => {
    renderPanel();

    await screen.findByLabelText('Responsable');
    await userEvent.click(screen.getByRole('button', { name: 'Reasignar' }));

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/crm/empresas/42/asignar',
      expect.anything(),
    );
  });

  it('a plain owner returns the empresa to the pool ("Devolver al pool")', async () => {
    const onCambio = vi.fn();
    renderPanel({ esAdmin: false, onCambio });

    const boton = await screen.findByRole('button', { name: 'Devolver al pool' });
    await userEvent.click(boton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/devolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it('a plain user does NOT see the assign form (admin-only, design D2)', () => {
    renderPanel({ esAdmin: false });

    expect(screen.queryByLabelText('Responsable')).not.toBeInTheDocument();
  });

  it('surfaces the API’s Spanish error verbatim inside the panel', async () => {
    fetchMock.mockImplementation((url: string | URL | Request) => {
      const path = String(url);
      if (path.includes('/asignaciones')) {
        return Promise.resolve(okResponse({ success: true, asignaciones: historial }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: false, error: 'Ya existe una asignación con ese responsable', code: 'VALIDATION_ERROR' }),
          { status: 400 },
        ),
      );
    });
    renderPanel();

    const input = await screen.findByLabelText('Responsable');
    await userEvent.type(input, 'jperez');
    await userEvent.click(screen.getByRole('button', { name: 'Reasignar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una asignación con ese responsable',
    );
  });
});
