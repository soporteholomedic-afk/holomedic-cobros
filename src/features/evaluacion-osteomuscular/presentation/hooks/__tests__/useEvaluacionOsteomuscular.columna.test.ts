import { describe, it, expect } from 'vitest';
import { initialEvaluacionState, evaluacionReducer } from '../useEvaluacionOsteomuscular';

const COLUMNA = 'evaluacionColumna';
const OBS = `${COLUMNA}.observacion`;
const PALP = `${COLUMNA}.maniobraPresoPalpacion`;

describe('initialEvaluacionColumna — page 4 state foundation', () => {
  function columna(state = initialEvaluacionState(null)) {
    return state.evaluacionColumna;
  }

  it('defaults observacion groups to false', () => {
    const c = columna();
    expect(c.observacion.cifosisDorsal).toEqual({ normal: false, hipercifosis: false, aplanamientoCifosisDorsal: false });
    expect(c.observacion.lordosisLumbar).toEqual({ normal: false, hipercifosis: false, aplanamientoLordosisLumbar: false });
    expect(c.observacion.presenciaEscoliosis).toEqual({ ausente: false, dorsalDx: false, dorsalIx: false, lumbarDx: false, lumbarIx: false });
    expect(c.observacion.ritmoLumboPelvico).toEqual({ normal: false, lordosisLumbarInmodificada: false, dolorLumbar: false });
    expect(c.observacion.dorsoCurvoEstructuradoCifoEscoliosis).toEqual({ normal: false, presenciaDorsoCurvoEstructurado: false, dolorDorsal: false });
  });

  it('defaults cervical palpation with nested detalle objects', () => {
    const c = columna();
    expect(c.maniobraPresoPalpacion.cervical.dolorAusente).toBe(false);
    expect(c.maniobraPresoPalpacion.cervical.dolorPresente.aplica).toBe(false);
    expect(c.maniobraPresoPalpacion.cervical.dolorPresente.apofisisEspacioIntervertebral).toEqual({
      aplica: false,
      numeroApofisisEspacio: '',
    });
    expect(c.maniobraPresoPalpacion.cervical.dolorPresente.segmentoMuscular).toEqual({
      aplica: false,
      detalle: '',
    });
  });

  it('defaults dorsal palpation with simple booleans', () => {
    const c = columna();
    expect(c.maniobraPresoPalpacion.dorsal.dolorAusente).toBe(false);
    expect(c.maniobraPresoPalpacion.dorsal.dolorPresente).toEqual({
      aplica: false,
      apofisisEspacioIntervertebral: false,
      segmentoMuscular: false,
    });
  });

  it('defaults lumbar palpation with simple booleans', () => {
    const c = columna();
    expect(c.maniobraPresoPalpacion.lumbar.dolorAusente).toBe(false);
    expect(c.maniobraPresoPalpacion.lumbar.dolorPresente).toEqual({
      aplica: false,
      apofisisEspacioIntervertebral: false,
      segmentoMuscular: false,
    });
  });

  it('toggles individual observacion checkbox via reducer', () => {
    const base = initialEvaluacionState(null);
    const path = `${OBS}.cifosisDorsal.normal`;
    const next = evaluacionReducer(base, { type: 'SET_FIELD', path, value: true });
    expect(columna(next).observacion.cifosisDorsal.normal).toBe(true);
  });

  it('toggles cervical aplica checkbox via reducer', () => {
    const base = initialEvaluacionState(null);
    const path = `${PALP}.cervical.dolorPresente.aplica`;
    const next = evaluacionReducer(base, { type: 'SET_FIELD', path, value: true });
    expect(columna(next).maniobraPresoPalpacion.cervical.dolorPresente.aplica).toBe(true);
  });

  it('sets cervical text field via reducer', () => {
    const base = initialEvaluacionState(null);
    const path = `${PALP}.cervical.dolorPresente.segmentoMuscular.detalle`;
    const next = evaluacionReducer(base, { type: 'SET_FIELD', path, value: 'Trapecio' });
    expect(columna(next).maniobraPresoPalpacion.cervical.dolorPresente.segmentoMuscular.detalle).toBe('Trapecio');
  });

  it('preserves miembrosSuperiores after columna mutation', () => {
    const base = initialEvaluacionState(null);
    const next = evaluacionReducer(base, { type: 'SET_FIELD', path: `${OBS}.cifosisDorsal.hipercifosis`, value: true });
    expect(next.evaluacionClinicaOsteomuscular.miembrosSuperiores.escapuloHumeral.realizaManiobras).toBe(false);
    expect(next.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.realizaManiobras).toBe(false);
    expect(next.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano.realizaManiobras).toBe(false);
  });
});
