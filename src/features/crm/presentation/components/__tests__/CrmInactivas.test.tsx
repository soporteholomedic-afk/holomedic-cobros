import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { EmpresaInactiva } from '../../../application/listarEmpresasInactivas';
import { CrmInactivas } from '../CrmInactivas';
import { json } from './crmFixtures';

const RUTA = '/api/crm/empresas/inactivas';

function fila(overrides: Partial<EmpresaInactiva> = {}): EmpresaInactiva {
  return {
    idEmpresa: 'e-a',
    razonSocial: 'Clínica Vieja S.A.C.',
    ruc: '20100000001',
    sector: 'Odontología',
    ultimaAtencion: '2026-05-01',
    mesesSinActividad: 6,
    estado: 'sin_actividad',
    ...overrides,
  };
}

const LISTADO_OK = {
  success: true,
  filas: [
    fila(),
    fila({
      idEmpresa: 'e-n',
      razonSocial: 'Clínica Nueva E.I.R.L.',
      ruc: '20200000002',
      sector: null,
      ultimaAtencion: null,
      mesesSinActividad: null,
      estado: 'pendiente_primera',
    }),
  ],
  sinInformacion: 2,
};

let base: typeof fetch;
beforeEach(() => {
  base = global.fetch;
});
afterEach(() => {
  global.fetch = base;
  vi.restoreAllMocks();
});

/** Fake of the inactivas endpoint; replays the last answer when exhausted. */
function fetchInactivas(secuencia: Array<{ status: number; body: unknown } | { fallo: Error }>) {
  let i = 0;
  const fn = vi.fn(async (url: string) => {
    if (url !== RUTA) throw new Error(`ruta inesperada: ${url}`);
    const paso = secuencia[Math.min(i, secuencia.length - 1)];
    i += 1;
    if ('fallo' in paso) throw paso.fallo;
    return json({ status: paso.status, body: paso.body });
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('CrmInactivas — clientes SIGLA sin actividad 4+ meses (S2/S3)', () => {
  it('renders the rows as received: empresa, sector, months, last attention, and the sin-RUC note', async () => {
    const fetchMock = fetchInactivas([{ status: 200, body: LISTADO_OK }]);
    const onCargado = vi.fn();
    render(<CrmInactivas onCargado={onCargado} />);

    expect(await screen.findByText('Clínica Vieja S.A.C.')).toBeTruthy();
    expect(screen.getByText('Odontología')).toBeTruthy();
    expect(screen.getByText('6 meses')).toBeTruthy();
    expect(screen.getByText('vie 1 may')).toBeTruthy(); // formatoCorto del proyecto
    // pendiente_primera shows its own label, never a month count (S6.7)
    expect(screen.getByText('Pendiente de primera atención')).toBeTruthy();
    expect(screen.queryByText('null meses')).toBeNull();
    expect(screen.getByText('2 empresas cliente sin RUC no se pueden evaluar.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(RUTA, { cache: 'no-store' });
    await waitFor(() => expect(onCargado).toHaveBeenCalledWith(2));
  });

  it('a SIGLA failure shows a clear message and Reintentar reloads the list', async () => {
    const fetchMock = fetchInactivas([
      { status: 503, body: { success: false, error: 'No se pudo consultar la actividad en SIGLA' } },
      { status: 200, body: LISTADO_OK },
    ]);
    const onCargado = vi.fn();
    render(<CrmInactivas onCargado={onCargado} />);

    expect(await screen.findByText('No se pudo consultar la actividad en SIGLA')).toBeTruthy();
    expect(onCargado).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Clínica Vieja S.A.C.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onCargado).toHaveBeenCalledWith(2));
  });

  it('an empty list shows the empty state and hides the sin-RUC note', async () => {
    fetchInactivas([{ status: 200, body: { success: true, filas: [], sinInformacion: 0 } }]);
    render(<CrmInactivas />);

    expect(await screen.findByText('No hay empresas cliente sin actividad hace 4 meses o más.')).toBeTruthy();
    expect(screen.queryByText(/sin RUC/)).toBeNull();
  });
});
