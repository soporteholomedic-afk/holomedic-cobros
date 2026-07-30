import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MusculoEsqueleticaJjcPage from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

describe('MusculoEsqueleticaJjcPage', () => {
  it('renders PDF column header and one download button per row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockRows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<MusculoEsqueleticaJjcPage />);

    await waitFor(() => {
      expect(screen.getByText('JUAN PEREZ')).toBeInTheDocument();
      expect(screen.getByText('MARIA GONZALES')).toBeInTheDocument();
    });

    const pdfHeaders = screen.getAllByRole('columnheader', { name: 'PDF' });
    expect(pdfHeaders).toHaveLength(1);

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

    render(<MusculoEsqueleticaJjcPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /No se encontraron pacientes para el rango de fechas seleccionado/,
        ),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /Descargar PDF de/ }),
    ).not.toBeInTheDocument();
  });
});
