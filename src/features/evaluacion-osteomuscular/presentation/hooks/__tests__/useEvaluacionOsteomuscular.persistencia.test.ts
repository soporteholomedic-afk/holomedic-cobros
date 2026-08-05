import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AtencionDetalle } from '@/types/jjc';
import {
  initialEvaluacionState,
  mergeEvaluacion,
  useEvaluacionOsteomuscular,
} from '../useEvaluacionOsteomuscular';

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

describe('mergeEvaluacion', () => {
  it('mezcla el payload guardado sobre el estado inicial y conserva los defaults', () => {
    const base = initialEvaluacionState(ATENCION);
    const merged = mergeEvaluacion(base, {
      idAtencion: 'AT-1001',
      evaluacionClinicaOsteomuscular: {
        miembrosSuperiores: {
          escapuloHumeral: {
            gravedadPatologiaHombro: 'GRAVE',
            examenInstrumental: { otros: 'TAC 2023' },
          },
        },
      },
    });

    expect(merged.idAtencion).toBe('AT-1001');
    expect(
      merged.evaluacionClinicaOsteomuscular.miembrosSuperiores.escapuloHumeral.gravedadPatologiaHombro,
    ).toBe('GRAVE');
    expect(
      merged.evaluacionClinicaOsteomuscular.miembrosSuperiores.escapuloHumeral.examenInstrumental.otros,
    ).toBe('TAC 2023');
    // Los campos que faltaban en el payload conservan su default
    expect(
      merged.evaluacionClinicaOsteomuscular.miembrosSuperiores.escapuloHumeral.realizaManiobras,
    ).toBe(false);
    expect(
      merged.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano.observacionManoMuneca.quisteOtros,
    ).toBe('');
    expect(merged.evaluacionMotilidad.observacion).toBe('');
  });

  it('ignora payloads no-objeto', () => {
    const base = initialEvaluacionState(ATENCION);
    expect(mergeEvaluacion(base, null)).toBe(base);
    expect(mergeEvaluacion(base, 'texto')).toBe(base);
  });
});

describe('useEvaluacionOsteomuscular.hydrate', () => {
  it('hidrata el estado con el payload guardado y lo marca como limpio', () => {
    const { result } = renderHook(() => useEvaluacionOsteomuscular(ATENCION));

    act(() => {
      result.current.hydrate({
        idAtencion: 'AT-1001',
        evaluacionClinicaOsteomuscular: {
          miembrosSuperiores: {
            codo: { gravedadPatologiaCodo: 'MEDIA' },
          },
        },
        aproximacionDiagnosticaEvaluacion: 'Lumbalgia mecánica',
      });
    });

    expect(
      result.current.state.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.gravedadPatologiaCodo,
    ).toBe('MEDIA');
    expect(result.current.state.aproximacionDiagnosticaEvaluacion).toBe('Lumbalgia mecánica');
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setField(
        'evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.gravedadPatologiaCodo',
        'GRAVE',
      );
    });
    expect(result.current.isDirty).toBe(true);
  });
});
