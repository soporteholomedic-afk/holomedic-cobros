import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { CrmBoard } from '../CrmBoard';
import { mockApi, oportunidad } from './crmFixtures';

/** Column order invariant: within EVERY column the newest card renders first. */
describe('CrmBoard — orden de columnas (más nuevo primero)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders every column newest-createdAt first regardless of the API array order (ties break by idOportunidad DESC)', async () => {
    mockApi({
      oportunidades: {
        status: 200,
        body: {
          success: true,
          oportunidades: [
            oportunidad({ idOportunidad: 'o-v', idEmpresa: 'e-1', nombre: 'Vieja', createdAt: '2025-01-01T00:00:00.000Z' }),
            oportunidad({
              idOportunidad: 'o-m',
              idEmpresa: 'e-2',
              nombre: 'Media',
              etapa: 'contactado',
              medio: 'llamada',
              createdAt: '2025-06-01T00:00:00.000Z',
            }),
            oportunidad({ idOportunidad: 'o-n', idEmpresa: 'e-3', nombre: 'Nueva', createdAt: '2026-03-01T00:00:00.000Z' }),
            oportunidad({ idOportunidad: 'o-b', idEmpresa: 'e-4', nombre: 'Empate B', createdAt: '2026-05-05T00:00:00.000Z' }),
            oportunidad({ idOportunidad: 'o-a', idEmpresa: 'e-5', nombre: 'Empate A', createdAt: '2026-05-05T00:00:00.000Z' }),
          ],
        },
      },
    });
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');

    const porContactar = within(screen.getByRole('region', { name: 'Por contactar' }));
    expect(porContactar.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Agroindustrial Valle Verde S.A.C.', // o-b: the same-day tie breaks by idOportunidad DESC
      'Ferretería El Maestro S.R.L.', // o-a
      'Textiles Pacífico S.A.C.', // o-n: 2026-03
      'Constructora Andina S.A.C.', // o-v: 2025-01, oldest last
    ]);

    const contactado = within(screen.getByRole('region', { name: 'Contactado' }));
    expect(contactado.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Minera Los Tres Picos S.A.', // o-m
    ]);
  });
});
