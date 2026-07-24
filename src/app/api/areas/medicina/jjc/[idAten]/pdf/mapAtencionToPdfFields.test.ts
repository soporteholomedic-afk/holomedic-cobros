import { describe, it, expect } from 'vitest';
import type { AtencionDetalle, JjcEvaluacion } from '@/types/jjc';
import { mapAtencionToPdfFields } from './mapAtencionToPdfFields';

const fullAtencion: AtencionDetalle = {
  idAtencion: '01234567',
  dni: '40123456',
  paciente: 'Juan Pérez',
  sexo: 'M',
  fechaNac: '15/03/1990',
  edad: 36,
  fechaAtencion: '21/07/2026',
  empresa: 'TechCorp S.A.',
  tipoExamen: 'Pre-Ocupacional',
  puesto: 'Ingeniero',
  area: 'Producción',
};

describe('mapAtencionToPdfFields', () => {
  it('maps full atencion and evaluation data correctly', () => {
    const evaluacion: JjcEvaluacion = {
      idAtencion: '01234567',
      fechaEvaluacion: '2026-07-21',
      lugar: 'HOLOMEDIC',
      fototipo: 'III-IV',
      observaciones: 'Paciente presenta lesión en brazo izquierdo.',
      lesiones: [
        { id: 'p1', type: 'L', x: 0.3, y: 0.5 },
        { id: 'p2', type: 'L', x: 0.5, y: 0.3 },
        { id: 'p3', type: 'M', x: 0.7, y: 0.4 },
        { id: 'p4', type: 'P', x: 0.2, y: 0.6 },
      ],
      preguntas: {
        sufreEnfermedadesPiel: { respuesta: 'si', detalle: 'dermatitis atópica' },
        tieneLesionActual: { respuesta: 'no', detalle: '', fecha: '15/06/2026' },
        cambioColoracion: { respuesta: null, detalle: '' },
        lesionesRepiten: { respuesta: null, detalle: '' },
        enrojecimiento: { respuesta: null, detalle: '' },
        comezon: { respuesta: null, detalle: '' },
        hinchazon: { respuesta: null, detalle: '' },
        rinitisAsma: { respuesta: null, detalle: '' },
        usaEPP: { respuesta: null, detalle: '' },
        cambiosUnas: { respuesta: null, detalle: '' },
        tomaMedicacion: { respuesta: 'si', detalle: 'Losartán 50mg' },
        describaPositivo: 'Paciente refiere mejoría con el tratamiento actual.',
        lesionDermatopatia: null,
        evaluacionDermatologo: null,
      },
      createdBy: null,
    };

    const result = mapAtencionToPdfFields(fullAtencion, evaluacion);

    // Text fields from AtencionDetalle
    expect(result.text.txt_dni).toBe('40123456');
    expect(result.text.txt_nombre_completo).toBe('Juan Pérez');
    expect(result.text.txt_empresa).toBe('TechCorp S.A.');
    expect(result.text.txt_ocupacion).toBe('Ingeniero');
    expect(result.text.txt_area).toBe('Producción');
    expect(result.text.txt_fecha_examen).toBe('21/07/2026');
    expect(result.text.txt_lugar).toBe('HOLOMEDIC');

    // Fototipo
    expect(result.text.txt_tipo_fototipo).toBe('III-IV');

    // Checkboxes — sufreEnfermedadesPiel = si
    expect(result.checks.cbk_1_si).toBe(true);
    expect(result.checks.cbk_1_no).toBe(false);
    expect(result.text.txt_1_response).toBe('dermatitis atópica');

    // Checkboxes — tieneLesionActual = no
    expect(result.checks.cbk_2_si).toBe(false);
    expect(result.checks.cbk_2_no).toBe(true);
    // Pregunta 2's detail field uses a hyphen: `txt_2-1_response`.
    expect(result.text['txt_2-1_response']).toBe('');
    expect(result.text['txt_2-2_response']).toBe('15/06/2026');

    // Checkboxes — tomaMedicacion = si (no detail field in template)
    expect(result.checks.cbk_11_si).toBe(true);
    expect(result.checks.cbk_11_no).toBe(false);

    // Lesion counts
    expect(result.text.txt_count_lunar).toBe('2');
    expect(result.text.txt_count_mancha).toBe('1');
    expect(result.text.txt_count_peca).toBe('1');
    expect(result.text.txt_count_cicatriz).toBe('0');

    // Observaciones (short, fits in one chunk)
    expect(result.chunks.Observaciones).toEqual(['Paciente presenta lesión en brazo izquierdo.']);

    // Describa en caso de tener alguna respuesta positiva (short, fits in one chunk)
    expect(result.chunks['Describa en caso de tener alguna respuesta positiva']).toEqual([
      'Paciente refiere mejoría con el tratamiento actual.',
    ]);

    // Real template field coverage
    expect(result.text.txt_fecha).toBe('2026-07-21');
    expect(result.text.txt_count_otras).toBe('0');
  });

  it('handles null evaluation gracefully', () => {
    const result = mapAtencionToPdfFields(fullAtencion, null);

    // Atencion fields still map
    expect(result.text.txt_dni).toBe('40123456');
    expect(result.text.txt_lugar).toBe('HOLOMEDIC');

    // No evaluation-dependent fields
    expect(result.text.txt_tipo_fototipo).toBe('');
    expect(result.text.txt_count_lunar).toBe('0');
    expect(result.text.txt_count_mancha).toBe('0');
    expect(result.text.txt_count_peca).toBe('0');
    expect(result.text.txt_count_cicatriz).toBe('0');
    expect(result.chunks.Observaciones).toEqual([]);
    expect(result.chunks['Describa en caso de tener alguna respuesta positiva']).toEqual([]);
    expect(result.text.txt_fecha).toBe('');
    expect(result.text.txt_count_otras).toBe('0');
    expect(Object.keys(result.checks)).toHaveLength(0);
  });

  it('handles NULL atencion fields as empty strings', () => {
    const nullAtencion: AtencionDetalle = {
      ...fullAtencion,
      empresa: '',
      puesto: '',
      area: '',
    };

    const result = mapAtencionToPdfFields(nullAtencion, null);

    expect(result.text.txt_empresa).toBe('');
    expect(result.text.txt_ocupacion).toBe('');
    expect(result.text.txt_area).toBe('');
  });

  it('handles null preguntas in evaluation', () => {
    const evalNoPreguntas: JjcEvaluacion = {
      idAtencion: '01234567',
      fechaEvaluacion: '2026-07-21',
      lugar: 'HOLOMEDIC',
      fototipo: 'I-II',
      observaciones: 'Todo normal',
      lesiones: [],
      preguntas: null,
      createdBy: null,
    };

    const result = mapAtencionToPdfFields(fullAtencion, evalNoPreguntas);

    // Fototipo and observaciones still work
    expect(result.text.txt_tipo_fototipo).toBe('I-II');
    expect(result.chunks.Observaciones).toEqual(['Todo normal']);

    // No checkboxes set
    expect(Object.keys(result.checks)).toHaveLength(0);

    // Lesion counts all zero
    expect(result.text.txt_count_lunar).toBe('0');
    expect(result.text.txt_count_mancha).toBe('0');
    expect(result.text.txt_count_peca).toBe('0');
    expect(result.text.txt_count_cicatriz).toBe('0');
  });

  it('chunks long observaciones and describaPositivo', () => {
    const longObs = 'A. '.repeat(60); // 180 chars
    const longDesc = 'B. '.repeat(70); // 210 chars

    const evaluacion: JjcEvaluacion = {
      idAtencion: '01234567',
      fechaEvaluacion: '2026-07-21',
      lugar: 'HOLOMEDIC',
      fototipo: 'V-VI',
      observaciones: longObs,
      lesiones: [],
      preguntas: {
        sufreEnfermedadesPiel: { respuesta: null, detalle: '' },
        tieneLesionActual: { respuesta: null, detalle: '', fecha: '' },
        cambioColoracion: { respuesta: null, detalle: '' },
        lesionesRepiten: { respuesta: null, detalle: '' },
        enrojecimiento: { respuesta: null, detalle: '' },
        comezon: { respuesta: null, detalle: '' },
        hinchazon: { respuesta: null, detalle: '' },
        rinitisAsma: { respuesta: null, detalle: '' },
        usaEPP: { respuesta: null, detalle: '' },
        cambiosUnas: { respuesta: null, detalle: '' },
        tomaMedicacion: { respuesta: null, detalle: '' },
        describaPositivo: longDesc,
        lesionDermatopatia: null,
        evaluacionDermatologo: null,
      },
      createdBy: null,
    };

    const result = mapAtencionToPdfFields(fullAtencion, evaluacion);

    // Observaciones should be chunked (budget 160)
    expect(result.chunks.Observaciones.length).toBeGreaterThan(1);
    for (const chunk of result.chunks.Observaciones) {
      expect(chunk.length).toBeLessThanOrEqual(160);
    }

    // Describa en caso de tener alguna respuesta positiva should be chunked (budget 200)
    const describaKey = 'Describa en caso de tener alguna respuesta positiva';
    expect(result.chunks[describaKey].length).toBeGreaterThan(1);
    for (const chunk of result.chunks[describaKey]) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }

    // Content preserved (only word-boundary whitespace may differ at split points)
    const allObs = result.chunks.Observaciones.join('');
    const allDesc = result.chunks[describaKey].join('');
    // Non-whitespace characters should all be present
    expect(allObs.replace(/\s/g, '')).toBe(longObs.replace(/\s/g, ''));
    expect(allDesc.replace(/\s/g, '')).toBe(longDesc.replace(/\s/g, ''));
  });

  it('sets cbk_si=false and cbk_no=false for unanswered questions', () => {
    const evaluacion: JjcEvaluacion = {
      idAtencion: '01234567',
      fechaEvaluacion: '2026-07-21',
      lugar: 'HOLOMEDIC',
      fototipo: 'I-II',
      observaciones: '',
      lesiones: [],
      preguntas: {
        sufreEnfermedadesPiel: { respuesta: null, detalle: '' },
        tieneLesionActual: { respuesta: null, detalle: '', fecha: '' },
        cambioColoracion: { respuesta: null, detalle: '' },
        lesionesRepiten: { respuesta: null, detalle: '' },
        enrojecimiento: { respuesta: null, detalle: '' },
        comezon: { respuesta: null, detalle: '' },
        hinchazon: { respuesta: null, detalle: '' },
        rinitisAsma: { respuesta: null, detalle: '' },
        usaEPP: { respuesta: null, detalle: '' },
        cambiosUnas: { respuesta: null, detalle: '' },
        tomaMedicacion: { respuesta: null, detalle: '' },
        describaPositivo: '',
        lesionDermatopatia: null,
        evaluacionDermatologo: null,
      },
      createdBy: null,
    };

    const result = mapAtencionToPdfFields(fullAtencion, evaluacion);

    // Unanswered preguntas should have both cbk_si and cbk_no set to false
    expect(result.checks.cbk_1_si).toBe(false);
    expect(result.checks.cbk_1_no).toBe(false);
    expect(result.checks.cbk_2_si).toBe(false);
    expect(result.checks.cbk_2_no).toBe(false);

    // Detalle should be empty
    expect(result.text.txt_1_response).toBe('');
  });

  it('sets cbk_M-1 and cbk_M-2 from SiNo fields', () => {
    const evaluacion: JjcEvaluacion = {
      idAtencion: '01234567',
      fechaEvaluacion: '2026-07-21',
      lugar: 'HOLOMEDIC',
      fototipo: 'III-IV',
      observaciones: '',
      lesiones: [],
      preguntas: {
        sufreEnfermedadesPiel: { respuesta: null, detalle: '' },
        tieneLesionActual: { respuesta: null, detalle: '', fecha: '' },
        cambioColoracion: { respuesta: null, detalle: '' },
        lesionesRepiten: { respuesta: null, detalle: '' },
        enrojecimiento: { respuesta: null, detalle: '' },
        comezon: { respuesta: null, detalle: '' },
        hinchazon: { respuesta: null, detalle: '' },
        rinitisAsma: { respuesta: null, detalle: '' },
        usaEPP: { respuesta: null, detalle: '' },
        cambiosUnas: { respuesta: null, detalle: '' },
        tomaMedicacion: { respuesta: null, detalle: '' },
        describaPositivo: '',
        lesionDermatopatia: 'si',
        evaluacionDermatologo: 'no',
      },
      createdBy: null,
    };

    const result = mapAtencionToPdfFields(fullAtencion, evaluacion);

    expect(result.checks['cbk_M-1_si']).toBe(true);
    expect(result.checks['cbk_M-1_no']).toBe(false);
    expect(result.checks['cbk_M-2_si']).toBe(false);
    expect(result.checks['cbk_M-2_no']).toBe(true);
  });
});
