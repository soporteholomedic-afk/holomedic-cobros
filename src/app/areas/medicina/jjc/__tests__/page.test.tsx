import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MedicinaJjcPage from '../page';

// Mock next/navigation — the page uses useRouter for the "Seleccionar" / "Hecho" buttons
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock sonner — DownloadCell imports it; avoid unwanted console output
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const mockRows = [
  {
    idAtencion: '000001',
    dni: '40123456',
    paciente: 'JUAN PEREZ',
    sexo: 'M',
    fechaNac: '1990-01-15',
    edad: 36,
    fechaAtencion: '2026-07-21',
    servicio: 'MEDICINA',
    especialidad: 'MEDICINA OCUPACIONAL',
    empresa: 'JJC CONTRATISTAS GENERALES S.A.',
    tipoExamen: 'OCUPACIONAL',
    puesto: 'OPERARIO',
    hasEvaluacion: true,
  },
  {
    idAtencion: '000002',
    dni: '40987654',
    paciente: 'MARIA GONZALES',
    sexo: 'F',
    fechaNac: '1995-03-20',
    edad: 31,
    fechaAtencion: '2026-07-21',
    servicio: 'MEDICINA',
    especialidad: 'MEDICINA OCUPACIONAL',
    empresa: 'JJC CONTRATISTAS GENERALES S.A.',
    tipoExamen: 'PREOCUPACIONAL',
    puesto: 'ADMINISTRATIVO',
    hasEvaluacion: false,
  },
];

describe('MedicinaJjcPage — 8th column smoke test', () => {
  it('renders "PDF" column header and one download button per row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockRows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<MedicinaJjcPage />);

    // Wait for fetch to resolve and rows to appear
    await waitFor(() => {
      expect(screen.getByText('JUAN PEREZ')).toBeInTheDocument();
      expect(screen.getByText('MARIA GONZALES')).toBeInTheDocument();
    });

    // 8th column header must be present
    const pdfHeaders = screen.getAllByRole('columnheader', { name: 'PDF' });
    expect(pdfHeaders).toHaveLength(1);

    // Each row has exactly one download button
    const downloadButtons = screen.getAllByRole('button', {
      name: /Descargar PDF de/,
    });
    expect(downloadButtons).toHaveLength(2);
  });

  it('renders no download buttons when the rows list is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<MedicinaJjcPage />);

    // Wait for the empty-state message to appear
    await waitFor(() => {
      expect(
        screen.getByText(
          /No se encontraron pacientes para el rango de fechas seleccionado/,
        ),
      ).toBeInTheDocument();
    });

    // No download buttons when there are no rows
    expect(
      screen.queryByRole('button', { name: /Descargar PDF de/ }),
    ).not.toBeInTheDocument();
  });
});
