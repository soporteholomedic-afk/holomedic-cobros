import { describe, it, expect } from 'vitest';
import { initialEvaluacionState, evaluacionReducer } from '../useEvaluacionOsteomuscular';

const MUNECA = 'evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano';
const EXAM = `${MUNECA}.sintomatologiaParestesica.examenInstrumental`;

describe('initialMunecaMano — page-3 state foundation', () => {
  function muneca(state = initialEvaluacionState(null)) {
    return state.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano;
  }

  it('defaults every new page-3 group to false, null, or empty string', () => {
    const m = muneca();
    const parestesia = m.sintomatologiaParestesica;

    expect(m.finkelstein.dolorTabaqueraAnatomica).toEqual({ dx: false, ix: false });
    expect(m.flexoExtensionMuneca).toEqual({
      dolorFlexionContraResistencia: { dx: false, ix: false },
      dolorFlexionPasiva: { dx: false, ix: false },
      dolorExtensionContraResistencia: { dx: false, ix: false },
      dolorExtensionPasiva: { dx: false, ix: false },
    });
    expect(parestesia.regionProximal.dolorPresionPalpacion).toEqual({
      apofisisEspinosa: false,
      mTrapecioSuperior: false,
      mParavertebral: false,
    });
    expect(parestesia.regionProximal.dolorMovimiento).toEqual({
      flexion: false,
      extension: false,
      inclinacionDerecha: false,
      inclinacionIzquierda: false,
      rotacionDerecha: false,
      rotacionIzquierda: false,
    });
    expect(parestesia.regionProximal.testFatiga).toEqual({ parestesia: { dx: false, ix: false } });
    expect(parestesia.regionProximal.testCandelero).toEqual({ parestesia: { dx: false, ix: false } });
    expect(parestesia.regionDistal.testPhalen.parestesia).toEqual({
      nervioMediano: { dx: false, ix: false },
      nervioUlnar: { dx: false, ix: false },
      noTerritorializada: { dx: false, ix: false },
    });
    expect(parestesia.regionDistal.testPresion.parestesia).toEqual({
      nervioMediano: { dx: false, ix: false },
      nervioUlnar: { dx: false, ix: false },
      noTerritorializada: { dx: false, ix: false },
    });
    expect(parestesia.examenInstrumental).toEqual({
      noRealizado: false,
      ecografia: false,
      ecografiaAno: null,
      rx: false,
      rxAno: null,
      rmn: false,
      rmnAno: null,
      emg: false,
      emgAno: null,
    });
    expect(parestesia.gravedadPatologiaManoMuneca).toBeNull();
    expect(parestesia.aproximacionDiagnosticaEvaluacion).toBe('');
  });

  it('keeps page-2 fields available with their existing defaults', () => {
    const m = muneca();
    expect(m.realizaManiobras).toBe(false);
    expect(m.molestiaMunecaDxDesdeMeses).toBeNull();
    expect(m.molestiaMunecaIxDesdeMeses).toBeNull();
    expect(m.observacionManoMuneca.quisteDorsal).toEqual({ dx: false, ix: false });
    expect(m.palpacion.dolorEstiloideRadial).toEqual({ dx: false, ix: false });
    expect(m.maniobraClicDedosGatillo.clicExtensionDedos.dx.dedo1).toBe(false);
  });

  it('changes only the touched exam boolean/year pair, preserving the other pairs and noRealizado', () => {
    const base = initialEvaluacionState(null);
    const withEco = evaluacionReducer(base, { type: 'SET_FIELD', path: `${EXAM}.ecografia`, value: true });
    expect(muneca(withEco).sintomatologiaParestesica.examenInstrumental).toEqual({
      ...muneca(base).sintomatologiaParestesica.examenInstrumental,
      ecografia: true,
    });

    const withEmgAno = evaluacionReducer(withEco, { type: 'SET_FIELD', path: `${EXAM}.emgAno`, value: 2022 });
    expect(muneca(withEmgAno).sintomatologiaParestesica.examenInstrumental).toEqual({
      ...muneca(withEco).sintomatologiaParestesica.examenInstrumental,
      emgAno: 2022,
    });
  });
});
