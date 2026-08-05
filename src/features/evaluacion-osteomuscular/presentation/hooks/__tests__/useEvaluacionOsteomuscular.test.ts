import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AtencionDetalle } from '@/types/jjc';
import { useEvaluacionOsteomuscular } from '../useEvaluacionOsteomuscular';

const ATENCION: AtencionDetalle = {
  idAtencion: 'AT-1001',
  dni: '11223344',
  paciente: 'Paciente Prueba',
  sexo: 'M',
  fechaNac: '01/01/1990',
  edad: 36,
  fechaAtencion: '01/08/2026',
  empresa: 'Empresa X',
  tipoExamen: 'PERIODICO',
  puesto: 'Operario',
  area: 'Producción',
  rutaFirma: null,
  rutaHuella: null,
};

describe('useEvaluacionOsteomuscular', () => {
  it('tracks changes and marks the current state as saved', () => {
    const { result } = renderHook(() => useEvaluacionOsteomuscular(ATENCION));

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setField('aproximacionDiagnosticaEvaluacion', 'Sin hallazgos');
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.markSaved();
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('marks the reset state as clean', () => {
    const { result } = renderHook(() => useEvaluacionOsteomuscular(ATENCION));

    act(() => {
      result.current.setField('aproximacionDiagnosticaEvaluacion', 'Sin hallazgos');
      result.current.reset(ATENCION);
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.state.aproximacionDiagnosticaEvaluacion).toBe('');
  });
});
