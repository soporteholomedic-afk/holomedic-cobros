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
  // ── Patient: Examen completo solicitado por el paciente ──
  {
    id: 'spitch-005',
    type: 'patient',
    name: 'Envío de examen médico completo',
    subject: 'Examen médico completo — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Buenos días, adjunto el examen médico completo realizado en nuestras instalaciones.</p>
  <p><strong>Archivos adjuntos:</strong></p>
  <ul>
    {{listaArchivos}}
  </ul>
  <p>Para cualquier consulta adicional, puede comunicarse con nosotros respondiendo a este correo.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Este mensaje contiene información confidencial. Si usted no es el destinatario, por favor elimínelo y notifique al remitente.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Interconsulta general ──
  {
    id: 'spitch-006',
    type: 'patient',
    name: 'Observado — Interconsulta general',
    subject: 'Resultado observado — Interconsulta — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>En su evaluación realizada el día de hoy ha salido <strong>OBSERVADO</strong>.</p>
  <p>Hacer llegar la hoja de interconsulta al paciente observado (ver adjuntos), quienes deberán de hacerlas llenar por los especialistas que se solicitan de manera particular. Una vez tenga las hojas de interconsulta llenas, las deberán de enviar por este medio de forma escaneada y legible para la revisión del caso (no se aceptan fotos).</p>
  <p>Se adjuntan exámenes auxiliares para verificación con el especialista correspondiente.</p>
  <p><strong>Archivos adjuntos:</strong></p>
  <ul>
    {{listaArchivos}}
  </ul>
  <p><strong>Importante:</strong></p>
  <ul>
    <li>Nuestro centro brinda el plazo máximo de <strong>6 meses</strong> para realizar el levantamiento de observación. Pasado dicho tiempo se procederá al cierre del examen médico como <strong>NO VÁLIDO</strong>.</li>
    <li>Verificar que la interconsulta contenga el <strong>sello y firma del médico</strong> para su impresión y posterior envío.</li>
    <li>Evitar modificar el formato de interconsulta, ya que este tiene un peso legal.</li>
  </ul>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Confidencial. Solo para el paciente destinatario.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Endocrinología ──
  {
    id: 'spitch-007',
    type: 'patient',
    name: 'Observado — Interconsulta Endocrinología',
    subject: 'Resultado observado — Endocrinología — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>En su evaluación realizada el día de hoy ha salido <strong>OBSERVADO</strong>.</p>
  <p>Adjunto interconsulta de <strong>ENDOCRINOLOGÍA</strong>, la cual deberá de hacerla llenar por un médico endocrinólogo de manera particular (en nuestro centro no lo realizamos). Una vez tenga la hoja de interconsulta llena, la deberá de enviar por este medio de forma escaneada para la revisión del caso.</p>
  <p>Adjunto también su resultado de laboratorio alterado para que le pueda mostrar al especialista y le sea de ayuda.</p>
  <p><strong>Archivos adjuntos:</strong></p>
  <ul>
    {{listaArchivos}}
  </ul>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Confidencial. Solo para el paciente destinatario.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Oftalmología (lentes correctores) ──
  {
    id: 'spitch-008',
    type: 'patient',
    name: 'Observado — Oftalmología (lentes correctores)',
    subject: 'Reevaluación oftalmológica — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>En su evaluación realizada el día de hoy ha salido <strong>OBSERVADO</strong>.</p>
  <p>Deberá de presentarse en nuestro centro con sus <strong>lentes correctores de lejos</strong> para ser reevaluado por nuestra área de oftalmología en el horario de <strong>lunes a sábado de 8:00 a.m. a 12:00 p.m.</strong> (presentar su DNI, la reevaluación no tiene costo).</p>
  <p>Adicionalmente se adjunta el examen auxiliar para la realización de los lentes.</p>
  <p>Si desea realizarlo de manera particular, deberá de adjuntar la boleta de compra de los lentes correctores donde especifique la agudeza visual corregida, y esta debe de contar con el <strong>sello del evaluador (oftalmólogo)</strong> donde sea visible.</p>
  <p><strong>Archivos adjuntos:</strong></p>
  <ul>
    {{listaArchivos}}
  </ul>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Audiometría ──
  {
    id: 'spitch-009',
    type: 'patient',
    name: 'Observado — Audiometría (lavado auditivo)',
    subject: 'Completar audiometría — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Deberá de presentarse en nuestro centro para completar su examen de <strong>audiometría</strong>, 24 horas después de haberse realizado su lavado auditivo, en el horario de <strong>lunes a sábado de 8:00 a.m. a 11:00 a.m.</strong> (presentar su DNI).</p>
  <p>Una vez completado el examen, se iniciará la auditoría de ficha médica.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Dosaje toxicológico cuantitativo ──
  {
    id: 'spitch-010',
    type: 'patient',
    name: 'Observado — Dosaje toxicológico (cuantitativo)',
    subject: 'Prueba cuantitativa de dosaje — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>La prueba cuantitativa de dosaje solicitada consiste en enviar su muestra de orina (la misma que dejó el día de su evaluación) a un laboratorio externo para cuantificar dicha muestra.</p>
  <p>Dicho proceso demora un promedio de <strong>48 horas hábiles</strong> para obtener el resultado. No es necesario que el paciente regrese.</p>
  <p>De acuerdo al resultado se indicará el proceso a seguir.</p>
  <p>El costo para la realización de la prueba cuantitativa es de <strong>S/ 59.00</strong> (incluido IGV), la cual se procesará una vez emitido el voucher de pago.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Prueba confirmatoria ──
  {
    id: 'spitch-011',
    type: 'patient',
    name: 'Observado — Prueba confirmatoria (cocaína/marihuana)',
    subject: 'Prueba confirmatoria de dosaje — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Deberá de realizar su <strong>prueba confirmatoria de dosaje</strong> en un laboratorio particular. Una vez tenga el resultado, deberá de enviarlo por este medio para la revisión del caso.</p>
  <p>De acuerdo al resultado se indicará el proceso a seguir.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Repetir dosaje 72h ──
  {
    id: 'spitch-012',
    type: 'patient',
    name: 'Observado — Repetir dosaje toxicológico (72h)',
    subject: 'Repetición de dosaje toxicológico — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Deberá de repetir su <strong>dosaje toxicológico en 72 horas</strong>. El costo por la repetición de dosaje es de <strong>S/ 25.00</strong>.</p>
  <p>El paciente se podrá acercar en el horario de <strong>lunes a viernes de 7:00 a.m. a 2:30 p.m.</strong> y <strong>sábados de 7:00 a.m. a 11:30 a.m.</strong></p>
  <p><strong>Importante:</strong> Pasado dicho tiempo no se aceptará la repetición de dosaje y se esperará el cierre de la ficha como <strong>NO VÁLIDO</strong>.</p>
  <p>De acuerdo al resultado se indicará si lleva interconsultas o no.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Repetir electrocardiograma ──
  {
    id: 'spitch-013',
    type: 'patient',
    name: 'Observado — Repetir electrocardiograma',
    subject: 'Repetición de electrocardiograma — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Deberá de presentarse en nuestro centro para <strong>repetir electrocardiograma</strong> (costo <strong>S/ 29.50</strong>), en el horario de <strong>lunes a sábado de 8:00 a.m. a 11:00 a.m.</strong> (presentar su DNI).</p>
  <p>De acuerdo al resultado se indicará si lleva interconsulta o no.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Repetir espirometría ──
  {
    id: 'spitch-014',
    type: 'patient',
    name: 'Observado — Repetir espirometría',
    subject: 'Repetición de espirometría — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>Deberá de presentarse en nuestro centro para <strong>repetir espirometría</strong> (costo <strong>S/ 59.00</strong>), en el horario de <strong>lunes a sábado de 8:00 a.m. a 11:00 a.m.</strong> (presentar su DNI).</p>
  <p>De acuerdo al resultado se indicará si lleva interconsulta o no.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Company: Operativos ──
  {
    id: 'spitch-015',
    type: 'company',
    name: 'Recepción de interconsulta tardía',
    subject: 'Re: Interconsultas recibidas — {{empresa}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) equipo de <strong>{{empresa}}</strong>,</p>
  <p>Recibido, conforme.</p>
  <p>Los resultados se estarán enviando en el transcurso del día.</p>
  <p>Saludos cordiales,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Company: Aviso de feriado ──
  {
    id: 'spitch-016',
    type: 'company',
    name: 'Aviso de feriado — horario restringido',
    subject: 'Aviso importante — Feriado — {{empresa}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) equipo de <strong>{{empresa}}</strong>,</p>
  <p>Se informa que el día <strong>{{fecha}}</strong> sólo se aceptarán levantamientos de observaciones hasta las <strong>12:00 p.m.</strong>. Después de ese horario, la revisión de interconsultas estará sujeta a disponibilidad o, caso contrario, serán revisadas el día <strong>siguiente hábil</strong>.</p>
  <p>Agradecemos su comprensión.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Company: Nota informativa (MINSUR / envío a paciente) ──
  {
    id: 'spitch-017',
    type: 'company',
    name: 'Nota: envío de resultados al paciente',
    subject: 'Envío de resultados — {{empresa}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) equipo de <strong>{{empresa}}</strong>,</p>
  <p>El examen médico completo será enviado al correo que proporcionó el paciente en nuestro centro.</p>
  <p><strong>Archivos adjuntos:</strong></p>
  <ul>
    {{listaArchivos}}
  </ul>
  <p>Para cualquier consulta, no dude en comunicarse con nosotros.</p>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #888;">Este mensaje es confidencial. Prohibida su difusión no autorizada.</p>
</body>
</html>`,
  },
  // ── Patient: Observado — Proyecto HV (receta médica) ──
  {
    id: 'spitch-018',
    type: 'patient',
    name: 'Observado — Proyecto HV (receta médica)',
    subject: 'Resultado observado — Documentación adicional — {{paciente}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) <strong>{{paciente}}</strong>,</p>
  <p>En su evaluación realizada ha salido <strong>OBSERVADO</strong>.</p>
  <p>Si el especialista le brinda una receta médica, deberá <strong>adjuntar la boleta de compra por 1 mes</strong>.</p>
  <p>Envíe la documentación por este medio de forma escaneada y legible para la revisión del caso.</p>
  <p><strong>Archivos adjuntos:</strong></p>
  <ul>
    {{listaArchivos}}
  </ul>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
  // ── Company: Referencia de especialistas ──
  {
    id: 'spitch-019',
    type: 'company',
    name: 'Referencia de especialistas para observados',
    subject: 'Especialistas de referencia — {{empresa}}',
    bodyHtml: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Estimado(a) equipo de <strong>{{empresa}}</strong>,</p>
  <p>Brindamos como referencia a los siguientes especialistas. En caso de estar interesados, pueden comunicarse a los números de cada uno para las coordinaciones del caso. <strong>Indicar que son pacientes de Holomedic.</strong></p>
  <ul>
    <li><strong>Endocrinología:</strong> Dr. Julio Valencia — 990 483 862</li>
    <li><strong>Medicina Interna:</strong> Dr. Fabrizio Díaz — 983 954 347</li>
    <li><strong>Nutrición:</strong> Lic. Bertha Medina — 969 752 879</li>
    <li><strong>Traumatología:</strong> Dr. — 973 843 774</li>
  </ul>
  <p>Atentamente,<br><strong>Departamento de Resultados</strong><br>Holomedic S.A.C.</p>
</body>
</html>`,
  },
];

export class MockSpitchRepo implements ISpitchRepository {
  async getByType(type: SpitchType): Promise<Spitch[]> {
    return MOCK_SPITCHES.filter((s) => s.type === type);
  }
}
