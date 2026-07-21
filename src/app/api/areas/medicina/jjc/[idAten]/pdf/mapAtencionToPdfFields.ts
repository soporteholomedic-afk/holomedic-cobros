import type { AtencionDetalle, JjcEvaluacion } from '@/types/jjc';
import { chunkLongText } from './chunkLongText';

/** Budget per Observaciones field (3 slots available). */
const OBSERVACIONES_BUDGET = 160;
/** Budget per Describa field (2 slots available). */
const DESCRIBA_BUDGET = 200;
/**
 * Real AcroForm field name prefix from `public/PLANTILLA_JJC_MEDICINA.pdf`.
 * The route generates suffixed field names by appending ` ${i + 1}`, so the
 * two real fields become:
 *   - "Describa en caso de tener alguna respuesta positiva 1"
 *   - "Describa en caso de tener alguna respuesta positiva 2"
 */
const DESCRIBA_FIELD_PREFIX =
  'Describa en caso de tener alguna respuesta positiva';

export interface PdfFieldMap {
  /** Simple text fields: field name → string value. */
  text: Record<string, string>;
  /** Checkbox fields: field name → true (checked) / false (unchecked). */
  checks: Record<string, boolean>;
  /** Multi-slot text fields: field prefix → array of chunked values. */
  chunks: Record<string, string[]>;
}

// The first 11 keys of CuestionarioPiel that carry PreguntaBase/PreguntaConFecha.
// Ordered positions map to cbk_{1..11}_si/no and the corresponding detail field
// (when one exists in the template). The real PLANTILLA_JJC_MEDICINA.pdf only
// has detail text fields for preguntas 1, 2, 5, 6, 7, and 9; preguntas 3, 4,
// 8, 10, and 11 do NOT carry a detail slot. Encoding the field name explicitly
// here is what makes the integration test against the real template pass.
type PreguntaFieldKey = 'sufreEnfermedadesPiel' | 'tieneLesionActual' | 'cambioColoracion'
  | 'lesionesRepiten' | 'enrojecimiento' | 'comezon' | 'hinchazon' | 'rinitisAsma'
  | 'usaEPP' | 'cambiosUnas' | 'tomaMedicacion';
const PREGUNTA_KEYS: PreguntaFieldKey[] = [
  'sufreEnfermedadesPiel',
  'tieneLesionActual',
  'cambioColoracion',
  'lesionesRepiten',
  'enrojecimiento',
  'comezon',
  'hinchazon',
  'rinitisAsma',
  'usaEPP',
  'cambiosUnas',
  'tomaMedicacion',
];

/**
 * Real AcroForm detail field for each pregunta number, or `null` if the
 * template has no detail slot for that pregunta. Source of truth:
 * `public/PLANTILLA_JJC_MEDICINA.pdf`.
 */
const PREGUNTA_DETAIL_FIELD: Record<number, string | null> = {
  1: 'txt_1_response',
  2: 'txt_2-1_response', // date sibling lives at `txt_2-2_response`
  3: null,
  4: null,
  5: 'txt_5_response',
  6: 'txt_6_response',
  7: 'txt_7_response',
  8: null,
  9: 'txt_9_response',
  10: null,
  11: null,
};

export function mapAtencionToPdfFields(
  atencion: AtencionDetalle,
  evaluacion: JjcEvaluacion | null,
): PdfFieldMap {
  const text: Record<string, string> = {
    txt_dni: atencion.dni ?? '',
    txt_nombre_completo: atencion.paciente ?? '',
    txt_empresa: atencion.empresa ?? '',
    txt_ocupacion: atencion.puesto ?? '',
    txt_area: atencion.area ?? '',
    txt_fecha_examen: atencion.fechaAtencion ?? '',
    txt_lugar: 'HOLOMEDIC',
  };

  const checks: Record<string, boolean> = {};
  const chunks: Record<string, string[]> = {};

  if (!evaluacion) {
    // No evaluation — fill zeros for counts
    text.txt_tipo_fototipo = '';
    text.txt_fecha = '';
    text.txt_count_lunar = '0';
    text.txt_count_mancha = '0';
    text.txt_count_peca = '0';
    text.txt_count_cicatriz = '0';
    text.txt_count_otras = '0';
    chunks.Observaciones = [];
    chunks[DESCRIBA_FIELD_PREFIX] = [];
    return { text, checks, chunks };
  }

  text.txt_tipo_fototipo = evaluacion.fototipo ?? '';
  text.txt_fecha = evaluacion.fechaEvaluacion ?? '';

  // Lesion counts
  const lesiones = evaluacion.lesiones ?? [];
  text.txt_count_lunar = countByType(lesiones, 'L');
  text.txt_count_mancha = countByType(lesiones, 'M');
  text.txt_count_peca = countByType(lesiones, 'P');
  text.txt_count_cicatriz = countByType(lesiones, 'C');
  // No data source for "otras lesiones" — leave at 0.
  text.txt_count_otras = '0';

  // Observaciones
  chunks.Observaciones = evaluacion.observaciones
    ? chunkLongText(evaluacion.observaciones, OBSERVACIONES_BUDGET)
    : [];

  // Preguntas
  const preguntas = evaluacion.preguntas ?? null;

  if (preguntas) {
    // Preguntas 1-11 (PreguntaBase / PreguntaConFecha)
    for (let i = 0; i < PREGUNTA_KEYS.length; i++) {
      const key = PREGUNTA_KEYS[i];
      const pregunta = preguntas[key] as { respuesta: string | null; detalle?: string } | undefined;

      const num = i + 1;
      if (pregunta) {
        checks[`cbk_${num}_si`] = pregunta.respuesta === 'si';
        checks[`cbk_${num}_no`] = pregunta.respuesta === 'no';
        // Only preguntas 1, 2, 5, 6, 7, 9 have a detail field in the template.
        const detailFieldName = PREGUNTA_DETAIL_FIELD[num];
        if (detailFieldName) {
          text[detailFieldName] = pregunta.detalle ?? '';
        }
        // Pregunta 2 has a paired date field `txt_2-2_response` in the template.
        if (num === 2) {
          const fecha = (pregunta as { fecha?: string }).fecha;
          text['txt_2-2_response'] = fecha ?? '';
        }
      } else {
        checks[`cbk_${num}_si`] = false;
        checks[`cbk_${num}_no`] = false;
        const detailFieldName = PREGUNTA_DETAIL_FIELD[num];
        if (detailFieldName) {
          text[detailFieldName] = '';
        }
        if (num === 2) {
          text['txt_2-2_response'] = '';
        }
      }
    }

    // Describa en caso de tener alguna respuesta positiva
    chunks[DESCRIBA_FIELD_PREFIX] = preguntas.describaPositivo
      ? chunkLongText(preguntas.describaPositivo, DESCRIBA_BUDGET)
      : [];

    // Preguntas 12-13 (SiNo | null fields) — real template uses letter keys.
    checks['cbk_M-1_si'] = preguntas.lesionDermatopatia === 'si';
    checks['cbk_M-1_no'] = preguntas.lesionDermatopatia === 'no';
    checks['cbk_M-2_si'] = preguntas.evaluacionDermatologo === 'si';
    checks['cbk_M-2_no'] = preguntas.evaluacionDermatologo === 'no';
  } else {
    chunks[DESCRIBA_FIELD_PREFIX] = [];
  }

  return { text, checks, chunks };
}

function countByType(
  lesions: Array<{ type: string }>,
  target: string,
): string {
  return String(lesions.filter((l) => l.type === target).length);
}
