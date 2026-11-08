import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ClienteSiglaSinFicha, EmpresaInactiva } from '../../../application/listarEmpresasInactivas';
import { CrmInactivas } from '../CrmInactivas';
import { json } from './crmFixtures';

const RUTA = '/api/crm/empresas/inactivas';
const RUTA_SIGLA = `${RUTA}?fuente=sigla&pagina=1`;

function fila(overrides: Partial<EmpresaInactiva> = {}): EmpresaInactiva {
  return {
    idEmpresa: 'e-a',
    razonSocial: 'Clínica Vieja S.A.C.',
    ruc: '20100000001',
    sector: 'Odontología',
    ultimaAtencion: '2026-05-01',
    mesesSinActividad: 6,
    ultimoContactoCrm: new Date(Date.now() - 3 * 86_400_000).toISOString(), // ~3 days before now
    estado: 'sin_actividad',
    ...overrides,
  };
}

function filaSigla(overrides: Partial<ClienteSiglaSinFicha> = {}): ClienteSiglaSinFicha {
  return {
    razonSocial: 'Solo en SIGLA S.A.C.',
    ruc: '20900000001',
    telefono: '987 000 0000',
    contacto: 'Contacto SIGLA',
    correo: null,
    ultimaAtencion: '2026-03-01',
    mesesSinActividad: 8,
    estado: 'sin_actividad',
    ...overrides,
  };
}

const LISTADO_CRM = {
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
      ultimoContactoCrm: null,
      estado: 'pendiente_primera',
    }),
  ],
  sinInformacion: 2,
};

const LISTADO_SIGLA = {
  success: true,
  filas: [filaSigla()],
  total: 34, // más filas de las que trae la página: la paginación es real
  pagina: 1,
  paginas: 1,
};

let base: typeof fetch;
beforeEach(() => {
  base = global.fetch;
});
afterEach(() => {
  global.fetch = base;
  vi.restoreAllMocks();
});

/** Fake de ambas fuentes del endpoint; responde por URL con query incluida. */
function fetchInactivas(respuestas: {
  crm?: { status: number; body: unknown } | { fallo: Error };
  sigla?: { status: number; body: unknown } | { fallo: Error };
}) {
  const fn = vi.fn(async (url: string) => {
    if (url === RUTA) {
      const paso = respuestas.crm ?? { status: 200, body: { success: true, filas: [], sinInformacion: 0 } };
      if ('fallo' in paso) throw paso.fallo;
      return json({ status: paso.status, body: paso.body });
    }
    if (url.startsWith(`${RUTA}?fuente=sigla`)) {
      const paso = respuestas.sigla ?? { status: 200, body: { success: true, filas: [], total: 0, pagina: 1, paginas: 1 } };
      if ('fallo' in paso) throw paso.fallo;
      return json({ status: paso.status, body: paso.body });
    }
    throw new Error(`ruta inesperada: ${url}`);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('CrmInactivas — dos fuentes: con ficha y solo en SIGLA (S10/S12)', () => {
  it('loads both sources on mount and the badge counts the total (ficha + SIGLA)', async () => {
    const fetchMock = fetchInactivas({ crm: { status: 200, body: LISTADO_CRM }, sigla: { status: 200, body: LISTADO_SIGLA } });
    const onCargado = vi.fn();
    render(<CrmInactivas onCargado={onCargado} onRegistrar={vi.fn()} />);

    expect(await screen.findByText('Clínica Vieja S.A.C.')).toBeTruthy();
    await waitFor(() => expect(onCargado).toHaveBeenCalledWith(36)); // 2 con ficha + 34 en SIGLA (total, no la página)
    expect(fetchMock).toHaveBeenCalledWith(RUTA, { cache: 'no-store' });
    expect(fetchMock).toHaveBeenCalledWith(RUTA_SIGLA, { cache: 'no-store' });
    // segmented control with both counts
    expect(screen.getByRole('button', { name: 'Con ficha en el CRM (2)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Solo en SIGLA \(34\)/ })).toBeTruthy();
    // the sin-RUC note stays visible in the crm segment
    expect(screen.getByText('2 empresas cliente sin RUC no se pueden evaluar.')).toBeTruthy();
  });

  it('the SIGLA segment shows its rows with the Crear ficha action and its own columns', async () => {
    fetchInactivas({ crm: { status: 200, body: LISTADO_CRM }, sigla: { status: 200, body: LISTADO_SIGLA } });
    const onCrearFicha = vi.fn();
    render(<CrmInactivas onRegistrar={vi.fn()} onCrearFicha={onCrearFicha} />);

    fireEvent.click(await screen.findByRole('button', { name: /Solo en SIGLA \(34\)/ }));
    expect(await screen.findByText('Solo en SIGLA S.A.C.')).toBeTruthy();
    expect(screen.getByText('8 meses')).toBeTruthy();
    const botones = screen.getAllByRole('button', { name: 'Crear ficha' });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    expect(onCrearFicha).toHaveBeenCalledWith(
      expect.objectContaining({ ruc: '20900000001', razonSocial: 'Solo en SIGLA S.A.C.' }),
    );
    // the CRM-specific button is not here
    expect(screen.queryByRole('button', { name: 'Registrar contacto' })).toBeNull();
  });

  it('a SIGLA failure shows a clear message and Reintentar reloads both sources', async () => {
    const fetchMock = fetchInactivas({
      crm: { status: 200, body: LISTADO_CRM },
      sigla: { fallo: new Error('SIGLA caída') },
    });
    render(<CrmInactivas onRegistrar={vi.fn()} />);

    expect(await screen.findByText('No se pudo cargar los clientes de SIGLA sin ficha.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar SIGLA' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)); // 2 iniciales + 1 reintento sigla
  });

  it('the 4-month threshold copy stays (fixed, S4) and the empty CRM list keeps its positive state', async () => {
    fetchInactivas({
      crm: { status: 200, body: { success: true, filas: [], sinInformacion: 0 } },
      sigla: { status: 200, body: LISTADO_SIGLA },
    });
    render(<CrmInactivas onRegistrar={vi.fn()} />);

    expect(
      await screen.findByText('No hay empresas cliente sin actividad hace 4 meses o más.'),
    ).toBeTruthy();
  });

  it('the SIGLA segment paginates: Siguiente fetches the next page', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === RUTA) return json({ status: 200, body: LISTADO_CRM });
      if (url.startsWith(`${RUTA}?fuente=sigla&pagina=`)) {
        const pagina = Number(new URL(url, 'http://localhost').searchParams.get('pagina'));
        return json({ status: 200, body: { success: true, filas: [filaSigla()], total: 120, pagina, paginas: 3 } });
      }
      throw new Error(`ruta inesperada: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<CrmInactivas onRegistrar={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Solo en SIGLA \(120\)/ }));
    expect(await screen.findByText('Solo en SIGLA S.A.C.')).toBeTruthy();
    expect(screen.getByText(/Página 1 de 3/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`${RUTA}?fuente=sigla&pagina=2`, { cache: 'no-store' }),
    );
    expect(screen.getByText(/Página 2 de 3/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
