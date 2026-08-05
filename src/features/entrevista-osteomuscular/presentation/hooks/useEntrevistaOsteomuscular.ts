'use client';

import { useReducer, useCallback, useState } from 'react';
import type {
  EntrevistaOsteomuscular,
  InfoReportadaBase,
  InfoReportadaCodo,
  InfoReportadaManoMuneca,
  InfoReportadaParestesia,
  SintomasHombro,
  SintomasCodo,
  SintomasManoMuneca,
  SintomasParestesiaNocturna,
  SintomasParestesiaDiurna,
  UmbralPositivoParestesiaNocturna,
  UmbralPositivoParestesiaDiurna,
  DatosGenerales,
  FrecuenciaMolestiaDolor,
  LumbalgiaAguda,
  DiagnosticoPatologiaColumna,
  UmbralPositivo,
} from '@/types/entrevista-osteomuscular';
import type { AtencionDetalle } from '@/types/jjc';

// ---- Constants ----

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function serializeState(state: EntrevistaOsteomuscular): string {
  return JSON.stringify(state) ?? '';
}

// ---- Initial state factories ----

function initialInfoReportadaBase(): InfoReportadaBase {
  return {
    haTomadoMedicamentos: false,
    fisioterapia: false,
    visitaTraumatologiaMedicinaGeneral: false,
    rx: false,
    ecografiaResonancia: false,
  };
}

function initialInfoReportadaCodo(): InfoReportadaCodo {
  return { ...initialInfoReportadaBase(), emg: false };
}

function initialInfoReportadaManoMuneca(): InfoReportadaManoMuneca {
  return { ...initialInfoReportadaBase(), emg: false };
}

function initialFrecuencia(): FrecuenciaMolestiaDolor {
  return {
    raramente: false,
    episodios2a3Dias: false,
    episodiosConMedicamentos: false,
    presenteTodoElDia: false,
  };
}

function initialLumbalgiaAguda(): LumbalgiaAguda {
  return {
    tieneLumbalgiaAguda: false,
    totalEpisodiosAgudos: null,
    episodiosUltimoAno: {
      lumbalgia: { aplica: false, cantidad: null },
      lumbociatalgia: { aplica: false, cantidad: null },
    },
    anoPrimerEpisodio: '',
    diasAusenciaTrabajo: null,
  };
}

function initialDiagnosticoPatologiaColumna(): DiagnosticoPatologiaColumna {
  return {
    tieneDiagnosticoConocido: false,
    herniaDiscoLumboSacra: {
      diagnosticada: false,
      tratadaQuirurgicamente: false,
      cuando: '',
      fechaIntervencion: '',
    },
    patologiaTraumaCervical: '',
    patologiaTraumaDorsal: '',
    patologiaTraumaLumbosacra: '',
  };
}

function initialUmbralPositivo(): UmbralPositivo {
  return {
    dolorContinuo: { dx: false, ix: false },
    unaSemanaDolor3Meses: { dx: false, ix: false },
    unaVezMes12Meses: { dx: false, ix: false },
    otrasVeces: '',
  };
}

function initialSintomasHombro(): SintomasHombro {
  return {
    dolorMovimiento: { dx: false, ix: false },
    dolorReposo: { dx: false, ix: false },
    umbralPositivo: initialUmbralPositivo(),
    molestiasLeves: { dx: false, ix: false, detalle: '' },
  };
}

function initialSintomasCodo(): SintomasCodo {
  return {
    dolorAgarrarSoportarPeso: { dx: false, ix: false },
    dolorReposo: { dx: false, ix: false },
    umbralPositivo: initialUmbralPositivo(),
    molestiasLeves: { dx: false, ix: false, detalle: '' },
  };
}

function initialSintomasManoMuneca(): SintomasManoMuneca {
  return {
    dolorAgarrarPresionar: { dx: false, ix: false },
    dolorMovimiento: { dx: false, ix: false },
    dolorReposo: { dx: false, ix: false },
    dolorUnDedo: { dx: false, ix: false },
    dolorTresDedos: { dx: false, ix: false },
    dolorPalma: { dx: false, ix: false },
    dolorDorso: { dx: false, ix: false },
    umbralPositivo: initialUmbralPositivo(),
    molestiasLeves: { dx: false, ix: false, detalle: '' },
  };
}

function initialInfoReportadaParestesia(): InfoReportadaParestesia {
  return {
    haTomadoMedicamentos: false,
    fisioterapia: false,
    visitaTraumatologiaMedicinaGeneral: false,
    rx: false,
    ecografiaRmn: false,
    emg: false,
  };
}

function initialUmbralPositivoParestesiaNocturna(): UmbralPositivoParestesiaNocturna {
  return {
    dx: false,
    ix: false,
    molestiaSuenoCasiTodaNoche: { dx: false, ix: false },
    ocurrenciaUnaSemana3Meses: { dx: false, ix: false },
    ocurrenciaUnaVezMes: { dx: false, ix: false },
    otrasVeces: '',
  };
}

function initialUmbralPositivoParestesiaDiurna(): UmbralPositivoParestesiaDiurna {
  return {
    dx: false,
    ix: false,
    molestiaSuenoCasiTodaNoche: { dx: false, ix: false },
    ocurrenciaUnaSemana3Meses: { dx: false, ix: false },
    ocurrenciaUnaVezMes: { dx: false, ix: false },
    otrasVeces: '',
  };
}

function initialSintomasParestesiaNocturna(): SintomasParestesiaNocturna {
  return {
    brazo: { dx: false, ix: false },
    antebrazo: { dx: false, ix: false },
    mano: { dx: false, ix: false },
    duracionMenor10Min: { dx: false, ix: false },
    duracionMayor10Min: { dx: false, ix: false },
    presenciaDuranteSueno: { dx: false, ix: false },
    aparicionAlDespertar: { dx: false, ix: false },
    umbralPositivo: initialUmbralPositivoParestesiaNocturna(),
    molestiasLeves: { dx: false, ix: false, detalle: '' },
  };
}

function initialSintomasParestesiaDiurna(): SintomasParestesiaDiurna {
  return {
    brazo: { dx: false, ix: false },
    antebrazo: { dx: false, ix: false },
    mano: { dx: false, ix: false },
    duracionMenor10Min: { dx: false, ix: false },
    duracionMayor10Min: { dx: false, ix: false },
    aparecenBrazosLevantados: { dx: false, ix: false },
    aparecenApoyaCodo: { dx: false, ix: false },
    aparicionFuerzaEjecucionTrabajo: { dx: false, ix: false },
    umbralPositivo: initialUmbralPositivoParestesiaDiurna(),
    molestiasLeves: { dx: false, ix: false, detalle: '' },
  };
}

export function initialEntrevistaState(atencion: AtencionDetalle | null): EntrevistaOsteomuscular {
  return {
    idAtencion: atencion?.idAtencion ?? '',
    datosGenerales: {
      fechaEntrevista: todayStr(),
      empresa: atencion?.empresa ?? '',
      area: atencion?.area ?? '',
      nombreApellidos: atencion?.paciente ?? '',
      fechaNacimiento: atencion?.fechaNac ?? '',
      edad: atencion?.edad ?? null,
      sexo: atencion?.sexo ?? '',
      antiguedadEmpresa: '',
      antiguedadPuesto: '',
      miembroDominante: { dx: false, ix: false },
      tipoExamen: { ingreso: false, periodico: false, retiro: false, otro: false },
    },
    miembrosSuperiores: {
      hombro: {
        tieneDolor: false,
        inicioMolestia: '',
        infoReportada: initialInfoReportadaBase(),
        sintomas: initialSintomasHombro(),
        observaciones: '',
      },
      codo: {
        tieneDolor: false,
        inicioMolestia: '',
        infoReportada: initialInfoReportadaCodo(),
        sintomas: initialSintomasCodo(),
        observaciones: '',
      },
      manoMuneca: {
        tieneDolor: false,
        inicioMolestia: '',
        infoReportada: initialInfoReportadaManoMuneca(),
        sintomas: initialSintomasManoMuneca(),
        observaciones: '',
      },
    },
    parestesiaNocturna: {
      tieneParestesia: false,
      inicioMolestia: '',
      infoReportada: initialInfoReportadaParestesia(),
      sintomas: initialSintomasParestesiaNocturna(),
    },
    parestesiaDiurna: {
      tieneParestesia: false,
      inicioMolestia: '',
      infoReportada: initialInfoReportadaParestesia(),
      sintomas: initialSintomasParestesiaDiurna(),
    },
    molestiaCervicalIrradiada: {
      tieneMolestia: false,
      inicioMolestia: '',
      extremidadAfectada: { dx: false, ix: false },
      inicianOEmpeoranElevandoExtremidades: false,
      frecuencia: {
        presentandoCasiTodoDia: false,
        presenciaUnaSemana12Meses: false,
        presenciaUnDiaMes: false,
      },
      otrosMomentos: '',
    },
    ausenciaYTrastornos: {
      diasAusenciaExtremidadSuperior: null,
      tieneTrastornoDiagnosticado: false,
      diagnosticos: {
        hombro: { tiene: false, cuando: '' },
        codo: { tiene: false, cuando: '' },
        manoMunecaTendinitis: { tiene: false, cuando: '' },
        manoMunecaTunelCarpiano: { tiene: false, cuando: '' },
      },
      totalDiasEnfermedad12Meses: null,
    },
    columna: {
      cervical: {
        presentaDisturbio: false,
        frecuenciaMolestia: initialFrecuencia(),
        frecuenciaDolor: initialFrecuencia(),
        irradiacion: {
          tieneIrradiacion: false,
          miembroSuperior: { dx: false, ix: false },
          detalleIrradiacion: '',
        },
        diasAusenciaTrabajo: null,
      },
      dorsal: {
        presentaDisturbio: false,
        frecuenciaMolestia: initialFrecuencia(),
        frecuenciaDolor: initialFrecuencia(),
        irradiacion: {
          tieneIrradiacion: false,
          emitorax: false,
          dx: false,
          ix: false,
          detalleIrradiacion: '',
        },
        diasAusenciaTrabajo: null,
      },
      lumboSacra: {
        presentaDisturbio: false,
        frecuenciaMolestia: initialFrecuencia(),
        frecuenciaDolor: initialFrecuencia(),
        irradiacion: {
          tieneIrradiacion: false,
          miembrosInferiores: false,
          dx: false,
          ix: false,
          detalleIrradiacion: '',
        },
        diasAusenciaTrabajo: null,
      },
    },
    lumbalgiaAguda: initialLumbalgiaAguda(),
    diagnosticoPatologiaColumna: initialDiagnosticoPatologiaColumna(),
    medicoEvaluador: {
      nombreYApellidos: '',
      fechaEvaluacion: '',
    },
  };
}

// ---- Deep set helper ----

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

// ---- Deep merge helper (hydration of stored interviews) ----

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge a stored (possibly outdated) interview payload over a fresh initial
 * state, so missing fields fall back to their defaults instead of breaking
 * the form.
 */
export function mergeEntrevista(
  base: EntrevistaOsteomuscular,
  override: unknown,
): EntrevistaOsteomuscular {
  return mergeDeep(
    base as unknown as Record<string, unknown>,
    override,
  ) as unknown as EntrevistaOsteomuscular;
}

function mergeDeep(base: Record<string, unknown>, override: unknown): Record<string, unknown> {
  if (!isPlainObject(override)) return base;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = mergeDeep(baseValue, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ---- Action types ----

export type EntrevistaAction =
  | { type: 'SET_FIELD'; path: string; value: unknown }
  | { type: 'LOAD'; state: EntrevistaOsteomuscular }
  | { type: 'RESET'; atencion: AtencionDetalle | null };

// ---- Reducer ----

export function entrevistaReducer(
  state: EntrevistaOsteomuscular,
  action: EntrevistaAction,
): EntrevistaOsteomuscular {
  switch (action.type) {
    case 'SET_FIELD':
      return setDeep(state as unknown as Record<string, unknown>, action.path, action.value) as unknown as EntrevistaOsteomuscular;
    case 'LOAD':
      return action.state;
    case 'RESET':
      return initialEntrevistaState(action.atencion);
    default:
      return state;
  }
}

// ---- Public hook ----

export interface UseEntrevistaOsteomuscularResult {
  state: EntrevistaOsteomuscular;
  isDirty: boolean;
  markSaved: () => void;
  setField: (path: string, value: unknown) => void;
  reset: (atencion: AtencionDetalle | null) => void;
  setDatosGenerales: (value: Partial<DatosGenerales>) => void;
  setDxIx: (basePath: string, lado: 'dx' | 'ix', value: boolean) => void;
  hydrate: (saved: unknown) => void;
}

export function useEntrevistaOsteomuscular(
  atencion: AtencionDetalle | null,
): UseEntrevistaOsteomuscularResult {
  const [state, dispatch] = useReducer(
    entrevistaReducer,
    atencion,
    initialEntrevistaState,
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeState(state));
  const currentSnapshot = serializeState(state);
  const isDirty = currentSnapshot !== savedSnapshot;

  const markSaved = useCallback(() => {
    setSavedSnapshot(currentSnapshot);
  }, [currentSnapshot]);

  const setField = useCallback(
    (path: string, value: unknown) => dispatch({ type: 'SET_FIELD', path, value }),
    [],
  );

  const reset = useCallback(
    (a: AtencionDetalle | null) => {
      setSavedSnapshot(serializeState(initialEntrevistaState(a)));
      dispatch({ type: 'RESET', atencion: a });
    },
    [],
  );

  const setDatosGenerales = useCallback(
    (value: Partial<DatosGenerales>) => {
      for (const [key, val] of Object.entries(value)) {
        dispatch({ type: 'SET_FIELD', path: `datosGenerales.${key}`, value: val });
      }
    },
    [],
  );

  const setDxIx = useCallback(
    (basePath: string, lado: 'dx' | 'ix', value: boolean) => {
      dispatch({ type: 'SET_FIELD', path: `${basePath}.${lado}`, value });
    },
    [],
  );

  const hydrate = useCallback(
    (saved: unknown) => {
      const merged = mergeEntrevista(initialEntrevistaState(atencion), saved);
      dispatch({ type: 'LOAD', state: merged });
      setSavedSnapshot(serializeState(merged));
    },
    [atencion],
  );

  return {
    state,
    isDirty,
    markSaved,
    setField,
    reset,
    setDatosGenerales,
    setDxIx,
    hydrate,
  };
}
