import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-7 manifest: FINKELSTEIN + FLEXO-EXTENSION + SINTOMATOLOGIA PARESTESICA + APROXIMACION.
 * Source: __temp__/page7.html + mapeo_datos_pg7.json
 * Data root: evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores.*
 */
export const PAGE_7_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page7.html';

const E = 'evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores';

export const PAGE_7_MANIFEST: PdfPageManifest = {
  page: 7,
  template: PAGE_7_TEMPLATE_PATH,
  tokens: {
    // ---- FINKELSTEIN ----
    finkelstein_dx: { kind: 'check', path: `${E}.munecaMano.finkelstein.dolorTabaqueraAnatomica.dx` },
    finkelstein_ix: { kind: 'check', path: `${E}.munecaMano.finkelstein.dolorTabaqueraAnatomica.ix` },

    // ---- FLEXO-EXTENSION MUNeca ----
    flex_ext_flex_cr_dx: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorFlexionContraResistencia.dx` },
    flex_ext_flex_cr_ix: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorFlexionContraResistencia.ix` },
    flex_ext_flex_pasiva_dx: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorFlexionPasiva.dx` },
    flex_ext_flex_pasiva_ix: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorFlexionPasiva.ix` },
    flex_ext_ext_cr_dx: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorExtensionContraResistencia.dx` },
    flex_ext_ext_cr_ix: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorExtensionContraResistencia.ix` },
    flex_ext_ext_pasiva_dx: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorExtensionPasiva.dx` },
    flex_ext_ext_pasiva_ix: { kind: 'check', path: `${E}.munecaMano.flexoExtensionMuneca.dolorExtensionPasiva.ix` },

    // ---- SINTOMATOLOGIA PARESTESICA ----
    sint_parest_realiza: { kind: 'check', path: `${E}.sintomatologiaParestesica.realizaManiobras` },
    sint_parest_dx_desde: { kind: 'text', path: `${E}.sintomatologiaParestesica.molestiaParestesicaMunecaDxDesdeMeses` },
    sint_parest_ix_desde: { kind: 'text', path: `${E}.sintomatologiaParestesica.molestiaParestesicaMunecaIxDesdeMeses` },
    // Region proximal - dolor presion
    prox_apofisis: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorPresionPalpacion.apofisisEspinosa` },
    prox_trapeacio: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorPresionPalpacion.mTrapecioSuperior` },
    prox_paravertebral: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorPresionPalpacion.mParavertebral` },
    // Region proximal - dolor movimiento
    prox_flexion: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorMovimiento.flexion` },
    prox_extension: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorMovimiento.extension` },
    prox_incl_der: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorMovimiento.inclinacionDerecha` },
    prox_incl_izq: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorMovimiento.inclinacionIzquierda` },
    prox_rot_der: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorMovimiento.rotacionDerecha` },
    prox_rot_izq: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.dolorMovimiento.rotacionIzquierda` },
    // Tests proximal
    prox_test_fatiga_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.testFatiga.parestesia.dx` },
    prox_test_fatiga_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.testFatiga.parestesia.ix` },
    prox_test_candelero_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.testCandelero.parestesia.dx` },
    prox_test_candelero_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionProximal.testCandelero.parestesia.ix` },
    // Region distal - Phalen
    phalen_nmediano_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPhalen.parestesia.nervioMediano.dx` },
    phalen_nmediano_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPhalen.parestesia.nervioMediano.ix` },
    phalen_nulnar_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPhalen.parestesia.nervioUlnar.dx` },
    phalen_nulnar_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPhalen.parestesia.nervioUlnar.ix` },
    phalen_noterr_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPhalen.parestesia.noTerritorializada.dx` },
    phalen_noterr_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPhalen.parestesia.noTerritorializada.ix` },
    // Region distal - Presion
    presion_nmediano_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPresion.parestesia.nervioMediano.dx` },
    presion_nmediano_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPresion.parestesia.nervioMediano.ix` },
    presion_nulnar_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPresion.parestesia.nervioUlnar.dx` },
    presion_nulnar_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPresion.parestesia.nervioUlnar.ix` },
    presion_noterr_dx: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPresion.parestesia.noTerritorializada.dx` },
    presion_noterr_ix: { kind: 'check', path: `${E}.sintomatologiaParestesica.regionDistal.testPresion.parestesia.noTerritorializada.ix` },
    // Examen instrumental parestesico
    sint_exam_no: { kind: 'check', path: `${E}.sintomatologiaParestesica.examenInstrumental.noRealizado` },
    sint_exam_eco_ano: { kind: 'text', path: `${E}.sintomatologiaParestesica.examenInstrumental.ecografiaAno` },
    sint_exam_rx_ano: { kind: 'text', path: `${E}.sintomatologiaParestesica.examenInstrumental.rxAno` },
    sint_exam_rmn_ano: { kind: 'text', path: `${E}.sintomatologiaParestesica.examenInstrumental.rmnAno` },
    sint_exam_emg_ano: { kind: 'text', path: `${E}.sintomatologiaParestesica.examenInstrumental.emgAno` },
    sint_gravedad: { kind: 'text', path: `${E}.sintomatologiaParestesica.gravedadPatologiaManoMuneca` },

    // ---- APROXIMACION DIAGNOSTICA ----
    approx_diag: { kind: 'text', path: `${E}.sintomatologiaParestesica.aproximacionDiagnosticaEvaluacion` },
  },
};
