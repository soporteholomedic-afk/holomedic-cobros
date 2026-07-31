export interface DxIxBool {
  dx: boolean;
  ix: boolean;
}

export interface InfoReportadaBase {
  haTomadoMedicamentos: boolean;
  fisioterapia: boolean;
  visitaOrtopedistaFisiatra: boolean;
  rx: boolean;
  ecografiaResonancia: boolean;
}

export interface InfoReportadaCodo extends InfoReportadaBase {
  emg: boolean;
}

export interface InfoReportadaManoMuneca extends InfoReportadaBase {
  emg: boolean;
}

export interface UmbralPositivo {
  dolorContinuo: DxIxBool;
  unaSemanaDolor12Meses: DxIxBool;
  unaVezMes12Meses: DxIxBool;
}

export interface SintomasHombro {
  dolorMovimiento: DxIxBool;
  dolorReposo: DxIxBool;
  umbralPositivo: UmbralPositivo;
  molestiasLeves: DxIxBool;
}

export interface SintomasCodo {
  dolorAgarrarSoportarPeso: DxIxBool;
  dolorReposo: DxIxBool;
  umbralPositivo: UmbralPositivo;
  molestiasLeves: DxIxBool;
}

export interface SintomasManoMuneca {
  dolorAgarrarPresionar: DxIxBool;
  dolorMovimiento: DxIxBool;
  dolorReposo: DxIxBool;
  dolorUnDedo: DxIxBool;
  dolorTresDedos: DxIxBool;
  dolorPalma: DxIxBool;
  dolorDorso: DxIxBool;
  umbralPositivo: UmbralPositivo;
  molestiasLeves: DxIxBool;
}

export interface SeccionHombro {
  tieneDolor: boolean;
  inicioMolestia: string;
  infoReportada: InfoReportadaBase;
  sintomas: SintomasHombro;
  observaciones: string;
}

export interface SeccionCodo {
  tieneDolor: boolean;
  inicioMolestia: string;
  infoReportada: InfoReportadaCodo;
  sintomas: SintomasCodo;
  observaciones: string;
}

/** PENDIENTE: campo areaDistribucionAnotaciones (mapeo_datos-pg1.json) */
export interface SeccionManoMuneca {
  tieneDolor: boolean;
  inicioMolestia: string;
  infoReportada: InfoReportadaManoMuneca;
  sintomas: SintomasManoMuneca;
  observaciones: string;
}

// ---- Página 2: Parestesia y trastornos ----

export interface InfoReportadaParestesia {
  haTomadoMedicamentos: boolean;
  fisioterapia: boolean;
  visitaOrtopedistaFisiatra: boolean;
  rx: boolean;
  ecografiaRmn: boolean;
  emg: boolean;
}

export interface UmbralPositivoParestesiaNocturna {
  dx: boolean;
  ix: boolean;
  molestiaSuenoCasiTodaNoche: DxIxBool;
  ocurrenciaUnaSemana12Meses: DxIxBool;
  ocurrenciaUnaVezMes: DxIxBool;
}

export interface UmbralPositivoParestesiaDiurna {
  dx: boolean;
  ix: boolean;
  molestiaCasiTodosDias: DxIxBool;
  ocurrenciaUnaSemana12Meses: DxIxBool;
  ocurrenciaUnDiaMes: DxIxBool;
}

export interface SintomasParestesiaNocturna {
  brazo: DxIxBool;
  antebrazo: DxIxBool;
  mano: DxIxBool;
  duracionMenor10Min: DxIxBool;
  duracionMayor10Min: DxIxBool;
  presenciaDuranteSueno: DxIxBool;
  aparicionAlDespertar: DxIxBool;
  umbralPositivo: UmbralPositivoParestesiaNocturna;
  molestiasLeves: DxIxBool;
}

export interface SintomasParestesiaDiurna {
  brazo: DxIxBool;
  antebrazo: DxIxBool;
  mano: DxIxBool;
  duracionMenor10Min: DxIxBool;
  duracionMayor10Min: DxIxBool;
  aparecenBrazosLevantados: DxIxBool;
  aparecenApoyaCodo: DxIxBool;
  aparicionFuerzaEjecucionTrabajo: DxIxBool;
  umbralPositivo: UmbralPositivoParestesiaDiurna;
  molestiasLeves: DxIxBool;
}

export interface ParestesiaNocturna {
  tieneParestesia: boolean;
  inicioMolestia: string;
  infoReportada: InfoReportadaParestesia;
  sintomas: SintomasParestesiaNocturna;
}

export interface ParestesiaDiurna {
  tieneParestesia: boolean;
  inicioMolestia: string;
  infoReportada: InfoReportadaParestesia;
  sintomas: SintomasParestesiaDiurna;
}

export interface MolestiaCervicalIrradiada {
  tieneMolestia: boolean;
  inicioMolestia: string;
  extremidadAfectada: DxIxBool;
  inicianOEmpeoranElevandoExtremidades: boolean;
  frecuencia: {
    presentandoCasiTodoDia: boolean;
    presenciaUnaSemana12Meses: boolean;
    presenciaUnDiaMes: boolean;
  };
}

export interface DiagnosticoTrastorno {
  tiene: boolean;
  cuando: string;
}

export interface AusenciaYTrastornos {
  diasAusenciaExtremidadSuperior: number | null;
  tieneTrastornoDiagnosticado: boolean;
  diagnosticos: {
    hombro: DiagnosticoTrastorno;
    codo: DiagnosticoTrastorno;
    manoMunecaTendinitis: DiagnosticoTrastorno;
    manoMunecaTunelCarpiano: DiagnosticoTrastorno;
  };
  totalDiasEnfermedad12Meses: number | null;
}

export interface MiembroDominante {
  dx: boolean;
  ix: boolean;
}

export interface TipoExamen {
  ingreso: boolean;
  periodico: boolean;
  retiro: boolean;
  otro: boolean;
}

export interface DatosGenerales {
  fechaEntrevista: string;
  empresa: string;
  area: string;
  nombreApellidos: string;
  fechaNacimiento: string;
  edad: number | null;
  sexo: string;
  antiguedadEmpresa: string;
  antiguedadPuesto: string;
  miembroDominante: MiembroDominante;
  tipoExamen: TipoExamen;
}

export interface EntrevistaOsteomuscular {
  idAtencion: string;
  datosGenerales: DatosGenerales;
  miembrosSuperiores: {
    hombro: SeccionHombro;
    codo: SeccionCodo;
    manoMuneca: SeccionManoMuneca;
  };
  parestesiaNocturna: ParestesiaNocturna;
  parestesiaDiurna: ParestesiaDiurna;
  molestiaCervicalIrradiada: MolestiaCervicalIrradiada;
  ausenciaYTrastornos: AusenciaYTrastornos;
}
