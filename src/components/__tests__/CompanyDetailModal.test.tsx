import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CompanyDetailModal from '../CompanyDetailModal';
import { CompanyGroup } from '@/utils/valoracionesCore';

const sampleCompany: CompanyGroup = {
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
    {
      facturar_a: 'CLINICA SAN MARTIN S.A.',
      contratades: '',
      proyectodes: '',
      cr_proy: '',
      dociden: 'DNI 87654321',
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
  subtotal: 341,
  igv: 61.38,
  total: 402.38,
};

describe('CompanyDetailModal Component', () => {
  it('debe mostrar el nombre de la empresa en el encabezado', () => {
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={vi.fn()}
        onDownloadCompany={vi.fn()}
      />,
    );

    expect(screen.getByText('CLINICA SAN MARTIN S.A.')).toBeInTheDocument();
    expect(screen.getByText('Detalle de Valoraciones')).toBeInTheDocument();
  });

  it('debe mostrar las tarjetas de resumen con Subtotal, IGV y Total', () => {
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={vi.fn()}
        onDownloadCompany={vi.fn()}
      />,
    );

    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('IGV 18%')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();

    // Values rendered (using formatNumber = Peruvian locale with commas)
    expect(screen.getByText('S/ 341.00')).toBeInTheDocument();
    expect(screen.getByText('S/ 61.38')).toBeInTheDocument();
    expect(screen.getByText('S/ 402.38')).toBeInTheDocument();
  });

  it('debe mostrar todas las columnas en la tabla de valoraciones', () => {
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={vi.fn()}
        onDownloadCompany={vi.fn()}
      />,
    );

    // Column headers
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Documento')).toBeInTheDocument();
    expect(screen.getByText('Examen')).toBeInTheDocument();
    expect(screen.getByText('Perfil')).toBeInTheDocument();
    expect(screen.getByText('Costo (S/.)')).toBeInTheDocument();
  });

  it('debe mostrar los datos de cada fila en la tabla', () => {
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={vi.fn()}
        onDownloadCompany={vi.fn()}
      />,
    );

    // Item numbers
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Names
    expect(screen.getByText('JUAN PEREZ')).toBeInTheDocument();
    expect(screen.getByText('MARIA GONZALES')).toBeInTheDocument();

    // Documents
    expect(screen.getByText('DNI 12345678')).toBeInTheDocument();
    expect(screen.getByText('DNI 87654321')).toBeInTheDocument();

    // Exam types
    expect(screen.getByText('PREOCUPACIONAL')).toBeInTheDocument();
    expect(screen.getByText('OCUPACIONAL')).toBeInTheDocument();

    // Costs formatted
    expect(screen.getByText('S/ 141.00')).toBeInTheDocument();
    expect(screen.getByText('S/ 200.00')).toBeInTheDocument();
  });

  it('debe mostrar el conteo de registros', () => {
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={vi.fn()}
        onDownloadCompany={vi.fn()}
      />,
    );

    // Text "2 registros" is split across nested elements ( (2) + ( registro) + (s) + ()) )
    expect(screen.getByText((content) => content.includes('2') && content.includes('registro'))).toBeInTheDocument();
  });

  it('debe llamar a onDownloadCompany con el nombre de la empresa al hacer clic en Descargar Excel', () => {
    const onDownload = vi.fn();
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={vi.fn()}
        onDownloadCompany={onDownload}
      />,
    );

    fireEvent.click(screen.getByText('Descargar Excel'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith('CLINICA SAN MARTIN S.A.');
  });

  it('debe llamar a onClose al hacer clic en el botón Cerrar', () => {
    const onClose = vi.fn();
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={onClose}
        onDownloadCompany={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Cerrar'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('debe llamar a onClose al hacer clic en el botón X', () => {
    const onClose = vi.fn();
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={onClose}
        onDownloadCompany={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Cerrar'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('debe cerrar al hacer clic en el fondo (backdrop)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={onClose}
        onDownloadCompany={vi.fn()}
      />,
    );

    // Click the backdrop (the outermost fixed div)
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('NO debe cerrar al hacer clic dentro del modal', () => {
    const onClose = vi.fn();
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={onClose}
        onDownloadCompany={vi.fn()}
      />,
    );

    // Click inside the modal container (the white card)
    fireEvent.click(screen.getByText('Detalle de Valoraciones'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('debe mostrar mensaje de error cuando downloadError está presente', () => {
    render(
      <CompanyDetailModal
        company={sampleCompany}
        onClose={vi.fn()}
        onDownloadCompany={vi.fn()}
        downloadError="Error al generar el Excel"
      />,
    );

    expect(
      screen.getByText('Error al generar el Excel'),
    ).toBeInTheDocument();
  });
});
