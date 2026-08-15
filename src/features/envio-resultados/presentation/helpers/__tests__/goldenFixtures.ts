/**
 * Test fixtures + golden samples for the `interpolateSpitch` refactor (PR 4).
 *
 * The current `interpolateSpitch` implementation has a small, well-known
 * behavior surface. PR 4 must preserve EVERY existing case in the
 * non-empty path (behaviour-preserving) and add the new empty-block-
 * removal behavior. The golden samples here pin the exact current
 * output for several representative inputs so a regression in the
 * refactor would surface as a test failure.
 *
 * Spec scenarios pinned here:
 *  - "Non-empty path stays string-based"
 *  - "Injectable today fixes date bug" (multi-call with different `today`)
 *  - "Empty token removes containing block"
 *  - "Empty token in td keeps cell"
 *  - "firma resolves to signature HTML"
 *  - "Table token renders only selected columns"
 */
import type { InterpolationContext } from '../tokenResolvers/types';

/** A complete, realistic `InterpolationContext` for golden testing. */
export const GOLDEN_CTX: InterpolationContext = {
  companyName: 'Clínica Demo S.A.',
  patientNames: ['Juan Pérez', 'María Gómez'],
  fileNames: ['CAMO.pdf', 'EMO.pdf'],
  firma: '<p>Dr. Pérez — Clínica Demo S.A.</p>',
  destino: 'Proyecto Cardio — Centro Médico',
  patients: [
    {
      id: 'pat-1',
      companyId: 'comp-1',
      name: 'Juan Pérez',
      dni: '12345678',
      files: [
        { id: 'f-1', patientId: 'pat-1', name: 'CAMO.pdf', type: 'application/pdf', size: 1024 },
        { id: 'f-2', patientId: 'pat-1', name: 'EMO.pdf', type: 'application/pdf', size: 2048 },
      ],
    },
  ],
  files: [
    { id: 'f-1', patientId: 'pat-1', name: 'CAMO.pdf', type: 'application/pdf', size: 1024 },
    { id: 'f-2', patientId: 'pat-1', name: 'EMO.pdf', type: 'application/pdf', size: 2048 },
  ],
  area: 'consolidados',
  today: '15 de enero de 2026',
};

export const GOLDEN_CTX_TODAY_2: InterpolationContext = {
  ...GOLDEN_CTX,
  today: '20 de febrero de 2026',
};

/** The original spitch-001 (company, Resumen general) used for golden tests. */
export const GOLDEN_HTML_SPITCH_001 = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) equipo de {{empresa}},</p>
  <p>Adjuntamos el informe consolidado de resultados de los pacientes correspondientes al período indicado. Este documento incluye los análisis practicados conforme a las órdenes médicas registradas en nuestro sistema.</p>
  <p><strong>Resumen de pacientes incluidos:</strong></p>
  <ul>
    <li>Total de pacientes: {{totalPacientes}}</li>
    <li>Exámenes procesados: {{totalExamenes}}</li>
    <li>Fecha de generación: {{fecha}}</li>
  </ul>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`;

export const GOLDEN_SUBJECT_SPITCH_001 =
  'Informe consolidado de resultados — {{fecha}}';
