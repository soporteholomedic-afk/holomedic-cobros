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
}
