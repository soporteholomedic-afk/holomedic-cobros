import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock parseValoracionesCsvContent — it depends on xlsx which is heavy for tests
// NOTE: vi.hoisted is REQUIRED because vi.mock is hoisted to the top of the file
const mockParseCsv = vi.hoisted(() => vi.fn());
vi.mock('@/utils/valoracionesCore', () => ({
  parseValoracionesCsvContent: mockParseCsv,
}));

import ValoracionesPage from '../page';

const mockGroupedData = {
  companies: [
    {
      company: 'EMPRESA A',
      rows: [
        {
          facturar_a: 'EMPRESA A',
          contratades: '',
          proyectodes: '',
          cr_proy: '',
          dociden: 'DNI 12345678',
          nombre: 'JUAN PEREZ',
          edad: 30,
          'Fecha de Nacimiento': '15/05/1996',
          ocupacion: 'EMPLEADO',
          tipotrab: 'EMPLEADO',
          feorden: '',
          tipo_examen: 'PREOCUPACIONAL',
          perfil: 'PUESTO ADMINISTRATIVO',
          solicitado: '',
          costo: 141,
        },
      ],
      subtotal: 141,
      igv: 25.38,
      total: 166.38,
    },
    {
      company: 'EMPRESA B',
      rows: [
        {
          facturar_a: 'EMPRESA B',
          contratades: '',
          proyectodes: '',
          cr_proy: '',
          dociden: 'RUC 20123456789',
          nombre: 'MARIA GONZALES',
          edad: 28,
          'Fecha de Nacimiento': '10/03/1998',
          ocupacion: 'TECNICO',
          tipotrab: 'EMPLEADO',
          feorden: '',
          tipo_examen: 'OCUPACIONAL',
          perfil: 'PUESTO OPERATIVO',
          solicitado: '',
          costo: 200,
        },
      ],
      subtotal: 200,
      igv: 36,
      total: 236,
    },
  ],
};

function createMockFile(name = 'archivos-crudos.csv'): File {
  return new File(
    ['facturar a,total\nEMPRESA A,141.00\nEMPRESA B,200.00'],
    name,
    { type: 'text/csv' },
  );
}

describe('ValoracionesPage — Upload → List → Detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  // ---- Upload View ----

  it('debe mostrar la vista de carga inicialmente con el título', () => {
    render(<ValoracionesPage />);
    expect(screen.getByText('Generación de Valoraciones')).toBeInTheDocument();
    expect(screen.getByText('Arrastra tu archivo CSV')).toBeInTheDocument();
  });

  it('debe mostrar error si se selecciona un archivo que no es CSV', async () => {
    const user = userEvent.setup();
    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    const file = new File(['data'], 'datos.txt', { type: 'text/plain' });

    // The accept=".csv" should prevent non-matching files from being applied
    // But for robustness, also test drag-and-drop which doesn't respect accept
    await user.upload(input, file);

    // Since input has accept=".csv", non-CSV files should not trigger the change event
    expect(screen.getByText('Arrastra tu archivo CSV')).toBeInTheDocument();
  });

  it('debe mostrar error por drag-and-drop de archivo no-CSV', () => {
    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    const dropZone = input.parentElement!;
    const file = new File(['data'], 'datos.txt', { type: 'text/plain' });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        items: [file],
        types: ['Files'],
      },
    });

    expect(screen.getByText('Solo se aceptan archivos CSV')).toBeInTheDocument();
  });

  // ---- Upload → List transition ----

  it('debe cambiar a vista de lista después de cargar un CSV válido', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    // Wait for FileReader + state update
    await waitFor(() => {
      expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
      expect(screen.getByText('EMPRESA B')).toBeInTheDocument();
    });

    // Upload view should no longer be visible
    expect(
      screen.queryByText('Arrastra tu archivo CSV'),
    ).not.toBeInTheDocument();

    // List view should show the "Descargar todo" button
    expect(screen.getByText('Descargar todo')).toBeInTheDocument();

    // Should show "Nuevo archivo" button to go back
    expect(screen.getByText('Nuevo archivo')).toBeInTheDocument();
  });

  it('debe llamar a parseValoracionesCsvContent con el contenido del CSV', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(mockParseCsv).toHaveBeenCalledTimes(1);
      // Should be called with the file content read by FileReader
      expect(mockParseCsv).toHaveBeenCalledWith(
        expect.stringContaining('EMPRESA A'),
      );
    });
  });

  it('debe mostrar error si parseValoracionesCsvContent falla', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockImplementation(() => {
      throw new Error('Error de parseo');
    });

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('Error de parseo')).toBeInTheDocument();
    });

    // Should still be in upload view
    expect(screen.getByText('Arrastra tu archivo CSV')).toBeInTheDocument();
  });

  // ---- List → Detail transition ----

  it('debe abrir el modal de detalle al hacer clic en una empresa', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    });

    // Click on company (use getAllByText since "EMPRESA A" may appear in both list and modal)
    fireEvent.click(screen.getAllByText('EMPRESA A')[0]);

    // Modal should open
    expect(screen.getByText('Detalle de Valoraciones')).toBeInTheDocument();
    expect(screen.getByText('Descargar Excel')).toBeInTheDocument();

    // Company name appears in both list and modal — at least once
    expect(screen.getAllByText('EMPRESA A').length).toBeGreaterThanOrEqual(1);

    // Summary cards (labels appear in both list table header and modal summary)
    expect(screen.getAllByText('Subtotal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('IGV 18%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Total').length).toBeGreaterThanOrEqual(1);
  });

  it('debe cerrar el modal al hacer clic en Cerrar', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('EMPRESA A'));
    expect(screen.getByText('Detalle de Valoraciones')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Cerrar'));

    await waitFor(() => {
      expect(
        screen.queryByText('Detalle de Valoraciones'),
      ).not.toBeInTheDocument();
    });

    // List view still visible
    expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
  });

  // ---- Download flows ----

  it('debe enviar POST sin company al hacer clic en Descargar todo', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: () =>
        Promise.resolve(
          new Blob(['fake-xlsx'], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ),
      headers: new Headers({
        'Content-Disposition':
          'attachment; filename="valoraciones_por_empresa_2026-06-04.xlsx"',
      }),
    } as Response);

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('Descargar todo')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Descargar todo'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/valoraciones/generate',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
    });

    // Verify company is NOT in the FormData
    const callArgs = fetchMock.mock.calls[0];
    const formData = callArgs[1]?.body as FormData;
    expect(formData.has('company')).toBe(false);
    expect(formData.has('file')).toBe(true);
  });

  it('debe enviar POST con company al hacer clic en Descargar Excel en el modal', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: () =>
        Promise.resolve(
          new Blob(['fake-xlsx'], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ),
      headers: new Headers({
        'Content-Disposition':
          'attachment; filename="valoraciones_EMPRESA A_2026-06-04.xlsx"',
      }),
    } as Response);

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    });

    // Open company detail
    fireEvent.click(screen.getByText('EMPRESA A'));

    await waitFor(() => {
      expect(screen.getByText('Descargar Excel')).toBeInTheDocument();
    });

    // Click Descargar Excel
    await user.click(screen.getByText('Descargar Excel'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Verify company IS in the FormData
    const callArgs = fetchMock.mock.calls[0];
    const formData = callArgs[1]?.body as FormData;
    expect(formData.has('company')).toBe(true);
    expect(formData.get('company')).toBe('EMPRESA A');
    expect(formData.has('file')).toBe(true);
  });

  it('debe mostrar error de descarga en el modal cuando falla', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Error de red'),
    );

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('EMPRESA A'));

    await waitFor(() => {
      expect(screen.getByText('Descargar Excel')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Descargar Excel'));

    await waitFor(() => {
      expect(screen.getByText('Error de red')).toBeInTheDocument();
    });
  });

  it('debe mostrar error de descarga general en el banner de error', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Error de red'),
    );

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('Descargar todo')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Descargar todo'));

    await waitFor(() => {
      expect(screen.getByText('Error de red')).toBeInTheDocument();
    });
  });

  it('debe permitir volver a la vista de carga desde la lista', async () => {
    const user = userEvent.setup();
    mockParseCsv.mockReturnValue(mockGroupedData);

    render(<ValoracionesPage />);

    const input = screen.getByTestId('csv-input') as HTMLInputElement;
    await user.upload(input, createMockFile());

    await waitFor(() => {
      expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    });

    // Click "Nuevo archivo" to go back
    fireEvent.click(screen.getByText('Nuevo archivo'));

    await waitFor(() => {
      expect(screen.getByText('Arrastra tu archivo CSV')).toBeInTheDocument();
    });

    // Companies no longer visible
    expect(screen.queryByText('EMPRESA A')).not.toBeInTheDocument();
  });
});
