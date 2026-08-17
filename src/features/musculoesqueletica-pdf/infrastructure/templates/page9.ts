import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-9 manifest: MOTILIDAD + LASEGUE + WASSERMAN + APROXIMACION DIAGNOSTICA.
 * Source: __temp__/page9.html + mapeo_datos_pg9.json
 * Data root: evaluacion.*
 */
export const PAGE_9_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page9.html';

export const PAGE_9_MANIFEST: PdfPageManifest = {
  page: 9,
  template: PAGE_9_TEMPLATE_PATH,
  tokens: {
    // ---- EVALUACION MOTILIDAD: CERVICAL ----
    motilidad_cerv_flexion: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento.flexion' },
    motilidad_cerv_extension: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento.extension' },
    motilidad_cerv_incl_dx: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento.inclinacionDx' },
    motilidad_cerv_incl_ix: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento.inclinacionIx' },
    motilidad_cerv_rot_dx: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento.rotacionDx' },
    motilidad_cerv_rot_ix: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento.rotacionIx' },

    // ---- EVALUACION MOTILIDAD: DORSO LUMBAR ----
    motilidad_dl_flexion: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento.flexion' },
    motilidad_dl_extension: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento.extension' },
    motilidad_dl_incl_dx: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento.inclinacionDx' },
    motilidad_dl_incl_ix: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento.inclinacionIx' },
    motilidad_dl_rot_dx: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento.rotacionDx' },
    motilidad_dl_rot_ix: { kind: 'check', path: 'evaluacion.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento.rotacionIx' },

    // ---- LASEGUE / SLR ----
    lasegue_normal: { kind: 'check', path: 'evaluacion.maniobraLasegueRetraccionIsquioCrural.lasegueSlr.normal' },
    lasegue_dx: { kind: 'check', path: 'evaluacion.maniobraLasegueRetraccionIsquioCrural.lasegueSlr.dx' },
    lasegue_ix: { kind: 'check', path: 'evaluacion.maniobraLasegueRetraccionIsquioCrural.lasegueSlr.ix' },
    lasegue_observacion: { kind: 'text', path: 'evaluacion.maniobraLasegueRetraccionIsquioCrural.lasegueSlr.observacion' },
    lasegue_retraccion: { kind: 'check', path: 'evaluacion.maniobraLasegueRetraccionIsquioCrural.presenciaRetraccionIsquioCrural' },

    // ---- WASSERMAN ----
    wasserman_dx: { kind: 'check', path: 'evaluacion.maniobraWassermanRetraccionIleopsoas.wassermanLasegueInvertido.dx' },
    wasserman_ix: { kind: 'check', path: 'evaluacion.maniobraWassermanRetraccionIleopsoas.wassermanLasegueInvertido.ix' },
    wasserman_observacion: { kind: 'text', path: 'evaluacion.maniobraWassermanRetraccionIleopsoas.wassermanLasegueInvertido.observacion' },
    wasserman_retraccion: { kind: 'check', path: 'evaluacion.maniobraWassermanRetraccionIleopsoas.presenciaRetraccionIleopsoas' },

    // ---- APROXIMACION DIAGNOSTICA ----
    approx_diag: { kind: 'text', path: 'evaluacion.aproximacionDiagnosticaEvaluacion' },
  },
};
