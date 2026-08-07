import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PatientSummaryFields } from '../PatientSummaryFields';
import type { AtencionDetalle } from '@/types/jjc';

const MOCK_ATENCION: AtencionDetalle = {
  idAtencion: '0112345',
  dni: '12345678',
  paciente: 'Juan Pérez García',
  sexo: 'M',
  fechaNac: '15/05/1985',
  edad: 41,
  fechaAtencion: '20/07/2026',
  empresa: 'JJC CONTRATISTAS GENERALES S.A.',
  tipoExamen: 'PRE-OCUPACIONAL',
  puesto: 'OPERARIO',
  area: 'MEDICINA GENERAL',
  rutaFirma: null,
  rutaHuella: null,
};

describe('PatientSummaryFields', () => {
  it('renders all patient fields as read-only inputs', () => {
    render(<PatientSummaryFields atencion={MOCK_ATENCION} />);

    const nombreInput = screen.getByDisplayValue('Juan Pérez García');
    expect(nombreInput).toHaveAttribute('readOnly');

    const dniInput = screen.getByDisplayValue('12345678');
    expect(dniInput).toHaveAttribute('readOnly');

    const empresaInput = screen.getByDisplayValue('JJC CONTRATISTAS GENERALES S.A.');
    expect(empresaInput).toHaveAttribute('readOnly');

    const areaInput = screen.getByDisplayValue('MEDICINA GENERAL');
    expect(areaInput).toHaveAttribute('readOnly');
  });

  it('renders the ocupación (puesto) field', () => {
    render(<PatientSummaryFields atencion={MOCK_ATENCION} />);
    expect(screen.getByDisplayValue('OPERARIO')).toBeInTheDocument();
  });
});
