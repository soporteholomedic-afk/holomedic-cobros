'use client';

import { useReducer, useCallback } from 'react';
import type { AtencionDetalle } from '@/types/jjc';
import type {
  EvaluacionOsteomuscular,
  EscapuloHumeral,
  Codo,
  PalpacionHombro,
  MovilidadPresenciaDolor,
  ArcoDoloroso,
  TestTendinitisBiceps,
  ExamenInstrumental,
  ObservacionInspeccionCodo,
  PalpacionCodo,
  PalpacionEpicondileoEpitroclear,
  TestEpicondilitis,
  TestAtrapamientoNervioUlnar,
  ExamenInstrumentalCodo,
  MunecaMano,
  ObservacionManoMuneca,
  PalpacionMunecaMano,
  ClicExtensionDedos,
  DedosCheck,
  ManiobraClicDedosGatillo,
  FinkelsteinMuneca,
  FlexoExtensionMuneca,
  RegionProximalParestesica,
  RegionDistalParestesica,
  ParestesiaNerviosa,
  ExamenInstrumentalMuneca,
  SintomatologiaParestesica,
} from '@/types/evaluacion-osteomuscular';

function initialDxIxBool() {
  return { dx: false, ix: false };
}

function initialPalpacionHombro(): PalpacionHombro {
  return {
    dolorAnterior: initialDxIxBool(),
    dolorLateral: initialDxIxBool(),
    dolorPosterior: initialDxIxBool(),
  };
}

function initialMovilidadPresenciaDolor(): MovilidadPresenciaDolor {
  return {
    flexionElevacionAnterior: initialDxIxBool(),
    abduccionElevacionLateral: initialDxIxBool(),
    rotacionInterna: initialDxIxBool(),
    rotacionExterna: initialDxIxBool(),
  };
}

function initialArcoDoloroso(): ArcoDoloroso {
  return { presenteDx: false, presenteIx: false, ausente: false };
}

function initialTestTendinitisBiceps(): TestTendinitisBiceps {
  return {
    dolorAusente: false,
    presenciaDolorAnteriorHombroDx: false,
    presenciaDolorAnteriorHombroIx: false,
  };
}

function initialExamenInstrumental(): ExamenInstrumental {
  return {
    noRealizo: false,
    ecografia: { realiza: false, ano: '' },
    rx: { realiza: false, ano: '' },
    rmn: { realiza: false, ano: '' },
  };
}

function initialEscapuloHumeral(): EscapuloHumeral {
  return {
    realizaManiobras: false,
    molestiaHombroDxDesdeMeses: null,
    molestiaHombroIxDesdeMeses: null,
    palpacionHombro: initialPalpacionHombro(),
    movilidadPresenciaDolor: initialMovilidadPresenciaDolor(),
    arcoDoloroso: initialArcoDoloroso(),
    testTendinitisTendonLargoBiceps: initialTestTendinitisBiceps(),
    examenInstrumental: initialExamenInstrumental(),
    gravedadPatologiaHombro: null,
  };
}

function initialObservacionInspeccionCodo(): ObservacionInspeccionCodo {
  return {
    edemaLocalizado: initialDxIxBool(),
    sitio: '',
    edemaNoLocalizado: initialDxIxBool(),
  };
}

function initialPalpacionCodo(): PalpacionCodo {
  return {
    dolorEpicondilo: initialDxIxBool(),
    dolorEpitroclea: initialDxIxBool(),
    dolorOlecranon: initialDxIxBool(),
  };
}

function initialPalpacionEpicondileoEpitroclear(): PalpacionEpicondileoEpitroclear {
  return {
    dolorMusculoEpicondileo: initialDxIxBool(),
    dolorMusculoEpitroclear: initialDxIxBool(),
  };
}

function initialTestEpicondilitis(): TestEpicondilitis {
  return { presenciaDolorLateralCodo: initialDxIxBool() };
}

function initialTestAtrapamientoNervioUlnar(): TestAtrapamientoNervioUlnar {
  return { parestesiasIrradianAntebrazoODedos: initialDxIxBool() };
}

function initialExamenInstrumentalCodo(): ExamenInstrumentalCodo {
  return {
    noRealizado: false,
    ecografia: false,
    ecografiaAno: null,
    rx: false,
    rxAno: null,
    emg: false,
    emgAno: null,
  };
}

function initialObservacionManoMuneca(): ObservacionManoMuneca {
  return {
    quisteDorsal: initialDxIxBool(),
    quisteVentral: initialDxIxBool(),
    edemaVentralEstiloideRadial: initialDxIxBool(),
    edemaDorsalEstiloideUlnar: initialDxIxBool(),
    hipotrofiaPosterior: initialDxIxBool(),
    deformidadArticularTrapecioMetacarpal: initialDxIxBool(),
    retaccionesPalmares: initialDxIxBool(),
  };
}

function initialPalpacionMunecaMano(): PalpacionMunecaMano {
  return {
    dolorArticulacionTrapecioMetacarpal: initialDxIxBool(),
    dolorEstiloideRadial: initialDxIxBool(),
  };
}

function initialDedosCheck(): DedosCheck {
  return { dedo1: false, dedo2: false, dedo3: false, dedo4: false, dedo5: false };
}

function initialClicExtensionDedos(): ClicExtensionDedos {
  return {
    dx: initialDedosCheck(),
    ix: initialDedosCheck(),
  };
}

function initialManiobraClicDedosGatillo(): ManiobraClicDedosGatillo {
  return { clicExtensionDedos: initialClicExtensionDedos() };
}

function initialFinkelsteinMuneca(): FinkelsteinMuneca {
  return { dolorTabaqueraAnatomica: initialDxIxBool() };
}

function initialFlexoExtensionMuneca(): FlexoExtensionMuneca {
  return {
    dolorFlexionContraResistencia: initialDxIxBool(),
    dolorFlexionPasiva: initialDxIxBool(),
    dolorExtensionContraResistencia: initialDxIxBool(),
    dolorExtensionPasiva: initialDxIxBool(),
  };
}

function initialParestesiaNerviosa(): ParestesiaNerviosa {
  return {
    nervioMediano: initialDxIxBool(),
    nervioUlnar: initialDxIxBool(),
    noTerritorializada: initialDxIxBool(),
  };
}

function initialRegionProximalParestesica(): RegionProximalParestesica {
  return {
    dolorPresionPalpacion: {
      apofisisEspinosa: false,
      mTrapecioSuperior: false,
      mParavertebral: false,
    },
    dolorMovimiento: {
      flexion: false,
      extension: false,
      inclinacionDerecha: false,
      inclinacionIzquierda: false,
      rotacionDerecha: false,
      rotacionIzquierda: false,
    },
    testFatiga: { parestesia: initialDxIxBool() },
    testCandelero: { parestesia: initialDxIxBool() },
  };
}

function initialRegionDistalParestesica(): RegionDistalParestesica {
  return {
    testPhalen: { parestesia: initialParestesiaNerviosa() },
    testPresion: { parestesia: initialParestesiaNerviosa() },
  };
}

function initialExamenInstrumentalMuneca(): ExamenInstrumentalMuneca {
  return {
    noRealizado: false,
    ecografia: false,
    ecografiaAno: null,
    rx: false,
    rxAno: null,
    rmn: false,
    rmnAno: null,
    emg: false,
    emgAno: null,
  };
}

function initialSintomatologiaParestesica(): SintomatologiaParestesica {
  return {
    regionProximal: initialRegionProximalParestesica(),
    regionDistal: initialRegionDistalParestesica(),
    examenInstrumental: initialExamenInstrumentalMuneca(),
    gravedadPatologiaManoMuneca: null,
    aproximacionDiagnosticaEvaluacion: '',
  };
}

function initialMunecaMano(): MunecaMano {
  return {
    realizaManiobras: false,
    molestiaMunecaDxDesdeMeses: null,
    molestiaMunecaIxDesdeMeses: null,
    observacionManoMuneca: initialObservacionManoMuneca(),
    palpacion: initialPalpacionMunecaMano(),
    maniobraClicDedosGatillo: initialManiobraClicDedosGatillo(),
    finkelstein: initialFinkelsteinMuneca(),
    flexoExtensionMuneca: initialFlexoExtensionMuneca(),
    sintomatologiaParestesica: initialSintomatologiaParestesica(),
  };
}

function initialCodo(): Codo {
  return {
    realizaManiobras: false,
    molestiaCodoDxDesdeMeses: null,
    molestiaCodoIxDesdeMeses: null,
    observacionInspeccion: initialObservacionInspeccionCodo(),
    palpacion: initialPalpacionCodo(),
    palpacionEpicondileoEpitroclear: initialPalpacionEpicondileoEpitroclear(),
    testEpicondilitis: initialTestEpicondilitis(),
    testAtrapamientoNervioUlnar: initialTestAtrapamientoNervioUlnar(),
    examenInstrumental: initialExamenInstrumentalCodo(),
    gravedadPatologiaCodo: null,
  };
}

export function initialEvaluacionState(atencion: AtencionDetalle | null): EvaluacionOsteomuscular {
  return {
    idAtencion: atencion?.idAtencion ?? '',
    evaluacionClinicaOsteomuscular: {
      miembrosSuperiores: {
        escapuloHumeral: initialEscapuloHumeral(),
        codo: initialCodo(),
        munecaMano: initialMunecaMano(),
      },
    },
  };
}

function setDeep<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const [first, ...rest] = keys;

  if (rest.length === 0) {
    return { ...obj, [first]: value };
  }

  const current = obj[first] as Record<string, unknown>;
  return {
    ...obj,
    [first]: setDeep(current, rest.join('.'), value),
  };
}

export type EvaluacionAction =
  | { type: 'SET_FIELD'; path: string; value: unknown }
  | { type: 'RESET'; atencion: AtencionDetalle | null };

export function evaluacionReducer(
  state: EvaluacionOsteomuscular,
  action: EvaluacionAction,
): EvaluacionOsteomuscular {
  switch (action.type) {
    case 'SET_FIELD':
      return setDeep(state as unknown as Record<string, unknown>, action.path, action.value) as unknown as EvaluacionOsteomuscular;
    case 'RESET':
      return initialEvaluacionState(action.atencion);
    default:
      return state;
  }
}

export interface UseEvaluacionOsteomuscularResult {
  state: EvaluacionOsteomuscular;
  setField: (path: string, value: unknown) => void;
  reset: (atencion: AtencionDetalle | null) => void;
  setDxIx: (basePath: string, lado: 'dx' | 'ix', value: boolean) => void;
}

export function useEvaluacionOsteomuscular(
  atencion: AtencionDetalle | null,
): UseEvaluacionOsteomuscularResult {
  const [state, dispatch] = useReducer(
    evaluacionReducer,
    atencion,
    initialEvaluacionState,
  );

  const setField = useCallback(
    (path: string, value: unknown) => dispatch({ type: 'SET_FIELD', path, value }),
    [],
  );

  const reset = useCallback(
    (a: AtencionDetalle | null) => dispatch({ type: 'RESET', atencion: a }),
    [],
  );

  const setDxIx = useCallback(
    (basePath: string, lado: 'dx' | 'ix', value: boolean) => {
      dispatch({ type: 'SET_FIELD', path: `${basePath}.${lado}`, value });
    },
    [],
  );

  return { state, setField, reset, setDxIx };
}
