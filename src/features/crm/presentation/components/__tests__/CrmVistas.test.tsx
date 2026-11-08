import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';


vi.mock('../CrmBoard', () => ({ CrmBoard: () => <div>BOARD-FAKE</div> }));
vi.mock('../AltaPanel', () => ({
  AltaPanel: (props: {
    inicial?: { razonSocial?: string; ruc?: string };
    onCerrar: () => void;
    onCrear: (cuerpo: Record<string, unknown>) => Promise<unknown>;
  }) => (
    <button
      type="button"
      onClick={() => {
        void props.onCrear({ razonSocial: props.inicial?.razonSocial, ruc: props.inicial?.ruc, contactos: [] }).then(() =>
          props.onCerrar(),
        );
      }}
    >
      ALTA-FAKE {props.inicial?.razonSocial}
    </button>
  ),
}));
vi.mock('../RegistrarContactoPanel', () => ({
  RegistrarContactoPanel: (props: { onGuardado: (empresa: unknown, oportunidad: unknown) => void }) => (
    <button type="button" onClick={() => props.onGuardado(null, null)}>
      GUARDAR-FAKE
    </button>
  ),
}));

import { CrmVistas } from '../CrmVistas';
import { json } from './crmFixtures';

const RUTA = '/api/crm/empresas/inactivas';

let base: typeof fetch;
beforeEach(() => {
  base = global.fetch;
});
afterEach(() => {
  global.fetch = base;
  vi.restoreAllMocks();
});

describe('CrmVistas — tab Pipeline | Inactivas dentro de /crm (S1)', () => {
  it('renders the board first and swaps to the Inactivas list when its tab opens', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === RUTA) return json({ status: 200, body: { success: true, filas: [], sinInformacion: 0 } });
      if (url === `${RUTA}?fuente=sigla&pagina=1`)
        return json({ status: 200, body: { success: true, filas: [], total: 0, pagina: 1, paginas: 1 } });
      throw new Error(`ruta inesperada: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<CrmVistas />);
    expect(screen.getByText('BOARD-FAKE')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled(); // lazy: SIGLA only when the tab opens

    fireEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));
    expect(screen.queryByText('BOARD-FAKE')).toBeNull();
    expect(await screen.findByText('No hay empresas cliente sin actividad hace 4 meses o más.')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // ambas fuentes al abrir el tab
    expect(screen.getByRole('tab', { name: /Inactivas/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('the Inactivas tab keeps the count as a badge after the list loads', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${RUTA}?fuente=sigla&pagina=1`)
        return json({ status: 200, body: { success: true, filas: [], total: 0, pagina: 1, paginas: 1 } });
      if (url !== RUTA) throw new Error(`ruta inesperada: ${url}`);
      return json({
        status: 200,
        body: {
          success: true,
          filas: [
            {
              idEmpresa: 'e-a',
              razonSocial: 'Clínica Vieja S.A.C.',
              ruc: '20100000001',
              sector: 'Odontología',
              ultimaAtencion: '2026-05-01',
              mesesSinActividad: 6,
              ultimoContactoCrm: null,
              estado: 'sin_actividad',
            },
          ],
          sinInformacion: 0,
        },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<CrmVistas />);
    fireEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));
    expect(await screen.findByText('Clínica Vieja S.A.C.')).toBeTruthy();
    // The badge lands one render after the rows (child effect notifies the parent).
    await waitFor(() => expect(screen.getByRole('tab', { name: /Inactivas/ })).toHaveTextContent('1'));
    expect(screen.getByRole('tab', { name: /Inactivas/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('Crear ficha opens the prefilled alta, PATCHes relation cliente and reloads (S11)', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === RUTA) return json({ status: 200, body: { success: true, filas: [], sinInformacion: 0 } });
      if (url === `${RUTA}?fuente=sigla&pagina=1`)
        return json({
          status: 200,
          body: {
            success: true,
            filas: [
              { razonSocial: 'Solo en SIGLA S.A.C.', ruc: '20900000001', telefono: null, contacto: null, correo: null, ultimaAtencion: '2026-05-01', mesesSinActividad: 5, estado: 'sin_actividad' },
            ],
            total: 1,
            pagina: 1,
            paginas: 1,
          },
        });
      if (url === '/api/crm/sectores') return json({ status: 200, body: { success: true, sectores: [{ nombre: 'Odontología' }] } });
      if (url === '/api/crm/empresas' && (init?.method ?? 'GET') === 'POST')
        return json({ status: 200, body: { success: true, empresa: { idEmpresa: 'e-nueva', razonSocial: 'Solo en SIGLA S.A.C.' } } });
      if (url === '/api/crm/empresas/e-nueva/relacion' && (init?.method ?? 'GET') === 'PATCH')
        return json({ status: 200, body: { success: true } });
      throw new Error(`ruta inesperada: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<CrmVistas />);
    fireEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Solo en SIGLA \(1\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear ficha' }));
    expect(await screen.findByText(/ALTA-FAKE Solo en SIGLA S\.A\.C\./)).toBeTruthy(); // prellenado con la razón social de SIGLA
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/sectores', { cache: 'no-store' });

    fireEvent.click(screen.getByRole('button', { name: /ALTA-FAKE/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas', expect.objectContaining({ method: 'POST' })));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/e-nueva/relacion', expect.objectContaining({ method: 'PATCH' })),
    );
    await waitFor(() => expect(screen.queryByText(/ALTA-FAKE/)).toBeNull()); // el alta se cierra sola
  });

  it('opens the registrar-contacto panel from a row and reloads the list after saving (S6)', async () => {
    const llamadasInactivas = { n: 0 };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === RUTA) {
        llamadasInactivas.n += 1;
        return json({
          status: 200,
          body: {
            success: true,
            filas: [
              {
                idEmpresa: 'e-a',
                razonSocial: 'Clínica Vieja S.A.C.',
                ruc: '20100000001',
                sector: 'Odontología',
                ultimaAtencion: '2026-05-01',
                mesesSinActividad: 6,
                ultimoContactoCrm: null,
                estado: 'sin_actividad',
              },
            ],
            sinInformacion: 0,
          },
        });
      }
      if (url === '/api/crm/empresas') {
        return json({ status: 200, body: { success: true, empresas: [{ idEmpresa: 'e-a' }] } });
      }
      if (url === '/api/crm/oportunidades') {
        return json({ status: 200, body: { success: true, oportunidades: [] } });
      }
      if (url === `${RUTA}?fuente=sigla&pagina=1`)
        return json({ status: 200, body: { success: true, filas: [], total: 0, pagina: 1, paginas: 1 } });
      throw new Error(`ruta inesperada: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<CrmVistas />);
    fireEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));
    expect(await screen.findByText('Clínica Vieja S.A.C.')).toBeTruthy();
    expect(llamadasInactivas.n).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar contacto' }));
    expect(await screen.findByText('GUARDAR-FAKE')).toBeTruthy(); // panel open, fed by the two list fetches
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas');
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/oportunidades');

    fireEvent.click(screen.getByRole('button', { name: 'GUARDAR-FAKE' }));
    await waitFor(() => expect(screen.queryByText('GUARDAR-FAKE')).toBeNull()); // panel closed
    await waitFor(() => expect(llamadasInactivas.n).toBe(2)); // list reloaded: the CRM-contact column refreshes
    expect(screen.getByText('Clínica Vieja S.A.C.')).toBeTruthy(); // the row stays (S6)
  });
});
