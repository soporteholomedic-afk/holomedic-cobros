import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CompanyList from '../CompanyList';
import { CompanyGroup } from '@/utils/valoracionesCore';

const HISTORY_STORAGE_KEY = 'holomedic:search-history:company-list';

function clearSearchHistory() {
  window.localStorage.removeItem(HISTORY_STORAGE_KEY);
}

function makeCompanies(count: number): CompanyGroup[] {
  return Array.from({ length: count }, (_, i) => ({
    company: `EMPRESA ${String.fromCharCode(65 + i)}`,
    rows: [],
    subtotal: (i + 1) * 100,
    igv: (i + 1) * 18,
    total: (i + 1) * 118,
  }));
}

const sampleCompanies: CompanyGroup[] = [
  {
    company: 'CLINICA SAN MARTIN S.A.',
    rows: [
      {
        facturar_a: 'CLINICA SAN MARTIN S.A.',
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
    company: 'LABORATORIO MEDICO S.A.',
    rows: [
      {
        facturar_a: 'LABORATORIO MEDICO S.A.',
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
  {
    company: 'HOSPITAL NACIONAL S.A.',
    rows: [
      {
        facturar_a: 'HOSPITAL NACIONAL S.A.',
        contratades: '',
        proyectodes: '',
        cr_proy: '',
        dociden: 'DNI 87654321',
        nombre: 'PEDRO RAMIREZ',
        edad: 35,
        'Fecha de Nacimiento': '20/07/1991',
        ocupacion: 'MEDICO',
        tipotrab: 'EMPLEADO',
        feorden: '',
        tipo_examen: 'PREOCUPACIONAL',
        perfil: 'PUESTO ASISTENCIAL',
        solicitado: '',
        costo: 180,
      },
    ],
    subtotal: 180,
    igv: 32.4,
    total: 212.4,
  },
];

describe('CompanyList Component', () => {
  it('debe renderizar todas las empresas cuando no hay filtro', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    expect(screen.getByText('CLINICA SAN MARTIN S.A.')).toBeInTheDocument();
    expect(screen.getByText('LABORATORIO MEDICO S.A.')).toBeInTheDocument();
    expect(screen.getByText('HOSPITAL NACIONAL S.A.')).toBeInTheDocument();
  });

  it('debe filtrar empresas por nombre con el campo de búsqueda', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.change(searchInput, { target: { value: 'LABORATORIO' } });

    expect(screen.queryByText('CLINICA SAN MARTIN S.A.')).not.toBeInTheDocument();
    expect(screen.getByText('LABORATORIO MEDICO S.A.')).toBeInTheDocument();
    expect(
      screen.queryByText('HOSPITAL NACIONAL S.A.'),
    ).not.toBeInTheDocument();
  });

  it('debe mostrar mensaje cuando la búsqueda no encuentra resultados', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.change(searchInput, { target: { value: 'NOEXISTE' } });

    expect(
      screen.getByText(
        'No se encontraron empresas que coincidan con la búsqueda.',
      ),
    ).toBeInTheDocument();
  });

  it('debe mostrar mensaje de vacío cuando no hay empresas', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    render(
      <CompanyList
        companies={[]}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    expect(
      screen.getByText('No se encontraron empresas en el archivo.'),
    ).toBeInTheDocument();
  });

  it('debe paginar cuando hay más de 10 empresas — solo muestra 10', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    const companies = makeCompanies(15);
    render(
      <CompanyList
        companies={companies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    // First 10 companies visible
    expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    expect(screen.getByText('EMPRESA J')).toBeInTheDocument();
    // Last 5 not visible
    expect(screen.queryByText('EMPRESA K')).not.toBeInTheDocument();
    expect(screen.queryByText('EMPRESA O')).not.toBeInTheDocument();

    // Pagination controls visible
    expect(screen.getByText('Siguiente')).toBeInTheDocument();
  });

  it('debe navegar a la página siguiente y anterior con paginación', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    const companies = makeCompanies(15);
    render(
      <CompanyList
        companies={companies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    // Click Siguiente
    fireEvent.click(screen.getByText('Siguiente'));

    expect(screen.queryByText('EMPRESA A')).not.toBeInTheDocument();
    expect(screen.getByText('EMPRESA K')).toBeInTheDocument();
    expect(screen.getByText('EMPRESA O')).toBeInTheDocument();

    // Click Anterior
    fireEvent.click(screen.getByText('Anterior'));

    expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    expect(screen.queryByText('EMPRESA K')).not.toBeInTheDocument();
  });

  it('debe reiniciar paginación al cambiar el filtro de búsqueda', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    const companies = makeCompanies(15);
    render(
      <CompanyList
        companies={companies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    // Go to page 2
    fireEvent.click(screen.getByText('Siguiente'));
    expect(screen.getByText('EMPRESA K')).toBeInTheDocument();

    // Type in search — should reset to page 1
    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.change(searchInput, { target: { value: 'EMPRESA A' } });

    // Should show only EMPRESA A (page 1, filtered)
    expect(screen.getByText('EMPRESA A')).toBeInTheDocument();
    expect(screen.queryByText('EMPRESA K')).not.toBeInTheDocument();
  });

  it('debe llamar a onSelectCompany con la empresa correcta al hacer clic', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    fireEvent.click(screen.getByText('LABORATORIO MEDICO S.A.'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(sampleCompanies[1]);
  });

  it('debe llamar a onDownloadAll al hacer clic en Descargar todo', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    fireEvent.click(screen.getByText('Descargar todo'));

    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('debe tener el botón Descargar todo deshabilitado cuando no hay empresas', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();
    render(
      <CompanyList
        companies={[]}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    // The button wraps text in a <span>; get the parent button via closest role
    const button = screen.getByRole('button', { name: /Descargar todo/ });
    expect(button).toBeDisabled();
  });
});

describe('CompanyList - historial de búsqueda', () => {
  beforeEach(() => {
    clearSearchHistory();
  });

  it('no debe mostrar el dropdown de historial si no hay búsquedas previas', () => {
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.focus(searchInput);

    expect(
      screen.queryByRole('listbox', { name: /Búsquedas recientes/ }),
    ).not.toBeInTheDocument();
  });

  it('debe guardar el término en el historial al presionar Enter', () => {
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      /Buscar empresa/,
    ) as HTMLInputElement;

    fireEvent.change(searchInput, { target: { value: 'CLINICA' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual(['CLINICA']);
  });

  it('no debe guardar términos vacíos en el historial', () => {
    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      /Buscar empresa/,
    ) as HTMLInputElement;

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(
      window.localStorage.getItem(HISTORY_STORAGE_KEY),
    ).toBeNull();
  });

  it('debe mostrar el dropdown con el historial al enfocar el input', () => {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(['CLINICA', 'HOSPITAL']),
    );

    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.focus(searchInput);

    const listbox = screen.getByRole('listbox', {
      name: /Búsquedas recientes/,
    });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByText('CLINICA')).toBeInTheDocument();
    expect(screen.getByText('HOSPITAL')).toBeInTheDocument();
  });

  it('debe reusar un término del historial al hacer clic', () => {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(['LABORATORIO']),
    );

    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      /Buscar empresa/,
    ) as HTMLInputElement;
    fireEvent.focus(searchInput);

    const option = screen.getByRole('option', { name: /LABORATORIO/ });
    fireEvent.mouseDown(option);

    expect(searchInput.value).toBe('LABORATORIO');
    expect(
      screen.queryByRole('listbox', { name: /Búsquedas recientes/ }),
    ).not.toBeInTheDocument();
  });

  it('debe eliminar un término del historial con el botón X', () => {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(['CLINICA', 'HOSPITAL']),
    );

    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.focus(searchInput);

    const removeBtn = screen.getByRole('button', {
      name: /Eliminar "CLINICA" del historial/,
    });
    fireEvent.click(removeBtn);

    expect(screen.queryByText('CLINICA')).not.toBeInTheDocument();
    expect(screen.getByText('HOSPITAL')).toBeInTheDocument();

    const stored = JSON.parse(
      window.localStorage.getItem(HISTORY_STORAGE_KEY) as string,
    );
    expect(stored).toEqual(['HOSPITAL']);
  });

  it('debe limpiar todo el historial con el botón Limpiar', () => {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(['CLINICA', 'HOSPITAL']),
    );

    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.focus(searchInput);

    const clearBtn = screen.getByRole('button', { name: /Limpiar/ });
    fireEvent.click(clearBtn);

    expect(
      screen.queryByRole('listbox', { name: /Búsquedas recientes/ }),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem(HISTORY_STORAGE_KEY),
    ).toEqual(JSON.stringify([]));
  });

  it('debe cerrar el dropdown al presionar Escape', () => {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(['CLINICA']),
    );

    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.focus(searchInput);
    expect(
      screen.getByRole('listbox', { name: /Búsquedas recientes/ }),
    ).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(
      screen.queryByRole('listbox', { name: /Búsquedas recientes/ }),
    ).not.toBeInTheDocument();
  });

  it('debe persistir el historial entre montajes del componente', () => {
    const onSelect = vi.fn();
    const onDownload = vi.fn();

    const { unmount } = render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    const firstInput = screen.getByPlaceholderText(
      /Buscar empresa/,
    ) as HTMLInputElement;
    fireEvent.change(firstInput, { target: { value: 'PERSISTIDA' } });
    fireEvent.keyDown(firstInput, { key: 'Enter' });
    unmount();

    render(
      <CompanyList
        companies={sampleCompanies}
        onSelectCompany={onSelect}
        onDownloadAll={onDownload}
      />,
    );

    const secondInput = screen.getByPlaceholderText(/Buscar empresa/);
    fireEvent.focus(secondInput);

    expect(screen.getByText('PERSISTIDA')).toBeInTheDocument();
  });
});
