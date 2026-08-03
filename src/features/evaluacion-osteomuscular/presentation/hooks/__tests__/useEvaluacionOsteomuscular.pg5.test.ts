import { describe, it, expect } from 'vitest';
import { initialEvaluacionState, evaluacionReducer } from '../useEvaluacionOsteomuscular';

const MOT = 'evaluacionMotilidad';
const LASE = 'maniobraLasegueRetraccionIsquioCrural';
const WASS = 'maniobraWassermanRetraccionIleopsoas';

const MOVIMIENTO_FALSE = {
  flexion: false,
  extension: false,
  inclinacionDx: false,
  inclinacionIx: false,
  rotacionDx: false,
  rotacionIx: false,
};

describe('initialEvaluacionMotilidad y maniobras — page 5 state foundation', () => {
  it('defaults both motilidad columns to false on all six movements', () => {
    const s = initialEvaluacionState(null);
    expect(s.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento).toEqual(MOVIMIENTO_FALSE);
    expect(s.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento).toEqual(MOVIMIENTO_FALSE);
  });

  it('defaults Lasègue, Wasserman and diagnostic text', () => {
    const s = initialEvaluacionState(null);
    expect(s.maniobraLasegueRetraccionIsquioCrural).toEqual({
      lasegueSlr: { normal: false, dx: false, ix: false, observacion: '' },
      presenciaRetraccionIsquioCrural: false,
    });
    expect(s.maniobraWassermanRetraccionIleopsoas).toEqual({
      wassermanLasegueInvertido: { dx: false, ix: false, observacion: '' },
      presenciaRetraccionIleopsoas: false,
    });
    expect(s.aproximacionDiagnosticaEvaluacion).toBe('');
  });

  it('toggles a motilidad checkbox via reducer', () => {
    const base = initialEvaluacionState(null);
    const next = evaluacionReducer(base, {
      type: 'SET_FIELD',
      path: `${MOT}.columnaCervical.presenciaDolorMovimiento.rotacionIx`,
      value: true,
    });
    expect(next.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento.rotacionIx).toBe(true);
    expect(next.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento.rotacionIx).toBe(false);
  });

  it('sets observacion strings and retraccion toggles via reducer', () => {
    const base = initialEvaluacionState(null);
    const next = evaluacionReducer(base, {
      type: 'SET_FIELD',
      path: `${LASE}.lasegueSlr.observacion`,
      value: 'Dolor irradiado a cara posterior de muslo',
    });
    expect(next.maniobraLasegueRetraccionIsquioCrural.lasegueSlr.observacion).toBe(
      'Dolor irradiado a cara posterior de muslo',
    );
    const withRetraccion = evaluacionReducer(base, {
      type: 'SET_FIELD',
      path: `${WASS}.presenciaRetraccionIleopsoas`,
      value: true,
    });
    expect(withRetraccion.maniobraWassermanRetraccionIleopsoas.presenciaRetraccionIleopsoas).toBe(true);
  });

  it('sets diagnostic text via reducer', () => {
    const base = initialEvaluacionState(null);
    const next = evaluacionReducer(base, {
      type: 'SET_FIELD',
      path: 'aproximacionDiagnosticaEvaluacion',
      value: 'Lumbalgia mecánica',
    });
    expect(next.aproximacionDiagnosticaEvaluacion).toBe('Lumbalgia mecánica');
  });

  it('preserves columna and miembrosSuperiores after page 5 mutation', () => {
    const base = initialEvaluacionState(null);
    const next = evaluacionReducer(base, {
      type: 'SET_FIELD',
      path: `${LASE}.lasegueSlr.dx`,
      value: true,
    });
    expect(next.evaluacionColumna.observacion.cifosisDorsal.normal).toBe(false);
    expect(next.evaluacionClinicaOsteomuscular.miembrosSuperiores.escapuloHumeral.realizaManiobras).toBe(false);
    expect(next.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.realizaManiobras).toBe(false);
  });
});
