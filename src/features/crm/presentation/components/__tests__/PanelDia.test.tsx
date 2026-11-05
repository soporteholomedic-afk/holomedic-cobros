import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { AlertaCrm } from '../../application/calcularAlertas';
import { PanelDia } from '../PanelDia';

const alerta = (parcial: Partial<AlertaCrm>): AlertaCrm => ({
  idEmpresa: 'e-1',
  razonSocial: 'Constructora Andina S.A.C.',
  clase: 'accion_vencida',
  etapa: 'contactado',
  tipoAccion: 'cotizar',
  detalle: 'Enviar precios OBRA',
  fecha: '2026-10-29',
  atraso: 2,
  ...parcial,
});

const cuerpo = (alertas: AlertaCrm[]) => ({
  success: true,
  alertas,
  resumen: {
    vencidas: alertas.filter((a) => a.clase === 'accion_vencida').length,
    hoy: alertas.filter((a) => a.clase === 'accion_hoy').length,
    sinResponder: alertas.filter((a) => a.clase === 'sin_responder').length,
  },
});

function mockAlertas(alertas: AlertaCrm[], falla = false): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () =>
    falla ? new Response('boom', { status: 500 }) : Response.json(cuerpo(alertas)),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const VENCIDA = alerta({});
const HOY = alerta({ idEmpresa: 'e-2', razonSocial: 'Minera Cobre S.A.', clase: 'accion_hoy', tipoAccion: 'llamar', detalle: null, fecha: '2026-10-31', atraso: 0 });
const ESPERA = alerta({ idEmpresa: 'e-3', razonSocial: 'Transporte Río S.A.C.', clase: 'sin_responder', tipoAccion: null, detalle: null, fecha: '2026-10-29T11:00:00.000Z', atraso: 52 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanelDia (S1, S5)', () => {
  it('renders nothing when there are no pending alerts (zero noise)', async () => {
    mockAlertas([]);
    const { container } = render(<PanelDia reloadKey={0} onAbrir={() => {}} />);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Tu día' })).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the three groups with counts and the overdue/today/waiting texts', async () => {
    mockAlertas([VENCIDA, HOY, ESPERA]);
    render(<PanelDia reloadKey={0} onAbrir={() => {}} />);
    const panel = await screen.findByRole('region', { name: 'Tu día' });
    expect(panel).toHaveTextContent('Vencidas');
    expect(panel).toHaveTextContent('Vencen hoy');
    expect(panel).toHaveTextContent('Sin respuesta');
    expect(screen.getByRole('button', { name: /Constructora Andina.*Enviar cotización.*2 días de atraso/s })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Minera Cobre.*Llamar$/s })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transporte Río.*52 h esperando/s })).toBeInTheDocument();
  });

  it('opens the empresa detail when an alert row is clicked', async () => {
    mockAlertas([VENCIDA, HOY, ESPERA]);
    const onAbrir = vi.fn();
    render(<PanelDia reloadKey={0} onAbrir={onAbrir} />);
    await screen.findByRole('region', { name: 'Tu día' });
    fireEvent.click(screen.getByRole('button', { name: /Transporte Río/ }));
    expect(onAbrir).toHaveBeenCalledWith('e-3');
  });

  it('refetches when reloadKey changes', async () => {
    const fn = mockAlertas([VENCIDA]);
    const { rerender } = render(<PanelDia reloadKey={0} onAbrir={() => {}} />);
    await screen.findByRole('region', { name: 'Tu día' });
    rerender(<PanelDia reloadKey={1} onAbrir={() => {}} />);
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    expect(fn.mock.calls.every(([url]) => url === '/api/crm/alertas')).toBe(true);
  });

  it('shows an error row with retry when the endpoint fails', async () => {
    const fn = mockAlertas([], true);
    render(<PanelDia reloadKey={0} onAbrir={() => {}} />);
    const reintenta = await screen.findByRole('button', { name: /Reintentar/ });
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las alertas');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(cuerpo([VENCIDA]))));
    fireEvent.click(reintenta);
    await screen.findByRole('region', { name: 'Tu día' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
