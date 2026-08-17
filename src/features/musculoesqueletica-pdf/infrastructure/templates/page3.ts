import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-3 manifest: COLUMNA (cervical, dorsal, lumbo-sacra).
 * Source: __temp__/page3.html + mapeo_datos_pg3.json
 * Data root: entrevista.columna.*
 */
export const PAGE_3_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page3.html';

export const PAGE_3_MANIFEST: PdfPageManifest = {
  page: 3,
  template: PAGE_3_TEMPLATE_PATH,
  tokens: {
    // ---- CERVICAL ----
    columna_cervical_presenta: { kind: 'check', path: 'entrevista.columna.cervical.presentaDisturbio', match: 'true' },
    columna_cervical_no: { kind: 'check', path: 'entrevista.columna.cervical.presentaDisturbio', match: 'false' },
    cc_molestia_raramente: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaMolestia.raramente' },
    cc_molestia_episodios: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaMolestia.episodios2a3Dias' },
    cc_molestia_medicamentos: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaMolestia.episodiosConMedicamentos' },
    cc_molestia_todo_dia: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaMolestia.presenteTodoElDia' },
    cc_dolor_raramente: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaDolor.raramente' },
    cc_dolor_episodios: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaDolor.episodios2a3Dias' },
    cc_dolor_medicamentos: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaDolor.episodiosConMedicamentos' },
    cc_dolor_todo_dia: { kind: 'check', path: 'entrevista.columna.cervical.frecuenciaDolor.presenteTodoElDia' },
    cc_irradiacion_si: { kind: 'check', path: 'entrevista.columna.cervical.irradiacion.tieneIrradiacion', match: 'true' },
    cc_irradiacion_no: { kind: 'check', path: 'entrevista.columna.cervical.irradiacion.tieneIrradiacion', match: 'false' },
    cc_miembro_superior_dx: { kind: 'check', path: 'entrevista.columna.cervical.irradiacion.miembroSuperior.dx' },
    cc_miembro_superior_ix: { kind: 'check', path: 'entrevista.columna.cervical.irradiacion.miembroSuperior.ix' },
    cc_ausencia_dias: { kind: 'text', path: 'entrevista.columna.cervical.diasAusenciaTrabajo' },

    // ---- DORSAL ----
    columna_dorsal_presenta: { kind: 'check', path: 'entrevista.columna.dorsal.presentaDisturbio', match: 'true' },
    columna_dorsal_no: { kind: 'check', path: 'entrevista.columna.dorsal.presentaDisturbio', match: 'false' },
    cd_molestia_raramente: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaMolestia.raramente' },
    cd_molestia_episodios: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaMolestia.episodios2a3Dias' },
    cd_molestia_medicamentos: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaMolestia.episodiosConMedicamentos' },
    cd_molestia_todo_dia: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaMolestia.presenteTodoElDia' },
    cd_dolor_raramente: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaDolor.raramente' },
    cd_dolor_episodios: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaDolor.episodios2a3Dias' },
    cd_dolor_medicamentos: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaDolor.episodiosConMedicamentos' },
    cd_dolor_todo_dia: { kind: 'check', path: 'entrevista.columna.dorsal.frecuenciaDolor.presenteTodoElDia' },
    cd_irradiacion_si: { kind: 'check', path: 'entrevista.columna.dorsal.irradiacion.tieneIrradiacion', match: 'true' },
    cd_irradiacion_no: { kind: 'check', path: 'entrevista.columna.dorsal.irradiacion.tieneIrradiacion', match: 'false' },
    cd_emitorax: { kind: 'check', path: 'entrevista.columna.dorsal.irradiacion.emitorax' },
    cd_irradiacion_dx: { kind: 'check', path: 'entrevista.columna.dorsal.irradiacion.dx' },
    cd_irradiacion_ix: { kind: 'check', path: 'entrevista.columna.dorsal.irradiacion.ix' },
    cd_ausencia_dias: { kind: 'text', path: 'entrevista.columna.dorsal.diasAusenciaTrabajo' },

    // ---- LUMBO SACRA ----
    columna_lumbo_sacra_presenta: { kind: 'check', path: 'entrevista.columna.lumboSacra.presentaDisturbio', match: 'true' },
    columna_lumbo_sacra_no: { kind: 'check', path: 'entrevista.columna.lumboSacra.presentaDisturbio', match: 'false' },
    cl_molestia_raramente: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaMolestia.raramente' },
    cl_molestia_episodios: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaMolestia.episodios2a3Dias' },
    cl_molestia_medicamentos: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaMolestia.episodiosConMedicamentos' },
    cl_molestia_todo_dia: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaMolestia.presenteTodoElDia' },
    cl_dolor_raramente: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaDolor.raramente' },
    cl_dolor_episodios: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaDolor.episodios2a3Dias' },
    cl_dolor_medicamentos: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaDolor.episodiosConMedicamentos' },
    cl_dolor_todo_dia: { kind: 'check', path: 'entrevista.columna.lumboSacra.frecuenciaDolor.presenteTodoElDia' },
    cl_irradiacion_si: { kind: 'check', path: 'entrevista.columna.lumboSacra.irradiacion.tieneIrradiacion', match: 'true' },
    cl_irradiacion_no: { kind: 'check', path: 'entrevista.columna.lumboSacra.irradiacion.tieneIrradiacion', match: 'false' },
    cl_miembros_inferiores: { kind: 'check', path: 'entrevista.columna.lumboSacra.irradiacion.miembrosInferiores' },
    cl_irradiacion_dx: { kind: 'check', path: 'entrevista.columna.lumboSacra.irradiacion.dx' },
    cl_irradiacion_ix: { kind: 'check', path: 'entrevista.columna.lumboSacra.irradiacion.ix' },
    cl_ausencia_dias: { kind: 'text', path: 'entrevista.columna.lumboSacra.diasAusenciaTrabajo' },
  },
};
