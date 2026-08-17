import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-8 manifest: EVALUACION COLUMNA - OBSERVACION + MANIOBRA PRESO PALPACION.
 * Source: __temp__/page8.html + mapeo_datos_pg8.json
 * Data root: evaluacion.evaluacionColumna.*
 */
export const PAGE_8_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page8.html';

const C = 'evaluacion.evaluacionColumna';

export const PAGE_8_MANIFEST: PdfPageManifest = {
  page: 8,
  template: PAGE_8_TEMPLATE_PATH,
  tokens: {
    // ---- OBSERVACION: CIFOSIS DORSAL ----
    cifosis_normal: { kind: 'check', path: `${C}.observacion.cifosisDorsal.normal` },
    cifosis_hipercifosis: { kind: 'check', path: `${C}.observacion.cifosisDorsal.hipercifosis` },
    cifosis_aplanamiento: { kind: 'check', path: `${C}.observacion.cifosisDorsal.aplanamientoCifosisDorsal` },

    // ---- OBSERVACION: LORDOSIS LUMBAR ----
    lordosis_normal: { kind: 'check', path: `${C}.observacion.lordosisLumbar.normal` },
    lordosis_hipercifosis: { kind: 'check', path: `${C}.observacion.lordosisLumbar.hipercifosis` },
    lordosis_aplanamiento: { kind: 'check', path: `${C}.observacion.lordosisLumbar.aplanamientoLordosisLumbar` },

    // ---- OBSERVACION: ESCOLIOSIS ----
    escoliosis_ausente: { kind: 'check', path: `${C}.observacion.presenciaEscoliosis.ausente` },
    escoliosis_dorsal_dx: { kind: 'check', path: `${C}.observacion.presenciaEscoliosis.dorsalDx` },
    escoliosis_dorsal_ix: { kind: 'check', path: `${C}.observacion.presenciaEscoliosis.dorsalIx` },
    escoliosis_lumbar_dx: { kind: 'check', path: `${C}.observacion.presenciaEscoliosis.lumbarDx` },
    escoliosis_lumbar_ix: { kind: 'check', path: `${C}.observacion.presenciaEscoliosis.lumbarIx` },

    // ---- OBSERVACION: RITMO LUMBO PELVICO ----
    ritmo_normal: { kind: 'check', path: `${C}.observacion.ritmoLumboPelvico.normal` },
    ritmo_lordosis_inmod: { kind: 'check', path: `${C}.observacion.ritmoLumboPelvico.lordosisLumbarInmodificada` },
    ritmo_dolor_lumbar: { kind: 'check', path: `${C}.observacion.ritmoLumboPelvico.dolorLumbar` },

    // ---- OBSERVACION: DORSO CURVO ESTRUCTURADO ----
    dorso_normal: { kind: 'check', path: `${C}.observacion.dorsoCurvoEstructuradoCifoEscoliosis.normal` },
    dorso_presencia: { kind: 'check', path: `${C}.observacion.dorsoCurvoEstructuradoCifoEscoliosis.presenciaDorsoCurvoEstructurado` },
    dorso_dolor: { kind: 'check', path: `${C}.observacion.dorsoCurvoEstructuradoCifoEscoliosis.dolorDorsal` },

    // ---- MANIOBRA PRESO PALPACION: CERVICAL ----
    palp_cerv_dolor_ausente: { kind: 'check', path: `${C}.maniobraPresoPalpacion.cervical.dolorAusente` },
    palp_cerv_dolor_presente: { kind: 'check', path: `${C}.maniobraPresoPalpacion.cervical.dolorPresente.aplica` },
    palp_cerv_apofisis_aplica: { kind: 'check', path: `${C}.maniobraPresoPalpacion.cervical.dolorPresente.apofisisEspacioIntervertebral.aplica` },
    palp_cerv_apofisis_numero: { kind: 'text', path: `${C}.maniobraPresoPalpacion.cervical.dolorPresente.apofisisEspacioIntervertebral.numeroApofisisEspacio` },
    palp_cerv_segmento_aplica: { kind: 'check', path: `${C}.maniobraPresoPalpacion.cervical.dolorPresente.segmentoMuscular.aplica` },
    palp_cerv_segmento_detalle: { kind: 'text', path: `${C}.maniobraPresoPalpacion.cervical.dolorPresente.segmentoMuscular.detalle` },

    // ---- MANIOBRA PRESO PALPACION: DORSAL ----
    palp_dors_dolor_ausente: { kind: 'check', path: `${C}.maniobraPresoPalpacion.dorsal.dolorAusente` },
    palp_dors_dolor_presente: { kind: 'check', path: `${C}.maniobraPresoPalpacion.dorsal.dolorPresente.aplica` },
    palp_dors_apofisis: { kind: 'check', path: `${C}.maniobraPresoPalpacion.dorsal.dolorPresente.apofisisEspacioIntervertebral` },
    palp_dors_segmento: { kind: 'check', path: `${C}.maniobraPresoPalpacion.dorsal.dolorPresente.segmentoMuscular` },

    // ---- MANIOBRA PRESO PALPACION: LUMBAR ----
    palp_lumb_dolor_ausente: { kind: 'check', path: `${C}.maniobraPresoPalpacion.lumbar.dolorAusente` },
    palp_lumb_dolor_presente: { kind: 'check', path: `${C}.maniobraPresoPalpacion.lumbar.dolorPresente.aplica` },
    palp_lumb_apofisis: { kind: 'check', path: `${C}.maniobraPresoPalpacion.lumbar.dolorPresente.apofisisEspacioIntervertebral` },
    palp_lumb_segmento: { kind: 'check', path: `${C}.maniobraPresoPalpacion.lumbar.dolorPresente.segmentoMuscular` },
  },
};
