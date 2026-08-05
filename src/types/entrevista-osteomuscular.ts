export interface DxIxBool {
  dx: boolean;
  ix: boolean;
}

export interface InfoReportadaBase {
  haTomadoMedicamentos: boolean;
  fisioterapia: boolean;
  visitaTraumatologiaMedicinaGeneral: boolean;
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
  unaSemanaDolor3Meses: DxIxBool;
  unaVezMes12Meses: DxIxBool;
  otrasVeces: string;
}

export interface MolestiasLeves extends DxIxBool {
  detalle: string;
}

export interface SintomasHombro {
  dolorMovimiento: DxIxBool;
  dolorReposo: DxIxBool;
  umbralPositivo: UmbralPositivo;
  molestiasLeves: MolestiasLeves;
}

export interface SintomasCodo {
  dolorAgarrarSoportarPeso: DxIxBool;
  dolorReposo: DxIxBool;
  umbralPositivo: UmbralPositivo;
  molestiasLeves: MolestiasLeves;
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
  molestiasLeves: MolestiasLeves;
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
  visitaTraumatologiaMedicinaGeneral: boolean;
  rx: boolean;
  ecografiaRmn: boolean;
  emg: boolean;
}

export interface UmbralPositivoParestesiaNocturna {
  dx: boolean;
  ix: boolean;
  molestiaSuenoCasiTodaNoche: DxIxBool;
  ocurrenciaUnaSemana3Meses: DxIxBool;
  ocurrenciaUnaVezMes: DxIxBool;
  otrasVeces: string;
}

export interface UmbralPositivoParestesiaDiurna {
  dx: boolean;
  ix: boolean;
  molestiaSuenoCasiTodaNoche: DxIxBool;
  ocurrenciaUnaSemana3Meses: DxIxBool;
  ocurrenciaUnaVezMes: DxIxBool;
  otrasVeces: string;
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
  molestiasLeves: MolestiasLeves;
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
  molestiasLeves: MolestiasLeves;
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
  otrosMomentos: string;
}

export interface DiagnosticoTrastorno {
  tiene: boolean;
  cuando: string;
}

// ---- Página 3: Columna ----

export interface FrecuenciaMolestiaDolor {
  raramente: boolean;
  episodios2a3Dias: boolean;
  episodiosConMedicamentos: boolean;
  presenteTodoElDia: boolean;
}

export interface IrradiacionCervical {
  tieneIrradiacion: boolean;
  miembroSuperior: DxIxBool;
  detalleIrradiacion: string;
}

export interface IrradiacionDorsal {
  tieneIrradiacion: boolean;
  emitorax: boolean;
  dx: boolean;
  ix: boolean;
  detalleIrradiacion: string;
}

export interface IrradiacionLumboSacra {
  tieneIrradiacion: boolean;
  miembrosInferiores: boolean;
  dx: boolean;
  ix: boolean;
  detalleIrradiacion: string;
}

export interface SeccionColumna {
  presentaDisturbio: boolean;
  frecuenciaMolestia: FrecuenciaMolestiaDolor;
  frecuenciaDolor: FrecuenciaMolestiaDolor;
  diasAusenciaTrabajo: number | null;
}

export interface SeccionCervical extends SeccionColumna {
  irradiacion: IrradiacionCervical;
}

export interface SeccionDorsal extends SeccionColumna {
  irradiacion: IrradiacionDorsal;
}

export interface SeccionLumboSacra extends SeccionColumna {
  irradiacion: IrradiacionLumboSacra;
}

export interface Columna {
  cervical: SeccionCervical;
  dorsal: SeccionDorsal;
  lumboSacra: SeccionLumboSacra;
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

// ---- Página 4: Lumbalgia aguda y diagnóstico de columna ----

export interface EpisodioUltimoAno {
  aplica: boolean;
  cantidad: number | null;
}

export interface LumbalgiaAguda {
  tieneLumbalgiaAguda: boolean;
  totalEpisodiosAgudos: number | null;
  episodiosUltimoAno: {
    lumbalgia: EpisodioUltimoAno;
    lumbociatalgia: EpisodioUltimoAno;
  };
  anoPrimerEpisodio: string;
  diasAusenciaTrabajo: number | null;
}

export interface HerniaDiscoLumboSacra {
  diagnosticada: boolean;
  tratadaQuirurgicamente: boolean;
  cuando: string;
  fechaIntervencion: string;
}

export interface DiagnosticoPatologiaColumna {
  tieneDiagnosticoConocido: boolean;
  herniaDiscoLumboSacra: HerniaDiscoLumboSacra;
  patologiaTraumaCervical: string;
  patologiaTraumaDorsal: string;
  patologiaTraumaLumbosacra: string;
}

export interface MedicoEvaluador {
  nombreYApellidos: string;
  fechaEvaluacion: string;
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
  columna: Columna;
  lumbalgiaAguda: LumbalgiaAguda;
  diagnosticoPatologiaColumna: DiagnosticoPatologiaColumna;
  medicoEvaluador: MedicoEvaluador;
}
