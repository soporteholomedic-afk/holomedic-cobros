import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRouterPush, searchParamsRef } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/consolidados',
}));

import { CompanySelector } from '../CompanySelector';
import type { CompanyGroup } from '@/types/sp-result';

// ---- Fixture data matching SP result structure from SQLSERVER/ejemplo_resultados.txt ----

const mockCompanies: CompanyGroup[] = [
  {
    companyName: 'CIME INGENIEROS S R L',
    workers: [
      { nombre: 'FALLA PEÑA GILMER DUBERLY', tipoExamen: 'PERIODICO', proyecto: 'UNACEM' },
    ],
    workerCount: 1,
  },
  {
    companyName: 'CHOICE SERVICE S.A.C.',
    workers: [
      { nombre: 'ASTORGA FLORES MARTIN ADRIAN', tipoExamen: 'PREOCUPACIONAL', proyecto: 'NEXA CAJAMARQUILLA' },
      { nombre: 'ASTORGA FLORES MARTIN ADRIAN', tipoExamen: 'ADICIONALES', proyecto: 'ADICIONALES' },
    ],
    workerCount: 2,
  },
  {
    companyName: 'INTELLISOFT S.A.',
    workers: [
      { nombre: 'RODRIGUEZ MEDINA JHORDAN JOSE', tipoExamen: 'PREOCUPACIONAL', proyecto: 'DISEÑO Y ADECUACIÓN DE OF PARA NVO EDIFICIO DEL CONGRESO DE LA REPÚBLICA' },
      { nombre: 'CENTURION DIAZ NILDER ROMER', tipoExamen: 'PREOCUPACIONAL', proyecto: 'DISEÑO Y ADECUACIÓN DE OF PARA NVO EDIFICIO DEL CONGRESO DE LA REPÚBLICA' },
      { nombre: 'RAMOS FLORES LUIS MARTIN JUNIOR', tipoExamen: 'PREOCUPACIONAL', proyecto: 'DISEÑO Y ADECUACIÓN DE OF PARA NVO EDIFICIO DEL CONGRESO DE LA REPÚBLICA' },
    ],
    workerCount: 3,
  },
];

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockRouterPush.mockReset();
  searchParamsRef.current = new URLSearchParams();
  global.fetch = mockFetch;
});

describe('CompanySelector', () => {
  it('should show loading indicator while fetching companies', () => {
    // Keep the promise pending so loading persists
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<CompanySelector onSelect={() => {}} />);

    expect(screen.getByText('Cargando empresas...')).toBeInTheDocument();
  });

  it('should display company cards with name and worker count after loading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    // All three company names should be visible
    expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    expect(screen.getByText('CHOICE SERVICE S.A.C.')).toBeInTheDocument();
    expect(screen.getByText('INTELLISOFT S.A.')).toBeInTheDocument();

    // Worker counts should be displayed (singular/plural)
    expect(screen.getByText('1 trabajador')).toBeInTheDocument();
    expect(screen.getByText('2 trabajadores')).toBeInTheDocument();
    expect(screen.getByText('3 trabajadores')).toBeInTheDocument();
  });

  it('should call onSelect with companyName when a company card is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    const handleSelect = vi.fn();
    render(<CompanySelector onSelect={handleSelect} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CIME INGENIEROS S R L'));
    expect(handleSelect).toHaveBeenCalledWith('CIME INGENIEROS S R L', expect.any(String), expect.any(String));

    fireEvent.click(screen.getByText('CHOICE SERVICE S.A.C.'));
    expect(handleSelect).toHaveBeenCalledWith('CHOICE SERVICE S.A.C.', expect.any(String), expect.any(String));
  });

  it('should show empty message when API returns no companies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/No hay empresas disponibles/i)).toBeInTheDocument();
    });
  });

  it('should show error state with retry button when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar las empresas/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /reintentar/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('should retry fetch when retry button is clicked after error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ companies: mockCompanies }),
      });

    render(<CompanySelector onSelect={() => {}} />);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText(/Error al cargar las empresas/i)).toBeInTheDocument();
    });

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    // Should now show company cards (re-fetched successfully)
    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not display loading indicator after companies have loaded', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    expect(screen.queryByText('Cargando empresas...')).not.toBeInTheDocument();
  });

  it('should call the API endpoint /api/consolidados/results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/consolidados/results'),
      expect.any(Object)
    );
  });
});

describe('CompanySelector - sincronización con URL', () => {
  it('debe inicializar las fechas desde los query params al montar', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-01-15');
    searchParamsRef.current.set('fechaFin', '2026-01-31');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    const inicioInput = screen.getByLabelText(/Fecha Inicio/i) as HTMLInputElement;
    const finInput = screen.getByLabelText(/Fecha Fin/i) as HTMLInputElement;

    expect(inicioInput.value).toBe('2026-01-15');
    expect(finInput.value).toBe('2026-01-31');

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it('debe usar hoy como fallback si los query params están ausentes', async () => {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    const inicioInput = screen.getByLabelText(/Fecha Inicio/i) as HTMLInputElement;
    const finInput = screen.getByLabelText(/Fecha Fin/i) as HTMLInputElement;

    expect(inicioInput.value).toBe(today);
    expect(finInput.value).toBe(today);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it('debe ignorar query params con formato inválido y caer a hoy', async () => {
    searchParamsRef.current.set('fechaInicio', 'ayer');
    searchParamsRef.current.set('fechaFin', 'mañana');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    const inicioInput = screen.getByLabelText(/Fecha Inicio/i) as HTMLInputElement;
    const finInput = screen.getByLabelText(/Fecha Fin/i) as HTMLInputElement;

    expect(inicioInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(finInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it('debe llamar a la API con las fechas de la URL en el fetch inicial', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-01-15');
    searchParamsRef.current.set('fechaFin', '2026-01-31');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('fechaInicio=2026-01-15'),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('fechaFin=2026-01-31'),
      expect.any(Object),
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it('debe pushear la URL con las nuevas fechas al enviar el formulario', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText('Cargando empresas...')).not.toBeInTheDocument();
    });

    const inicioInput = screen.getByLabelText(/Fecha Inicio/i) as HTMLInputElement;
    const finInput = screen.getByLabelText(/Fecha Fin/i) as HTMLInputElement;

    fireEvent.change(inicioInput, { target: { value: '2026-06-01' } });
    fireEvent.change(finInput, { target: { value: '2026-06-30' } });

    await waitFor(() => {
      expect(screen.queryByText('Cargando empresas...')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Filtrar/i }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      '/consolidados?fechaInicio=2026-06-01&fechaFin=2026-06-30',
    );
  });

  it('debe llamar a la API con las nuevas fechas al filtrar', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText('Cargando empresas...')).not.toBeInTheDocument();
    });

    const inicioInput = screen.getByLabelText(/Fecha Inicio/i) as HTMLInputElement;
    const finInput = screen.getByLabelText(/Fecha Fin/i) as HTMLInputElement;

    fireEvent.change(inicioInput, { target: { value: '2026-06-01' } });
    fireEvent.change(finInput, { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: /Filtrar/i }));

    await waitFor(() => {
      const calls = mockFetch.mock.calls.map((call) => call[0] as string);
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toContain('fechaInicio=2026-06-01');
      expect(lastCall).toContain('fechaFin=2026-06-30');
    });
  });

  it('debe pasar las fechas actuales de la URL a onSelect al elegir empresa', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-01-15');
    searchParamsRef.current.set('fechaFin', '2026-01-31');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    const handleSelect = vi.fn();
    render(<CompanySelector onSelect={handleSelect} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CIME INGENIEROS S R L'));

    expect(handleSelect).toHaveBeenCalledWith(
      'CIME INGENIEROS S R L',
      '2026-01-15',
      '2026-01-31',
    );
  });
});

describe('CompanySelector - remount al volver del detalle', () => {
  it('debe volver a fetchear cuando el componente se desmonta y se vuelve a montar', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    const { unmount } = render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    unmount();

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});

describe('CompanySelector - validación de rango', () => {
  it('debe deshabilitar Filtrar cuando fechaInicio es mayor a fechaFin', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-06-30');
    searchParamsRef.current.set('fechaFin', '2026-06-01');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /Filtrar/i })).toBeDisabled();
  });

  it('debe mostrar mensaje de error cuando fechaInicio es mayor a fechaFin', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-06-30');
    searchParamsRef.current.set('fechaFin', '2026-06-01');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(
      screen.getByText(/La fecha de inicio no puede ser mayor/i),
    ).toBeInTheDocument();
  });

  it('debe habilitar Filtrar cuando fechaInicio es igual a fechaFin', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-06-15');
    searchParamsRef.current.set('fechaFin', '2026-06-15');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /Filtrar/i })).toBeEnabled();
    expect(
      screen.queryByText(/La fecha de inicio no puede ser mayor/i),
    ).not.toBeInTheDocument();
  });

  it('debe habilitar Filtrar cuando fechaInicio es menor a fechaFin', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-06-01');
    searchParamsRef.current.set('fechaFin', '2026-06-30');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /Filtrar/i })).toBeEnabled();
  });

  it('debe actualizar el estado del botón al cambiar las fechas a un rango inválido', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-06-01');
    searchParamsRef.current.set('fechaFin', '2026-06-30');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const inicioInput = screen.getByLabelText(/Fecha Inicio/i) as HTMLInputElement;

    fireEvent.change(inicioInput, { target: { value: '2026-07-01' } });

    expect(screen.getByRole('button', { name: /Filtrar/i })).toBeDisabled();
    expect(
      screen.getByText(/La fecha de inicio no puede ser mayor/i),
    ).toBeInTheDocument();
  });

  it('no debe pushear la URL ni llamar a la API cuando el rango es inválido', async () => {
    searchParamsRef.current.set('fechaInicio', '2026-06-30');
    searchParamsRef.current.set('fechaFin', '2026-06-01');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const initialFetchCount = mockFetch.mock.calls.length;
    const initialPushCount = mockRouterPush.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Filtrar/i }));

    expect(mockRouterPush.mock.calls.length).toBe(initialPushCount);
    expect(mockFetch.mock.calls.length).toBe(initialFetchCount);
  });
});
