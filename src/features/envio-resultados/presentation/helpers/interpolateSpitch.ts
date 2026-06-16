/**
 * Replaces {{placeholders}} in spitch HTML with real data.
 *
 * Supported placeholders:
 *   {{empresa}}        → company name
 *   {{fecha}}          → today's date (es-PE format)
 *   {{fechaExamen}}    → today's date (es-PE format)
 *   {{paciente}}       → first patient's name (patient-target spitches)
 *   {{totalPacientes}} → count of selected patients
 *   {{totalExamenes}}  → total file count across all selected patients
 *   {{listaPacientes}} → <li> list of patient names
 *   {{listaArchivos}}  → <li> list of file names
 */

export interface InterpolateSpitchParams {
  html: string;
  subject: string;
  companyName: string;
  patientNames: string[];
  fileNames: string[];
}

export interface InterpolateSpitchResult {
  html: string;
  subject: string;
}

const TODAY = new Date().toLocaleDateString('es-PE', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function interpolateSpitch(params: InterpolateSpitchParams): InterpolateSpitchResult {
  const { html, subject, companyName, patientNames, fileNames } = params;

  const totalPacientes = patientNames.length;
  const totalExamenes = fileNames.length;
  const primerPaciente = patientNames[0] ?? '';

  const listaPacientes = patientNames
    .map((name) => `    <li>${escapeHtml(name)}</li>`)
    .join('\n');

  const listaArchivos = fileNames
    .map((name) => `    <li>${escapeHtml(name)}</li>`)
    .join('\n');

  const replacements: Record<string, string> = {
    '{{empresa}}': escapeHtml(companyName),
    '{{fecha}}': TODAY,
    '{{fechaExamen}}': TODAY,
    '{{paciente}}': escapeHtml(primerPaciente),
    '{{totalPacientes}}': String(totalPacientes),
    '{{totalExamenes}}': String(totalExamenes),
    '{{listaPacientes}}': listaPacientes,
    '{{listaArchivos}}': listaArchivos,
  };

  let resultHtml = html;
  let resultSubject = subject;

  for (const [placeholder, value] of Object.entries(replacements)) {
    resultHtml = resultHtml.replaceAll(placeholder, value);
    resultSubject = resultSubject.replaceAll(placeholder, value);
  }

  // Strip hardcoded color declarations so the rendered email inherits
  // the parent's theme-aware text color (works for both light and dark mode).
  // Without this, `<body style="color: #333">` cascades to every child and
  // becomes invisible on a dark background.
  resultHtml = resultHtml.replace(/color:\s*#[0-9a-fA-F]+;?/g, '');

  return { html: resultHtml, subject: resultSubject };
}

/** Minimal HTML-escaping for names that could contain <, >, &, ". */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
