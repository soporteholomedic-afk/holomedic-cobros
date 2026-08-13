import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpResultRow } from '@/types/sp-result';

/**
 * Page-level wiring test for `/consolidados` (PR-2 nomenclatura-adicionales).
 *
 * Verifies the integration gap found by sdd-verify (obs #417): the page's
 * `handleViewFiles` captures `DesTCh` into `modalState.tipoExamen`, but the
 * `FilesModal` render must forward it (`tipoExamen={modalState.tipoExamen}`)
 * so pane download hrefs and the selected-files zip use ADICIONAL
 * nomenclature for ADICIONALES orders (spec S-7 / S-9). The fallback
 * contract (no signal → CAMO/EMO) is pinned by the second test.
 */

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/envio-resultados/presentation/hooks/useCompanies', () => ({
  useCompanies: () => ({
    companies: [],
    selectedCompanyId: null,
    selectCompany: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/features/envio-resultados/presentation/hooks/useSedes', () => ({
  useSedes: () => ({ sedes: [], loading: false, error: null }),
}));

/** Captures the props of the last FilesModal render. */
const lastModalProps: { current: Record<string, unknown> | null } = { current: null };

vi.mock('@/features/envio-resultados/presentation/components/FilesModal', () => ({
  FilesModal: (props: Record<string, unknown>) => {
    lastModalProps.current = props;
    return <div data-testid="files-modal-mock">FilesModal</div>;
  },
}));

/** Drives the page's onViewFiles with a controlled row. */
let viewFilesRow: SpResultRow;
vi.mock('@/features/envio-resultados/presentation/components/PatientsList', () => ({
  PatientsList: ({ onViewFiles }: { onViewFiles: (row: SpResultRow) => void }) => (
    <button
      type="button"
      data-testid="trigger-view-files"
      onClick={() => onViewFiles(viewFilesRow)}
    >
      Ver Archivos
    </button>
  ),
}));

const ADICIONAL_ROW = {
  NroDId: '09614642',
  Pacien: 'JUAN PEREZ',
  DesPue: '',
  DesDes: 'COSAPI',
  SexPac: 'M',
  FecNac: '',
  EdaPac: 30,
  NomPro: '',
  DesTCh: 'ADICIONALES',
  FecAte: '02/07/2026',
  ValHas: '',
  NomCli: '',
  Condic: '',
  EstCar: '',
  PesoKg: 70,
  IMCkgm: 24,
  FreAud: '',
  CenCos: '',
  SelRes: '',
  EstPag: '',
  NomCom: 'CHOICE SERVICE S.A.C.',
  NumOrd: 110336,
} as unknown as SpResultRow;

const PLAIN_ROW = {
  ...ADICIONAL_ROW,
  DesTCh: 'PREOCUPACIONAL',
  NumOrd: 110340,
} as unknown as SpResultRow;

function mockResultsByCompanies(orders: unknown[]): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/consolidados/results_by_companies')) {
      return {
        ok: true,
        status: 200,
        json: async () => orders,
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ nodes: [] }),
    } as Response;
  }) as unknown as typeof fetch;
}

import ConsolidadosPage from '../page';

describe('ConsolidadosPage — FilesModal tipoExamen wiring (REQ-6)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    lastModalProps.current = null;
  });

  it('forwards DesTCh=ADICIONALES to FilesModal as tipoExamen when the row is ADICIONALES', async () => {
    viewFilesRow = ADICIONAL_ROW;
    mockResultsByCompanies([
      { IdAten: '012110336', NroRuc: '20123456789', NroDId: '09614642', NumOrd: 110336 },
    ]);

    render(<ConsolidadosPage />);
    fireEvent.click(screen.getByTestId('trigger-view-files'));

    await waitFor(() => expect(lastModalProps.current).not.toBeNull());
    expect(lastModalProps.current?.['tipoExamen']).toBe('ADICIONALES');
    expect(lastModalProps.current?.['idAten']).toBe('012110336');
  });

  it('forwards a non-ADICIONAL DesTCh as-is (fallback contract: no ADICIONAL inference)', async () => {
    viewFilesRow = PLAIN_ROW;
    mockResultsByCompanies([
      { IdAten: '012110340', NroRuc: '20123456789', NroDId: '09614642', NumOrd: 110340 },
    ]);

    render(<ConsolidadosPage />);
    fireEvent.click(screen.getByTestId('trigger-view-files'));

    await waitFor(() => expect(lastModalProps.current).not.toBeNull());
    expect(lastModalProps.current?.['tipoExamen']).toBe('PREOCUPACIONAL');
    expect(lastModalProps.current?.['idAten']).toBe('012110340');
  });
});
