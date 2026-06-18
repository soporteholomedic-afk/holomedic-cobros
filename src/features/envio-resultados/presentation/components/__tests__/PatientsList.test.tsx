import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PatientsList } from '../PatientsList';
import type { SpResultRow } from '@/types/sp-result';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRow(overrides: Partial<SpResultRow> = {}): SpResultRow {
  return {
    NroDId: '12345678',
    Pacien: 'GARCIA LOPEZ JUAN',
    NomCom: 'ACME S.A.',
    DesTCh: 'PREOCUPACIONAL',
    FecAte: '2026-06-15',
    Condic: 'APTO',
    ...overrides,
  } as SpResultRow;
}

describe('PatientsList', () => {
  it('shows a loading spinner with text and no table while loading', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    expect(screen.getByText(/Cargando pacientes/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty message and no table when rows is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [], companies: [] }),
    });

    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No se encontraron pacientes para el rango/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error message and a "Reintentar" button on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'));

    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('re-fetches when "Reintentar" is clicked after an error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: [makeRow()], companies: [] }),
      });

    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('renders one row per SpResultRow including same-DNI duplicates', async () => {
    const rows: SpResultRow[] = [
      makeRow({ NroDId: '11111111', Pacien: 'ALARCON PEREZ ANA', DesTCh: 'PREOCUPACIONAL' }),
      makeRow({ NroDId: '11111111', Pacien: 'ALARCON PEREZ ANA', DesTCh: 'ADICIONALES' }),
      makeRow({ NroDId: '22222222', Pacien: 'ZAPATA RIOS LUIS' }),
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows, companies: [] }),
    });

    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Three rows: 2 with same DNI, 1 different. No dedup.
    const tableRows = screen.getAllByRole('row');
    // First row is the header, so 3 data rows = 4 total
    expect(tableRows.length).toBe(4);
  });

  it('sorts rows by Pacien (localeCompare) ascending', async () => {
    const rows: SpResultRow[] = [
      makeRow({ NroDId: '3', Pacien: 'ZAPATA RIOS LUIS' }),
      makeRow({ NroDId: '1', Pacien: 'ALARCON PEREZ ANA' }),
      makeRow({ NroDId: '2', Pacien: 'MENDOZA GOMEZ CARLOS' }),
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows, companies: [] }),
    });

    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Get the rendered data rows in order
    const dataRows = screen.getAllByRole('row').slice(1); // skip header
    const nombres = dataRows.map((tr) => {
      const cells = tr.querySelectorAll('td');
      return cells[1]?.textContent ?? '';
    });

    expect(nombres).toEqual([
      'ALARCON PEREZ ANA',
      'MENDOZA GOMEZ CARLOS',
      'ZAPATA RIOS LUIS',
    ]);
  });

  it('renders em-dash (U+2014) for empty string cells', async () => {
    const rows: SpResultRow[] = [
      makeRow({ NomCom: '', DesTCh: '', FecAte: '', Condic: '' }),
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows, companies: [] }),
    });

    const { container } = render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Em-dash characters should appear in the cells
    const html = container.innerHTML;
    expect(html).toContain('\u2014');
  });

  it('invokes onViewFiles with the exact SpResultRow when "Ver Archivos" is clicked', async () => {
    const row = makeRow({
      NroDId: '99999999',
      Pacien: 'PEREZ DIAZ MARIA',
      NomCom: 'EMPRESA XYZ',
      DesTCh: 'PERIODICO',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [row], companies: [] }),
    });

    const onViewFiles = vi.fn();
    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={onViewFiles}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/i }));

    expect(onViewFiles).toHaveBeenCalledTimes(1);
    expect(onViewFiles).toHaveBeenCalledWith(row);
  });

  it('renders the expected column headers in order', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [makeRow()], companies: [] }),
    });

    render(
      <PatientsList
        fechaInicio="2026-06-01"
        fechaFin="2026-06-30"
        onViewFiles={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual([
      'DNI',
      'Nombre',
      'Empresa',
      'Tipo de Examen',
      'Fecha',
      'Aptitud',
      'Acción',
    ]);
  });
});
