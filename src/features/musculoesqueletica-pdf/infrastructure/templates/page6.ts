import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-6 manifest: CODO (tests, examen) + MUNeca-MANO (observacion, palpacion, gatillo).
 * Source: __temp__/page6.html + mapeo_datos_pg6.json
 * Data root: evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores.*
 */
export const PAGE_6_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page6.html';

const E = 'evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores';

export const PAGE_6_MANIFEST: PdfPageManifest = {
  page: 6,
  template: PAGE_6_TEMPLATE_PATH,
  tokens: {
    // ---- CODO (palpacionEpicondileoEpitroclear + tests + examen + gravedad) ----
    codo_palp_epi_dx: { kind: 'check', path: `${E}.codo.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo.dx` },
    codo_palp_epi_ix: { kind: 'check', path: `${E}.codo.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo.ix` },
    codo_palp_epit_dx: { kind: 'check', path: `${E}.codo.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear.dx` },
    codo_palp_epit_ix: { kind: 'check', path: `${E}.codo.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear.ix` },
    codo_test_epic_dx: { kind: 'check', path: `${E}.codo.testEpicondilitis.presenciaDolorLateralCodo.dx` },
    codo_test_epic_ix: { kind: 'check', path: `${E}.codo.testEpicondilitis.presenciaDolorLateralCodo.ix` },
    codo_test_ulnar_dx: { kind: 'check', path: `${E}.codo.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos.dx` },
    codo_test_ulnar_ix: { kind: 'check', path: `${E}.codo.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos.ix` },
    codo_exam_no: { kind: 'check', path: `${E}.codo.examenInstrumental.noRealizado` },
    codo_exam_eco: { kind: 'check', path: `${E}.codo.examenInstrumental.ecografia` },
    codo_exam_eco_ano: { kind: 'text', path: `${E}.codo.examenInstrumental.ecografiaAno` },
    codo_exam_rx: { kind: 'check', path: `${E}.codo.examenInstrumental.rx` },
    codo_exam_rx_ano: { kind: 'text', path: `${E}.codo.examenInstrumental.rxAno` },
    codo_exam_emg: { kind: 'check', path: `${E}.codo.examenInstrumental.emg` },
    codo_exam_emg_ano: { kind: 'text', path: `${E}.codo.examenInstrumental.emgAno` },
    codo_gravedad: { kind: 'text', path: `${E}.codo.gravedadPatologiaCodo` },

    // ---- MUNeca-MANO (observacion, palpacion, gatillo) ----
    muneca_realiza: { kind: 'check', path: `${E}.munecaMano.realizaManiobras` },
    muneca_dx_desde: { kind: 'text', path: `${E}.munecaMano.molestiaMunecaDxDesdeMeses` },
    muneca_ix_desde: { kind: 'text', path: `${E}.munecaMano.molestiaMunecaIxDesdeMeses` },
    muneca_quiste_dorsal_dx: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.quisteDorsal.dx` },
    muneca_quiste_dorsal_ix: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.quisteDorsal.ix` },
    muneca_quiste_ventral_dx: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.quisteVentral.dx` },
    muneca_quiste_ventral_ix: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.quisteVentral.ix` },
    muneca_edema_ventral_dx: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.edemaVentralEstiloideRadial.dx` },
    muneca_edema_ventral_ix: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.edemaVentralEstiloideRadial.ix` },
    muneca_edema_dorsal_dx: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.edemaDorsalEstiloideUlnar.dx` },
    muneca_edema_dorsal_ix: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.edemaDorsalEstiloideUlnar.ix` },
    muneca_hipotrofia_dx: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.hipotrofiaPosterior.dx` },
    muneca_hipotrofia_ix: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.hipotrofiaPosterior.ix` },
    muneca_deformidad_dx: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.dx` },
    muneca_deformidad_ix: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.ix` },
    muneca_retenciones_dx: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.retaccionesPalmares.dx` },
    muneca_retenciones_ix: { kind: 'check', path: `${E}.munecaMano.observacionManoMuneca.retaccionesPalmares.ix` },
    muneca_palp_trapecio_dx: { kind: 'check', path: `${E}.munecaMano.palpacion.dolorArticulacionTrapecioMetacarpal.dx` },
    muneca_palp_trapecio_ix: { kind: 'check', path: `${E}.munecaMano.palpacion.dolorArticulacionTrapecioMetacarpal.ix` },
    muneca_palp_estiloide_dx: { kind: 'check', path: `${E}.munecaMano.palpacion.dolorEstiloideRadial.dx` },
    muneca_palp_estiloide_ix: { kind: 'check', path: `${E}.munecaMano.palpacion.dolorEstiloideRadial.ix` },
    // Gatillo - Dx fingers
    gatillo_dx_d1: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.dx.dedo1` },
    gatillo_dx_d2: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.dx.dedo2` },
    gatillo_dx_d3: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.dx.dedo3` },
    gatillo_dx_d4: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.dx.dedo4` },
    gatillo_dx_d5: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.dx.dedo5` },
    // Gatillo - Ix fingers
    gatillo_ix_d1: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.ix.dedo1` },
    gatillo_ix_d2: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.ix.dedo2` },
    gatillo_ix_d3: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.ix.dedo3` },
    gatillo_ix_d4: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.ix.dedo4` },
    gatillo_ix_d5: { kind: 'check', path: `${E}.munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.ix.dedo5` },
  },
};
