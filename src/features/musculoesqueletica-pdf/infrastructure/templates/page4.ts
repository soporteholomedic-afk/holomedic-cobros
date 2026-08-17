import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-4 manifest: LUMBALGIA AGUDA + DIAGNOSTICO PATOLOGIA COLUMNA + FIRMA.
 * Source: __temp__/page4.html + mapeo_datos-pg4.json
 * Data root: entrevista.*
 */
export const PAGE_4_TEMPLATE_PATH = 'musculoesqueletica-pdf/pages/page4.html';

export const PAGE_4_MANIFEST: PdfPageManifest = {
  page: 4,
  template: PAGE_4_TEMPLATE_PATH,
  tokens: {
    // ---- LUMBALGIA AGUDA ----
    lumbalgia_tiene: { kind: 'check', path: 'entrevista.lumbalgiaAguda.tieneLumbalgiaAguda', match: 'true' },
    lumbalgia_no: { kind: 'check', path: 'entrevista.lumbalgiaAguda.tieneLumbalgiaAguda', match: 'false' },
    lumbalgia_total_episodios: { kind: 'text', path: 'entrevista.lumbalgiaAguda.totalEpisodiosAgudos' },
    lumbalgia_lumbalgia_aplica: { kind: 'check', path: 'entrevista.lumbalgiaAguda.episodiosUltimoAno.lumbalgia.aplica' },
    lumbalgia_lumbalgia_cantidad: { kind: 'text', path: 'entrevista.lumbalgiaAguda.episodiosUltimoAno.lumbalgia.cantidad' },
    lumbalgia_lumbociatalgia_aplica: { kind: 'check', path: 'entrevista.lumbalgiaAguda.episodiosUltimoAno.lumbociatalgia.aplica' },
    lumbalgia_lumbociatalgia_cantidad: { kind: 'text', path: 'entrevista.lumbalgiaAguda.episodiosUltimoAno.lumbociatalgia.cantidad' },
    lumbalgia_ano_primer_episodio: { kind: 'text', path: 'entrevista.lumbalgiaAguda.anoPrimerEpisodio' },
    lumbalgia_dias_ausencia: { kind: 'text', path: 'entrevista.lumbalgiaAguda.diasAusenciaTrabajo' },

    // ---- DIAGNOSTICO PATOLOGIA COLUMNA ----
    diag_columna_tiene: { kind: 'check', path: 'entrevista.diagnosticoPatologiaColumna.tieneDiagnosticoConocido', match: 'true' },
    diag_columna_no: { kind: 'check', path: 'entrevista.diagnosticoPatologiaColumna.tieneDiagnosticoConocido', match: 'false' },
    hernia_diagnosticada: { kind: 'check', path: 'entrevista.diagnosticoPatologiaColumna.herniaDiscoLumboSacra.diagnosticada' },
    hernia_quirurgica: { kind: 'check', path: 'entrevista.diagnosticoPatologiaColumna.herniaDiscoLumboSacra.tratadaQuirurgicamente' },
    hernia_cuando: { kind: 'text', path: 'entrevista.diagnosticoPatologiaColumna.herniaDiscoLumboSacra.cuando' },
    hernia_fecha_intervencion: { kind: 'text', path: 'entrevista.diagnosticoPatologiaColumna.herniaDiscoLumboSacra.fechaIntervencion' },
    patologia_cervical: { kind: 'text', path: 'entrevista.diagnosticoPatologiaColumna.patologiaTraumaCervical' },
    patologia_dorsal: { kind: 'text', path: 'entrevista.diagnosticoPatologiaColumna.patologiaTraumaDorsal' },
    patologia_lumbosacra: { kind: 'text', path: 'entrevista.diagnosticoPatologiaColumna.patologiaTraumaLumbosacra' },

    // ---- FIRMA MEDICO (blank / deferred) ----
    medico_nombre: { kind: 'text', path: 'entrevista.medicoEvaluador.nombreYApellidos' },
    medico_fecha: { kind: 'text', path: 'entrevista.medicoEvaluador.fechaEvaluacion' },

    // ---- FIRMA/HUELLA PACIENTE (Slice 2) ----
    image_firma_paciente: { kind: 'image', path: 'firma_paciente' },
    image_huella_paciente: { kind: 'image', path: 'huella_paciente' },
  },
};
