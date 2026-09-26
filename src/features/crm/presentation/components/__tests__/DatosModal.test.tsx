import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { construirResumenDatos } from '../../../domain/datosOperativos';
import { DatosModal } from '../DatosModal';

/**
 * UI contract for the DatosSolicitados capture (crm-ux redesign):
 * three OPTIONAL (encargado, correo) pairs — facturación, médico
 * ocupacional, administrador. Invalid emails are rejected client-side
 * with a Spanish message; filled pairs travel as STRUCTURED `datos`
 * (the API upserts first-class contactos and builds the audit resumen
 * server-side); an empty submit sends empty datos (the plain event).
 */

const fetchMock = vi.fn();

function okResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      estado: { flujo: 'OUTBOUND', etapa: 'DATOS' },
      resultado: null,
      pipeline: {},
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal() {
  render(<DatosModal empresaId={42} onSalir={vi.fn()} onExito={vi.fn()} />);
}

describe('construirResumenDatos (pure — domain)', () => {
  it('only includes the filled pairs, with both or either field', () => {
    const resumen = construirResumenDatos({
      facturacion: { encargado: 'Ana López', correo: 'fact@x.com' },
      medicoOcupacional: { correo: 'medico@x.com' },
      administrador: { encargado: 'Carlos' },
    });
    expect(resumen).toBe(
      'Facturación: Ana López (fact@x.com) · Médico ocupacional: medico@x.com · Administrador: Carlos',
    );
  });

  it('returns null when nothing was filled', () => {
    expect(construirResumenDatos({})).toBeNull();
  });
});

describe('DatosModal — pedir datos', () => {
  it('rejects an invalid correo client-side before fetching', async () => {
    renderModal();

    await userEvent.type(
      screen.getByLabelText('Correo', { selector: '#dato-facturacion-correo' }),
      'no-es-correo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pedir datos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no es válido');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts DatosSolicitados with the structured datos payload', async () => {
    fetchMock.mockResolvedValue(okResponse());
    renderModal();

    await userEvent.type(
      screen.getByLabelText('Encargado', { selector: '#dato-facturacion-encargado' }),
      'Ana López',
    );
    await userEvent.type(
      screen.getByLabelText('Correo', { selector: '#dato-facturacion-correo' }),
      'fact@x.com',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pedir datos' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/crm/empresas/42/transiciones');
    expect(JSON.parse(String(init.body))).toEqual({
      evento: 'DatosSolicitados',
      datos: { facturacion: { encargado: 'Ana López', correo: 'fact@x.com' } },
    });
  });

  it('sends empty datos when nothing was filled (all optional)', async () => {
    fetchMock.mockResolvedValue(okResponse());
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Pedir datos' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ evento: 'DatosSolicitados', datos: {} });
  });
});
