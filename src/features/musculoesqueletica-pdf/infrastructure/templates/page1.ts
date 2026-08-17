import type { PdfPageManifest } from '../../domain/entities';

/** Public-relative path of the offline page-1 HTML template. */
export const PAGE_1_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page1.html';

/**
 * Page-1 manifest: "Evaluación de Miembros Superiores".
 *
 * Consumes `entrevista.datosGenerales` + `entrevista.miembrosSuperiores`
 * (hombro / codo / mano-muñeca) plus the atencion identifier. Figure tokens
 * resolve the local anatomical illustrations under
 * `musculoesqueletica-pdf/assets/`.
 */
export const PAGE_1_MANIFEST: PdfPageManifest = {
  page: 1,
  template: PAGE_1_TEMPLATE_PATH,
  tokens: {
    // ---- Cabecera / atencion ----
    atencion_id: { kind: 'text', path: 'atencion.idAtencion' },

    // ---- Datos generales ----
    fecha_entrevista: { kind: 'text', path: 'entrevista.datosGenerales.fechaEntrevista' },
    empresa: { kind: 'text', path: 'entrevista.datosGenerales.empresa' },
    area: { kind: 'text', path: 'entrevista.datosGenerales.area' },
    nombre_apellidos: { kind: 'text', path: 'entrevista.datosGenerales.nombreApellidos' },
    fecha_nacimiento: { kind: 'text', path: 'entrevista.datosGenerales.fechaNacimiento' },
    edad: { kind: 'text', path: 'entrevista.datosGenerales.edad' },
    antiguedad_puesto: { kind: 'text', path: 'entrevista.datosGenerales.antiguedadPuesto' },
    antiguedad_empresa: { kind: 'text', path: 'entrevista.datosGenerales.antiguedadEmpresa' },
    sexo_m: { kind: 'check', path: 'entrevista.datosGenerales.sexo', match: 'M' },
    sexo_f: { kind: 'check', path: 'entrevista.datosGenerales.sexo', match: 'F' },
    tipo_examen_ingreso: { kind: 'check', path: 'entrevista.datosGenerales.tipoExamen.ingreso' },
    tipo_examen_periodico: { kind: 'check', path: 'entrevista.datosGenerales.tipoExamen.periodico' },
    tipo_examen_retiro: { kind: 'check', path: 'entrevista.datosGenerales.tipoExamen.retiro' },
    tipo_examen_otro: { kind: 'check', path: 'entrevista.datosGenerales.tipoExamen.otro' },
    miembro_dominante_dx: { kind: 'check', path: 'entrevista.datosGenerales.miembroDominante.dx' },
    miembro_dominante_ix: { kind: 'check', path: 'entrevista.datosGenerales.miembroDominante.ix' },

    // ---- Hombro ----
    hombro_tiene_dolor: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.tieneDolor' },
    hombro_inicio_molestia: { kind: 'text', path: 'entrevista.miembrosSuperiores.hombro.inicioMolestia' },
    hombro_info_medicamentos: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.infoReportada.haTomadoMedicamentos' },
    hombro_info_fisioterapia: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.infoReportada.fisioterapia' },
    hombro_info_traumatologia: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.infoReportada.visitaTraumatologiaMedicinaGeneral' },
    hombro_info_rx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.infoReportada.rx' },
    hombro_info_eco_rmn: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.infoReportada.ecografiaResonancia' },
    hombro_dolor_movimiento_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorMovimiento.dx' },
    hombro_dolor_movimiento_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorMovimiento.ix' },
    hombro_dolor_reposo_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorReposo.dx' },
    hombro_dolor_reposo_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorReposo.ix' },
    hombro_umbral_continuo_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.umbralPositivo.dolorContinuo.dx' },
    hombro_umbral_continuo_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.umbralPositivo.dolorContinuo.ix' },
    hombro_umbral_semana_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.umbralPositivo.unaSemanaDolor3Meses.dx' },
    hombro_umbral_semana_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.umbralPositivo.unaSemanaDolor3Meses.ix' },
    hombro_umbral_mes_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.umbralPositivo.unaVezMes12Meses.dx' },
    hombro_umbral_mes_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.umbralPositivo.unaVezMes12Meses.ix' },
    hombro_molestias_leves_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.molestiasLeves.dx' },
    hombro_molestias_leves_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.molestiasLeves.ix' },
    hombro_observaciones: { kind: 'text', path: 'entrevista.miembrosSuperiores.hombro.observaciones' },

    // ---- Codo ----
    codo_tiene_dolor: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.tieneDolor' },
    codo_inicio_molestia: { kind: 'text', path: 'entrevista.miembrosSuperiores.codo.inicioMolestia' },
    codo_info_medicamentos: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.infoReportada.haTomadoMedicamentos' },
    codo_info_fisioterapia: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.infoReportada.fisioterapia' },
    codo_info_traumatologia: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.infoReportada.visitaTraumatologiaMedicinaGeneral' },
    codo_info_rx: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.infoReportada.rx' },
    codo_info_eco_rmn: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.infoReportada.ecografiaResonancia' },
    codo_info_emg: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.infoReportada.emg' },
    codo_dolor_peso_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.dolorAgarrarSoportarPeso.dx' },
    codo_dolor_peso_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.dolorAgarrarSoportarPeso.ix' },
    codo_dolor_reposo_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.dolorReposo.dx' },
    codo_dolor_reposo_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.dolorReposo.ix' },
    codo_umbral_continuo_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.umbralPositivo.dolorContinuo.dx' },
    codo_umbral_continuo_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.umbralPositivo.dolorContinuo.ix' },
    codo_umbral_semana_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.umbralPositivo.unaSemanaDolor3Meses.dx' },
    codo_umbral_semana_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.umbralPositivo.unaSemanaDolor3Meses.ix' },
    codo_umbral_mes_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.umbralPositivo.unaVezMes12Meses.dx' },
    codo_umbral_mes_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.umbralPositivo.unaVezMes12Meses.ix' },
    codo_molestias_leves_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.molestiasLeves.dx' },
    codo_molestias_leves_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.codo.sintomas.molestiasLeves.ix' },
    codo_observaciones: { kind: 'text', path: 'entrevista.miembrosSuperiores.codo.observaciones' },

    // ---- Mano / muñeca ----
    mano_tiene_dolor: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.tieneDolor' },
    mano_inicio_molestia: { kind: 'text', path: 'entrevista.miembrosSuperiores.manoMuneca.inicioMolestia' },
    mano_info_medicamentos: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.infoReportada.haTomadoMedicamentos' },
    mano_info_fisioterapia: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.infoReportada.fisioterapia' },
    mano_info_traumatologia: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.infoReportada.visitaTraumatologiaMedicinaGeneral' },
    mano_info_rx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.infoReportada.rx' },
    mano_info_eco_rmn: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.infoReportada.ecografiaResonancia' },
    mano_info_emg: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.infoReportada.emg' },
    mano_dolor_pinza_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorAgarrarPresionar.dx' },
    mano_dolor_pinza_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorAgarrarPresionar.ix' },
    mano_dolor_movimiento_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorMovimiento.dx' },
    mano_dolor_movimiento_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorMovimiento.ix' },
    mano_dolor_reposo_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorReposo.dx' },
    mano_dolor_reposo_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorReposo.ix' },
    mano_dolor_1er_dedo_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorUnDedo.dx' },
    mano_dolor_1er_dedo_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorUnDedo.ix' },
    mano_dolor_3_dedos_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorTresDedos.dx' },
    mano_dolor_3_dedos_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorTresDedos.ix' },
    mano_dolor_palma_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorPalma.dx' },
    mano_dolor_palma_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorPalma.ix' },
    mano_dolor_dorso_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorDorso.dx' },
    mano_dolor_dorso_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.dolorDorso.ix' },
    mano_umbral_continuo_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.umbralPositivo.dolorContinuo.dx' },
    mano_umbral_continuo_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.umbralPositivo.dolorContinuo.ix' },
    mano_umbral_semana_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.umbralPositivo.unaSemanaDolor3Meses.dx' },
    mano_umbral_semana_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.umbralPositivo.unaSemanaDolor3Meses.ix' },
    mano_umbral_mes_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.umbralPositivo.unaVezMes12Meses.dx' },
    mano_umbral_mes_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.umbralPositivo.unaVezMes12Meses.ix' },
    mano_molestias_leves_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.molestiasLeves.dx' },
    mano_molestias_leves_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.manoMuneca.sintomas.molestiasLeves.ix' },
    mano_observaciones: { kind: 'text', path: 'entrevista.miembrosSuperiores.manoMuneca.observaciones' },

    // ---- Figures ----
    figure_hombro: { kind: 'figure', path: 'musculoesqueletica-pdf/assets/hombro.png' },
    figure_codo: { kind: 'figure', path: 'musculoesqueletica-pdf/assets/codo.png' },
    figure_mano: { kind: 'figure', path: 'musculoesqueletica-pdf/assets/mano.png' },
  },
};