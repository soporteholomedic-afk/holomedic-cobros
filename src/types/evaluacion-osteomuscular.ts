export interface DxIxBool {
  dx: boolean;
  ix: boolean;
}

// ---- Escapulo Humeral ----

export interface PalpacionHombro {
  dolorAnterior: DxIxBool;
  dolorLateral: DxIxBool;
  dolorPosterior: DxIxBool;
}

export interface MovilidadPresenciaDolor {
  flexionElevacionAnterior: DxIxBool;
  abduccionElevacionLateral: DxIxBool;
  rotacionInterna: DxIxBool;
  rotacionExterna: DxIxBool;
}

export interface ArcoDoloroso {
  presenteDx: boolean;
  presenteIx: boolean;
  ausente: boolean;
}

export interface TestTendinitisBiceps {
  dolorAusente: boolean;
  presenciaDolorAnteriorHombroDx: boolean;
  presenciaDolorAnteriorHombroIx: boolean;
}

export interface ExamenInstrumentalItem {
  realiza: boolean;
  ano: string;
}

export interface ExamenInstrumental {
  noRealizo: boolean;
  ecografia: ExamenInstrumentalItem;
  rx: ExamenInstrumentalItem;
  rmn: ExamenInstrumentalItem;
}

export type GravedadPatologia = 'LEVE' | 'MEDIA' | 'GRAVE';

export interface EscapuloHumeral {
  realizaManiobras: boolean;
  molestiaHombroDxDesdeMeses: number | null;
  molestiaHombroIxDesdeMeses: number | null;
  palpacionHombro: PalpacionHombro;
  movilidadPresenciaDolor: MovilidadPresenciaDolor;
  arcoDoloroso: ArcoDoloroso;
  testTendinitisTendonLargoBiceps: TestTendinitisBiceps;
  examenInstrumental: ExamenInstrumental;
  gravedadPatologiaHombro: GravedadPatologia | null;
}

// ---- Codo ----

export interface ObservacionInspeccionCodo {
  edemaLocalizado: DxIxBool;
  sitio: string;
  edemaNoLocalizado: DxIxBool;
}

export interface PalpacionCodo {
  dolorEpicondilo: DxIxBool;
  dolorEpitroclea: DxIxBool;
  dolorOlecranon: DxIxBool;
}

export interface PalpacionEpicondileoEpitroclear {
  dolorMusculoEpicondileo: DxIxBool;
  dolorMusculoEpitroclear: DxIxBool;
}

export interface TestEpicondilitis {
  presenciaDolorLateralCodo: DxIxBool;
}

export interface TestAtrapamientoNervioUlnar {
  parestesiasIrradianAntebrazoODedos: DxIxBool;
}

export interface ExamenInstrumentalCodo {
  noRealizado: boolean;
  ecografia: boolean;
  ecografiaAno: number | null;
  rx: boolean;
  rxAno: number | null;
  emg: boolean;
  emgAno: number | null;
}

export interface Codo {
  realizaManiobras: boolean;
  molestiaCodoDxDesdeMeses: number | null;
  molestiaCodoIxDesdeMeses: number | null;
  observacionInspeccion: ObservacionInspeccionCodo;
  palpacion: PalpacionCodo;
  palpacionEpicondileoEpitroclear: PalpacionEpicondileoEpitroclear;
  testEpicondilitis: TestEpicondilitis;
  testAtrapamientoNervioUlnar: TestAtrapamientoNervioUlnar;
  examenInstrumental: ExamenInstrumentalCodo;
  gravedadPatologiaCodo: GravedadPatologia | null;
}

// ---- Muñeca / Mano ----

export interface ObservacionManoMuneca {
  quisteDorsal: DxIxBool;
  quisteVentral: DxIxBool;
  edemaVentralEstiloideRadial: DxIxBool;
  edemaDorsalEstiloideUlnar: DxIxBool;
  hipotrofiaPosterior: DxIxBool;
  deformidadArticularTrapecioMetacarpal: DxIxBool;
  retaccionesPalmares: DxIxBool;
}

export interface PalpacionMunecaMano {
  dolorArticulacionTrapecioMetacarpal: DxIxBool;
  dolorEstiloideRadial: DxIxBool;
}

export interface ClicExtensionDedos {
  dx: DedosCheck;
  ix: DedosCheck;
}

export interface DedosCheck {
  dedo1: boolean;
  dedo2: boolean;
  dedo3: boolean;
  dedo4: boolean;
  dedo5: boolean;
}

export interface ManiobraClicDedosGatillo {
  clicExtensionDedos: ClicExtensionDedos;
}

export interface FinkelsteinMuneca {
  dolorTabaqueraAnatomica: DxIxBool;
}

export interface FlexoExtensionMuneca {
  dolorFlexionContraResistencia: DxIxBool;
  dolorFlexionPasiva: DxIxBool;
  dolorExtensionContraResistencia: DxIxBool;
  dolorExtensionPasiva: DxIxBool;
}

export interface DolorPresionPalpacionProximal {
  apofisisEspinosa: boolean;
  mTrapecioSuperior: boolean;
  mParavertebral: boolean;
}

export interface DolorMovimientoProximal {
  flexion: boolean;
  extension: boolean;
  inclinacionDerecha: boolean;
  inclinacionIzquierda: boolean;
  rotacionDerecha: boolean;
  rotacionIzquierda: boolean;
}

export interface ParestesiaNerviosa {
  nervioMediano: DxIxBool;
  nervioUlnar: DxIxBool;
  noTerritorializada: DxIxBool;
}

export interface RegionProximalParestesica {
  dolorPresionPalpacion: DolorPresionPalpacionProximal;
  dolorMovimiento: DolorMovimientoProximal;
  testFatiga: { parestesia: DxIxBool };
  testCandelero: { parestesia: DxIxBool };
}

export interface RegionDistalParestesica {
  testPhalen: { parestesia: ParestesiaNerviosa };
  testPresion: { parestesia: ParestesiaNerviosa };
}

export interface ExamenInstrumentalMuneca {
  noRealizado: boolean;
  ecografia: boolean;
  ecografiaAno: number | null;
  rx: boolean;
  rxAno: number | null;
  rmn: boolean;
  rmnAno: number | null;
  emg: boolean;
  emgAno: number | null;
}

export interface SintomatologiaParestesica {
  regionProximal: RegionProximalParestesica;
  regionDistal: RegionDistalParestesica;
  examenInstrumental: ExamenInstrumentalMuneca;
  gravedadPatologiaManoMuneca: GravedadPatologia | null;
  aproximacionDiagnosticaEvaluacion: string;
}

export interface MunecaMano {
  realizaManiobras: boolean;
  molestiaMunecaDxDesdeMeses: number | null;
  molestiaMunecaIxDesdeMeses: number | null;
  observacionManoMuneca: ObservacionManoMuneca;
  palpacion: PalpacionMunecaMano;
  maniobraClicDedosGatillo: ManiobraClicDedosGatillo;
  finkelstein: FinkelsteinMuneca;
  flexoExtensionMuneca: FlexoExtensionMuneca;
  sintomatologiaParestesica: SintomatologiaParestesica;
}

// ---- Agregado: Miembros Superiores ----

export interface MiembrosSuperioresEvaluacion {
  escapuloHumeral: EscapuloHumeral;
  codo: Codo;
  munecaMano: MunecaMano;
}

// ---- Estado global de evaluación ----

export interface EvaluacionOsteomuscular {
  idAtencion: string;
  evaluacionClinicaOsteomuscular: {
    miembrosSuperiores: MiembrosSuperioresEvaluacion;
  };
}
