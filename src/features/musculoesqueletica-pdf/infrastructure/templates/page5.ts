import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-5 manifest: EVALUACION CLINICA - ESCAPULO HUMERAL + CODO (palpacion, movilidad, etc.)
 * Source: __temp__/page5.html + mapeo_datos_pg5.json
 * Data root: evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores.*
 */
export const PAGE_5_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page5.html';

const E = 'evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores';

export const PAGE_5_MANIFEST: PdfPageManifest = {
  page: 5,
  template: PAGE_5_TEMPLATE_PATH,
  tokens: {
    // ---- ESCAPULO HUMERAL ----
    escapulo_realiza: { kind: 'check', path: `${E}.escapuloHumeral.realizaManiobras` },
    escapulo_hombro_dx_desde: { kind: 'text', path: `${E}.escapuloHumeral.molestiaHombroDxDesdeMeses` },
    escapulo_hombro_ix_desde: { kind: 'text', path: `${E}.escapuloHumeral.molestiaHombroIxDesdeMeses` },
    palp_hombro_ant_dx: { kind: 'check', path: `${E}.escapuloHumeral.palpacionHombro.dolorAnterior.dx` },
    palp_hombro_ant_ix: { kind: 'check', path: `${E}.escapuloHumeral.palpacionHombro.dolorAnterior.ix` },
    palp_hombro_lat_dx: { kind: 'check', path: `${E}.escapuloHumeral.palpacionHombro.dolorLateral.dx` },
    palp_hombro_lat_ix: { kind: 'check', path: `${E}.escapuloHumeral.palpacionHombro.dolorLateral.ix` },
    palp_hombro_post_dx: { kind: 'check', path: `${E}.escapuloHumeral.palpacionHombro.dolorPosterior.dx` },
    palp_hombro_post_ix: { kind: 'check', path: `${E}.escapuloHumeral.palpacionHombro.dolorPosterior.ix` },
    mov_flex_dx: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.flexionElevacionAnterior.dx` },
    mov_flex_ix: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.flexionElevacionAnterior.ix` },
    mov_abd_dx: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.abduccionElevacionLateral.dx` },
    mov_abd_ix: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.abduccionElevacionLateral.ix` },
    mov_rot_int_dx: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.rotacionInterna.dx` },
    mov_rot_int_ix: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.rotacionInterna.ix` },
    mov_rot_ext_dx: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.rotacionExterna.dx` },
    mov_rot_ext_ix: { kind: 'check', path: `${E}.escapuloHumeral.movilidadPresenciaDolor.rotacionExterna.ix` },
    arco_dx: { kind: 'check', path: `${E}.escapuloHumeral.arcoDoloroso.presenteDx` },
    arco_ix: { kind: 'check', path: `${E}.escapuloHumeral.arcoDoloroso.presenteIx` },
    arco_ausente: { kind: 'check', path: `${E}.escapuloHumeral.arcoDoloroso.ausente` },
    biceps_ausente: { kind: 'check', path: `${E}.escapuloHumeral.testTendinitisTendonLargoBiceps.dolorAusente` },
    biceps_dx: { kind: 'check', path: `${E}.escapuloHumeral.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroDx` },
    biceps_ix: { kind: 'check', path: `${E}.escapuloHumeral.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroIx` },
    exam_ins_no: { kind: 'check', path: `${E}.escapuloHumeral.examenInstrumental.noRealizo` },
    exam_ins_eco: { kind: 'check', path: `${E}.escapuloHumeral.examenInstrumental.ecografia.realiza` },
    exam_ins_eco_ano: { kind: 'text', path: `${E}.escapuloHumeral.examenInstrumental.ecografia.ano` },
    exam_ins_rx: { kind: 'check', path: `${E}.escapuloHumeral.examenInstrumental.rx.realiza` },
    exam_ins_rx_ano: { kind: 'text', path: `${E}.escapuloHumeral.examenInstrumental.rx.ano` },
    exam_ins_rmn: { kind: 'check', path: `${E}.escapuloHumeral.examenInstrumental.rmn.realiza` },
    exam_ins_rmn_ano: { kind: 'text', path: `${E}.escapuloHumeral.examenInstrumental.rmn.ano` },
    gravedad_hombro: { kind: 'text', path: `${E}.escapuloHumeral.gravedadPatologiaHombro` },

    // ---- CODO ----
    codo_realiza: { kind: 'check', path: `${E}.codo.realizaManiobras` },
    codo_dx_desde: { kind: 'text', path: `${E}.codo.molestiaCodoDxDesdeMeses` },
    codo_ix_desde: { kind: 'text', path: `${E}.codo.molestiaCodoIxDesdeMeses` },
    codo_edema_loc_dx: { kind: 'check', path: `${E}.codo.observacionInspeccion.edemaLocalizado.dx` },
    codo_edema_loc_ix: { kind: 'check', path: `${E}.codo.observacionInspeccion.edemaLocalizado.ix` },
    codo_edema_sitio: { kind: 'text', path: `${E}.codo.observacionInspeccion.sitio` },
    codo_edema_noloc_dx: { kind: 'check', path: `${E}.codo.observacionInspeccion.edemaNoLocalizado.dx` },
    codo_edema_noloc_ix: { kind: 'check', path: `${E}.codo.observacionInspeccion.edemaNoLocalizado.ix` },
    codo_palp_epic_dx: { kind: 'check', path: `${E}.codo.palpacion.dolorEpicondilo.dx` },
    codo_palp_epic_ix: { kind: 'check', path: `${E}.codo.palpacion.dolorEpicondilo.ix` },
    codo_palp_epit_dx: { kind: 'check', path: `${E}.codo.palpacion.dolorEpitroclea.dx` },
    codo_palp_epit_ix: { kind: 'check', path: `${E}.codo.palpacion.dolorEpitroclea.ix` },
    codo_palp_olec_dx: { kind: 'check', path: `${E}.codo.palpacion.dolorOlecranon.dx` },
    codo_palp_olec_ix: { kind: 'check', path: `${E}.codo.palpacion.dolorOlecranon.ix` },
  },
};
