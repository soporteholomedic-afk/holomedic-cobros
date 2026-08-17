import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-2 manifest: PARESTESIA NOCTURNA + PARESTESIA DIURNA +
 * MOLESTIA CERVICAL IRRADIADA + AUSENCIA Y TRASTORNOS.
 *
 * Source: __temp__/page2.html + mapeo_datos-pg2.json
 * Data root: entrevista.*
 */
export const PAGE_2_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page2.html';

export const PAGE_2_MANIFEST: PdfPageManifest = {
  page: 2,
  template: PAGE_2_TEMPLATE_PATH,
  tokens: {
    // ---- PARESTESIA NOCTURNA ----
    parestesia_nocturna_tiene: { kind: 'check', path: 'entrevista.parestesiaNocturna.tieneParestesia', match: 'true' },
    parestesia_nocturna_no: { kind: 'check', path: 'entrevista.parestesiaNocturna.tieneParestesia', match: 'false' },
    parestesia_nocturna_inicio: { kind: 'text', path: 'entrevista.parestesiaNocturna.inicioMolestia' },
    pn_info_medicamentos: { kind: 'check', path: 'entrevista.parestesiaNocturna.infoReportada.haTomadoMedicamentos' },
    pn_info_fisioterapia: { kind: 'check', path: 'entrevista.parestesiaNocturna.infoReportada.fisioterapia' },
    pn_info_traumatologia: { kind: 'check', path: 'entrevista.parestesiaNocturna.infoReportada.visitaTraumatologiaMedicinaGeneral' },
    pn_info_rx: { kind: 'check', path: 'entrevista.parestesiaNocturna.infoReportada.rx' },
    pn_info_eco: { kind: 'check', path: 'entrevista.parestesiaNocturna.infoReportada.ecografiaRmn' },
    pn_info_emg: { kind: 'check', path: 'entrevista.parestesiaNocturna.infoReportada.emg' },
    pn_sint_brazo_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.brazo.dx' },
    pn_sint_brazo_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.brazo.ix' },
    pn_sint_antebrazo_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.antebrazo.dx' },
    pn_sint_antebrazo_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.antebrazo.ix' },
    pn_sint_mano_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.mano.dx' },
    pn_sint_mano_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.mano.ix' },
    pn_sint_duracion_menor10_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.duracionMenor10Min.dx' },
    pn_sint_duracion_menor10_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.duracionMenor10Min.ix' },
    pn_sint_duracion_mayor10_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.duracionMayor10Min.dx' },
    pn_sint_duracion_mayor10_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.duracionMayor10Min.ix' },
    pn_sint_presencia_sueno_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.presenciaDuranteSueno.dx' },
    pn_sint_presencia_sueno_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.presenciaDuranteSueno.ix' },
    pn_sint_aparicion_despertar_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.aparicionAlDespertar.dx' },
    pn_sint_aparicion_despertar_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.aparicionAlDespertar.ix' },
    pn_umbral_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.umbralPositivo.dx' },
    pn_umbral_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.umbralPositivo.ix' },
    pn_umbral_sueno_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.umbralPositivo.molestiaSuenoCasiTodaNoche.dx' },
    pn_umbral_semana_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.umbralPositivo.ocurrenciaUnaSemana3Meses.dx' },
    pn_umbral_mes_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.umbralPositivo.ocurrenciaUnaVezMes.dx' },
    pn_umbral_otras_veces: { kind: 'text', path: 'entrevista.parestesiaNocturna.sintomas.umbralPositivo.otrasVeces' },
    pn_leves_dx: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.molestiasLeves.dx' },
    pn_leves_ix: { kind: 'check', path: 'entrevista.parestesiaNocturna.sintomas.molestiasLeves.ix' },
    pn_leves_detalle: { kind: 'text', path: 'entrevista.parestesiaNocturna.sintomas.molestiasLeves.detalle' },

    // ---- PARESTESIA DIURNA ----
    parestesia_diurna_tiene: { kind: 'check', path: 'entrevista.parestesiaDiurna.tieneParestesia', match: 'true' },
    parestesia_diurna_no: { kind: 'check', path: 'entrevista.parestesiaDiurna.tieneParestesia', match: 'false' },
    parestesia_diurna_inicio: { kind: 'text', path: 'entrevista.parestesiaDiurna.inicioMolestia' },
    pd_info_medicamentos: { kind: 'check', path: 'entrevista.parestesiaDiurna.infoReportada.haTomadoMedicamentos' },
    pd_info_fisioterapia: { kind: 'check', path: 'entrevista.parestesiaDiurna.infoReportada.fisioterapia' },
    pd_info_traumatologia: { kind: 'check', path: 'entrevista.parestesiaDiurna.infoReportada.visitaTraumatologiaMedicinaGeneral' },
    pd_info_rx: { kind: 'check', path: 'entrevista.parestesiaDiurna.infoReportada.rx' },
    pd_info_eco: { kind: 'check', path: 'entrevista.parestesiaDiurna.infoReportada.ecografiaRmn' },
    pd_info_emg: { kind: 'check', path: 'entrevista.parestesiaDiurna.infoReportada.emg' },
    pd_sint_brazo_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.brazo.dx' },
    pd_sint_brazo_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.brazo.ix' },
    pd_sint_antebrazo_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.antebrazo.dx' },
    pd_sint_antebrazo_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.antebrazo.ix' },
    pd_sint_mano_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.mano.dx' },
    pd_sint_mano_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.mano.ix' },
    pd_sint_duracion_menor10_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.duracionMenor10Min.dx' },
    pd_sint_duracion_menor10_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.duracionMenor10Min.ix' },
    pd_sint_duracion_mayor10_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.duracionMayor10Min.dx' },
    pd_sint_duracion_mayor10_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.duracionMayor10Min.ix' },
    pd_sint_brazos_levantados_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.aparecenBrazosLevantados.dx' },
    pd_sint_brazos_levantados_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.aparecenBrazosLevantados.ix' },
    pd_sint_apoya_codo_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.aparecenApoyaCodo.dx' },
    pd_sint_apoya_codo_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.aparecenApoyaCodo.ix' },
    pd_sint_fuerza_trabajo_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.aparicionFuerzaEjecucionTrabajo.dx' },
    pd_sint_fuerza_trabajo_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.aparicionFuerzaEjecucionTrabajo.ix' },
    pd_umbral_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.umbralPositivo.dx' },
    pd_umbral_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.umbralPositivo.ix' },
    pd_umbral_sueno_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.umbralPositivo.molestiaSuenoCasiTodaNoche.dx' },
    pd_umbral_semana_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.umbralPositivo.ocurrenciaUnaSemana3Meses.dx' },
    pd_umbral_mes_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.umbralPositivo.ocurrenciaUnaVezMes.dx' },
    pd_umbral_otras_veces: { kind: 'text', path: 'entrevista.parestesiaDiurna.sintomas.umbralPositivo.otrasVeces' },
    pd_leves_dx: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.molestiasLeves.dx' },
    pd_leves_ix: { kind: 'check', path: 'entrevista.parestesiaDiurna.sintomas.molestiasLeves.ix' },
    pd_leves_detalle: { kind: 'text', path: 'entrevista.parestesiaDiurna.sintomas.molestiasLeves.detalle' },

    // ---- MOLESTIA CERVICAL IRRADIADA ----
    cervical_irradiada_tiene: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.tieneMolestia', match: 'true' },
    cervical_irradiada_no: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.tieneMolestia', match: 'false' },
    cervical_irradiada_inicio: { kind: 'text', path: 'entrevista.molestiaCervicalIrradiada.inicioMolestia' },
    ci_extremidad_dx: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.extremidadAfectada.dx' },
    ci_extremidad_ix: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.extremidadAfectada.ix' },
    ci_frecuencia_todo_dia: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.frecuencia.presentandoCasiTodoDia' },
    ci_frecuencia_una_semana: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.frecuencia.presenciaUnaSemana12Meses' },
    ci_frecuencia_un_dia_mes: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.frecuencia.presenciaUnDiaMes' },
    ci_inician_elevando_true: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades', match: 'true' },
    ci_inician_elevando_false: { kind: 'check', path: 'entrevista.molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades', match: 'false' },
    ci_otros_momentos: { kind: 'text', path: 'entrevista.molestiaCervicalIrradiada.otrosMomentos' },

    // ---- AUSENCIA Y TRASTORNOS ----
    ausencia_dias: { kind: 'text', path: 'entrevista.ausenciaYTrastornos.diasAusenciaExtremidadSuperior' },
    trastorno_tiene_true: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.tieneTrastornoDiagnosticado', match: 'true' },
    trastorno_tiene_false: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.tieneTrastornoDiagnosticado', match: 'false' },
    diag_hombro_true: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.hombro.tiene', match: 'true' },
    diag_hombro_false: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.hombro.tiene', match: 'false' },
    diag_hombro_cuando: { kind: 'text', path: 'entrevista.ausenciaYTrastornos.diagnosticos.hombro.cuando' },
    diag_codo_true: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.codo.tiene', match: 'true' },
    diag_codo_false: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.codo.tiene', match: 'false' },
    diag_codo_cuando: { kind: 'text', path: 'entrevista.ausenciaYTrastornos.diagnosticos.codo.cuando' },
    diag_mano_tendinitis_true: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.manoMunecaTendinitis.tiene', match: 'true' },
    diag_mano_tendinitis_false: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.manoMunecaTendinitis.tiene', match: 'false' },
    diag_mano_tendinitis_cuando: { kind: 'text', path: 'entrevista.ausenciaYTrastornos.diagnosticos.manoMunecaTendinitis.cuando' },
    diag_mano_tunel_true: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.manoMunecaTunelCarpiano.tiene', match: 'true' },
    diag_mano_tunel_false: { kind: 'check', path: 'entrevista.ausenciaYTrastornos.diagnosticos.manoMunecaTunelCarpiano.tiene', match: 'false' },
    diag_mano_tunel_cuando: { kind: 'text', path: 'entrevista.ausenciaYTrastornos.diagnosticos.manoMunecaTunelCarpiano.cuando' },
    total_dias_enfermedad: { kind: 'text', path: 'entrevista.ausenciaYTrastornos.totalDiasEnfermedad12Meses' },

    // ---- FIGURES with marks overlay (canonical repo assets) ----
    // Parestesia nocturna: manos.png (117×81) — same asset as page-1 figure_mano
    figure_pn_manos: {
      kind: 'figure',
      path: 'assets/images/musculo/entrevista/manos.png',
      marks: 'entrevista.parestesiaNocturna.areaDistribucionAnotaciones',
      imageWidth: 117,
      imageHeight: 81,
    },
    // Parestesia diurna: cuerpo_torso.png (110×136)
    figure_pd_torso: {
      kind: 'figure',
      path: 'assets/images/musculo/entrevista/cuerpo_torso.png',
      marks: 'entrevista.parestesiaDiurna.areaDistribucionAnotaciones',
      imageWidth: 110,
      imageHeight: 136,
    },
  },
};
