import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InformeNoCerradoRow, PlantillaRow } from '@/types/informe';

// ---- Hoisted mocks for the three hooks the pane uses ----

const mockUseInformeOrder = vi.hoisted(() => vi.fn());
const mockUsePlantillas = vi.hoisted(() => vi.fn());
const mockUseGenerarPdf = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useInformeOrder', () => ({
  useInformeOrder: mockUseInformeOrder,
}));
vi.mock('../../hooks/usePlantillas', () => ({
  usePlantillas: mockUsePlantillas,
}));
vi.mock('../../hooks/useGenerarPdf', () => ({
  useGenerarPdf: mockUseGenerarPdf,
  MAX_ATTEMPTS: 3,
}));

import { FilesGeneratePane } from '../FilesGeneratePane';

const mockRun = vi.fn();
const mockReset = vi.fn();

function makeOrder(overrides: Partial<InformeNoCerradoRow> = {}): InformeNoCerradoRow {
  return {
    idAten: '012110021',
    codEmp: 1,
    codSed: 1,
    codTCl: 2,
    numOrd: 100200,
    fecAte: '17/06/2026',
    codCli: 3331,
    codDCo: 76,
    ...overrides,
  };
}

function makePlantillas(): PlantillaRow[] {
  return [
    { codPMe: 100, arcPla: 'exa_aud', ordPri: 1, idePMe: 39053, ideFMe: null },
    { codPMe: 101, arcPla: 'exa_lab', ordPri: 2, idePMe: 39056, ideFMe: null },
    { codPMe: 102, arcPla: 'exa_ekg', ordPri: 3, idePMe: 39060, ideFMe: null },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: order is ready, plantillas are ready, hook is idle.
  mockUseInformeOrder.mockReturnValue({ state: { kind: 'ready', row: makeOrder() } });
  mockUsePlantillas.mockReturnValue({ state: { kind: 'ready', items: makePlantillas() } });
  mockUseGenerarPdf.mockReturnValue({
    status: 'idle',
    result: null,
    lastError: null,
    attempts: 0,
    run: mockRun,
    reset: mockReset,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FilesGeneratePane', () => {
  it('renders the "no order" notice when fecAte is empty (worker-sourced ficha)', () => {
    mockUseInformeOrder.mockReturnValue({ state: { kind: 'empty' } });
    mockUsePlantillas.mockReturnValue({ state: { kind: 'empty' } });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte=""
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText(/No se puede generar archivos/)).toBeInTheDocument();
  });

  it('renders the order-loading skeleton while the lookup is in flight', () => {
    mockUseInformeOrder.mockReturnValue({ state: { kind: 'loading' } });
    mockUsePlantillas.mockReturnValue({ state: { kind: 'empty' } });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByTestId('files-generate-order-skeleton')).toBeInTheDocument();
  });

  it('renders the order-error block when the lookup fails', () => {
    mockUseInformeOrder.mockReturnValue({ state: { kind: 'error', message: 'HTTP 500' } });
    mockUsePlantillas.mockReturnValue({ state: { kind: 'empty' } });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText('HTTP 500')).toBeInTheDocument();
  });

  it('renders the "orden no encontrada" notice when the lookup is empty (404)', () => {
    mockUseInformeOrder.mockReturnValue({ state: { kind: 'empty' } });
    mockUsePlantillas.mockReturnValue({ state: { kind: 'empty' } });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText(/No se encontró la orden 012110021 en 17\/06\/2026/)).toBeInTheDocument();
  });

  it('renders the plantillas-loading skeleton after the order is ready', () => {
    mockUseInformeOrder.mockReturnValue({ state: { kind: 'ready', row: makeOrder() } });
    mockUsePlantillas.mockReturnValue({ state: { kind: 'loading' } });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByTestId('files-generate-plantillas-skeleton')).toBeInTheDocument();
  });

  it('renders the "no plantillas" notice when the plantillas list is empty', () => {
    mockUseInformeOrder.mockReturnValue({ state: { kind: 'ready', row: makeOrder() } });
    mockUsePlantillas.mockReturnValue({ state: { kind: 'empty' } });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText(/No hay plantillas disponibles/)).toBeInTheDocument();
  });

  it('renders one checkbox per plantilla with the arcPla label and the idePMe id', () => {
    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(screen.getByText('exa_aud')).toBeInTheDocument();
    expect(screen.getByText('exa_lab')).toBeInTheDocument();
    expect(screen.getByText('exa_ekg')).toBeInTheDocument();
    expect(screen.getByText('#39053')).toBeInTheDocument();
  });

  it('Descargar button is disabled when no plantilla is selected', () => {
    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByTestId('files-generate-download');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('Descargar button is disabled when the order has codCli=null', () => {
    mockUseInformeOrder.mockReturnValue({
      state: { kind: 'ready', row: makeOrder({ codCli: null }) },
    });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    const checkbox = screen.getByTestId('files-generate-checkbox-39053');
    fireEvent.click(checkbox);

    const button = screen.getByTestId('files-generate-download');
    expect(button).toBeDisabled();
  });

  it('clicking a checkbox toggles its selection; Descargar becomes enabled', () => {
    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    const checkbox = screen.getByTestId('files-generate-checkbox-39053');
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    const button = screen.getByTestId('files-generate-download');
    expect(button).not.toBeDisabled();
    expect(screen.getByTestId('files-generate-counter')).toHaveTextContent('1 seleccionado');
  });

  it('clicking Descargar invokes useGenerarPdf.run with the selected idePmeList', () => {
    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('files-generate-checkbox-39053'));
    fireEvent.click(screen.getByTestId('files-generate-checkbox-39056'));
    fireEvent.click(screen.getByTestId('files-generate-download'));

    expect(mockRun).toHaveBeenCalledTimes(1);
    const request = mockRun.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      idAten: '012110021',
      codEmp: 1,
      codSed: 1,
      codTCl: 2,
      numOrd: 100200,
      codCli: 3331,
      ruc: '20123456789',
      dni: '12345678',
      idePmeList: [39053, 39056],
    });
  });

  it('renders the "Descargando... (intento X/3)" label while status is loading', () => {
    mockUseGenerarPdf.mockReturnValue({
      status: 'loading',
      result: null,
      lastError: null,
      attempts: 2,
      run: mockRun,
      reset: mockReset,
    });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByTestId('files-generate-download');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/Descargando\.\.\. \(intento 2\/3\)/);
  });

  it('renders the result table with one row per manifest entry on success and calls onSuccess once', async () => {
    const result = {
      manifest: [
        { idePMe: 39053, arcPla: 'exa_aud', file: '012110021_39053_exa_aud.pdf', status: 'success' as const },
        { idePMe: 39056, arcPla: 'exa_lab', status: 'skipped' as const, reason: 'ya generado' },
      ],
      summary: { generated: 1, failed: 0, skipped: 1, exitCode: 0 },
    };
    const onSuccess = vi.fn();
    mockUseGenerarPdf.mockReturnValue({
      status: 'success',
      result,
      lastError: null,
      attempts: 1,
      run: mockRun,
      reset: mockReset,
    });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByTestId('files-generate-row-39053')).toHaveTextContent('success');
    expect(screen.getByTestId('files-generate-row-39056')).toHaveTextContent('skipped');
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).toHaveBeenCalledWith(result);
  });

  it('renders the error block with the lastError message on failure', () => {
    mockUseGenerarPdf.mockReturnValue({
      status: 'error',
      result: null,
      lastError: 'No se puede acceder a la ruta',
      attempts: 3,
      run: mockRun,
      reset: mockReset,
    });

    render(
      <FilesGeneratePane
        ruc="20123456789"
        dni="12345678"
        idAten="012110021"
        fecAte="17/06/2026"
        onSuccess={vi.fn()}
      />,
    );

    const errorBlock = screen.getByTestId('files-generate-error');
    expect(errorBlock).toHaveTextContent('No se puede acceder a la ruta');
  });
});
