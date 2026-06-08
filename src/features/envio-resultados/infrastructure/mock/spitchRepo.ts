import type { ISpitchRepository } from '../../domain/ports';
import type { Spitch, SpitchType } from '../../domain/entities';

const MOCK_SPITCHES: Spitch[] = [
  // 2 company-target spitches: formal results summary
  {
    id: 'spitch-001',
    type: 'company',
    name: 'Resumen general de resultados',
    subject: 'Informe consolidado de resultados — {{fecha}}',
    bodyHtml: `<!DOCTYPE html>
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
  <p>Para cualquier consulta o aclaración, no dude en comunicarse con nuestro departamento de resultados al correo <a href="mailto:resultados@holomedic.pe">resultados@holomedic.pe</a>.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Este mensaje es confidencial y está dirigido únicamente al destinatario. Si lo ha recibido por error, por favor notifíquelo y elimínelo.</p>
</body>
</html>`,
  },
  {
    id: 'spitch-002',
    type: 'company',
    name: 'Resultados por paciente — detallado',
    subject: 'Resultados detallados por paciente — {{fecha}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) equipo de {{empresa}},</p>
  <p>Hacemos llegar los resultados detallados de cada paciente evaluado. Cada archivo adjunto corresponde al informe individual de cada paciente, incluyendo los resultados de los exámenes realizados y las observaciones pertinentes.</p>
  <p>Se adjuntan los siguientes informes:</p>
  <ul>
    {{listaPacientes}}
  </ul>
  <p>Rogamos verificar que todos los pacientes listados correspondan a su registro. Ante cualquier discrepancia, agradeceremos nos lo informen a la brevedad.</p>
  <p>Saludos cordiales,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Este mensaje es confidencial. Prohibida su difusión no autorizada.</p>
</body>
</html>`,
  },
  // 2 patient-target spitches: personalized results notification
  {
    id: 'spitch-003',
    type: 'patient',
    name: 'Notificación personal de resultados',
    subject: 'Resultados de sus exámenes — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Reciba un cordial saludo. Adjuntamos los resultados de sus exámenes realizados en {{empresa}}.</p>
  <p>Le recomendamos:</p>
  <ul>
    <li>Descargar y guardar los archivos PDF adjuntos para su referencia.</li>
    <li>Compartir estos resultados con su médico tratante para la interpretación clínica correspondiente.</li>
    <li>Si tiene alguna duda sobre los resultados, por favor contacte a su médico de cabecera.</li>
  </ul>
  <p>Para consultas sobre este informe, puede escribirnos a <a href="mailto:resultados@holomedic.pe">resultados@holomedic.pe</a> indicando su nombre completo y DNI.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Este mensaje contiene información confidencial. Si usted no es el destinatario, por favor elimínelo y notifique al remitente.</p>
</body>
</html>`,
  },
  {
    id: 'spitch-004',
    type: 'patient',
    name: 'Resultados con indicaciones médicas',
    subject: 'Informe de resultados — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Por medio del presente, le hacemos llegar los resultados de sus exámenes de laboratorio/imágenes realizados el {{fechaExamen}}.</p>
  <p><strong>Archivos incluidos:</strong></p>
  <ul>
    {{listaArchivos}}
  </ul>
  <p><strong>Importante:</strong> Estos resultados tienen carácter informativo. La interpretación y el diagnóstico correspondiente deben ser realizados por su médico tratante. No automedicarse basándose en estos resultados.</p>
  <p>Si requiere una copia impresa, puede solicitarla en nuestras oficinas presentando su DNI.</p>
  <p>Reciba nuestros saludos,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Confidencial. Solo para el paciente destinatario.</p>
</body>
</html>`,
  },
];

export class MockSpitchRepo implements ISpitchRepository {
  async getByType(type: SpitchType): Promise<Spitch[]> {
    return MOCK_SPITCHES.filter((s) => s.type === type);
  }
}
