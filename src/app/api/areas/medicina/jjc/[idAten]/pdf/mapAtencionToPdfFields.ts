import type { AtencionDetalle, JjcEvaluacion } from '@/types/jjc';
import { chunkLongText } from './chunkLongText';

/** Budget per Observaciones field (3 slots available). */
const OBSERVACIONES_BUDGET = 160;
/** Budget per Describa...positiva field (2 slots available). */
const DESCRIBA_BUDGET = 200;

export interface PdfFieldMap {
  /** Simple text fields: field name → string value. */
  text: Record<string, string>;
  /** Checkbox fields: field name → true (checked) / false (unchecked). */
  checks: Record<string, boolean>;
  /** Multi-slot text fields: field prefix → array of chunked values. */
  chunks: Record<string, string[]>;
}

// The first 11 keys of CuestionarioPiel that carry PreguntaBase/PreguntaConFecha.
// Ordered positions map to cbk_{1..11}_si/no and txt_{1..11}_response.
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
    text.txt_fototipo = '';
    text.txt_count_lunar = '0';
    text.txt_count_mancha = '0';
    text.txt_count_peca = '0';
    text.txt_count_cicatriz = '0';
    chunks.Observaciones = [];
    chunks.DescribaPositiva = [];
    return { text, checks, chunks };
  }

  text.txt_fototipo = evaluacion.fototipo ?? '';

  // Lesion counts
  const lesiones = evaluacion.lesiones ?? [];
  text.txt_count_lunar = countByType(lesiones, 'L');
  text.txt_count_mancha = countByType(lesiones, 'M');
  text.txt_count_peca = countByType(lesiones, 'P');
  text.txt_count_cicatriz = countByType(lesiones, 'C');

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
        text[`txt_${num}_response`] = pregunta.detalle ?? '';
      } else {
        checks[`cbk_${num}_si`] = false;
        checks[`cbk_${num}_no`] = false;
        text[`txt_${num}_response`] = '';
      }
    }

    // DescribaPositivo
    chunks.DescribaPositiva = preguntas.describaPositivo
      ? chunkLongText(preguntas.describaPositivo, DESCRIBA_BUDGET)
      : [];

    // Preguntas 12-13 (SiNo | null fields)
    checks.cbk_12_si = preguntas.lesionDermatopatia === 'si';
    checks.cbk_12_no = preguntas.lesionDermatopatia === 'no';
    checks.cbk_13_si = preguntas.evaluacionDermatologo === 'si';
    checks.cbk_13_no = preguntas.evaluacionDermatologo === 'no';
  } else {
    chunks.DescribaPositiva = [];
  }

  return { text, checks, chunks };
}

function countByType(
  lesions: Array<{ type: string }>,
  target: string,
): string {
  return String(lesions.filter((l) => l.type === target).length);
}
