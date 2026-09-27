import type { PlantillaCrmKey } from '../ports';

/**
 * Canonical persisted copy of the 5 CRM templates — the byte-equality
 * regression pin for `PLANTILLAS_CORREO` (tasks 3.1/3.2; spec
 * crm-email-sequencing). Copy source: the design mock (EMAIL_TEMPLATES
 * block, tracker commit 08892c2), verbatim EXCEPT the carta's folleto
 * sentence REMOVED (binding decision 3) and mock interpolations
 * normalized to tokens (subjects keep literal `[Empresa]`; HTML source
 * blank lines collapsed, words/tags unchanged). Edit HERE first
 * (mirroring the mock), then the module — the test fails otherwise.
 */
export interface PlantillaCanonica {
  asunto: string;
  cuerpo: string;
}

export const PLANTILLAS_CANONICAS: Record<PlantillaCrmKey, PlantillaCanonica> = {
  carta_presentacion: {
    asunto:
      'Presentación: Chequeos médicos y salud para los trabajadores de [Empresa]',
    cuerpo: `
<div class="space-y-3">
  <p>Hola <strong>{{contacto}}</strong>, un gusto saludarte.</p>
  <p>Te escribimos de parte de nuestra <strong>Clínica de Salud Ocupacional</strong>. Sabemos lo importante que es para <strong>{{empresa}}</strong> cuidar el bienestar de su equipo y tener al día todos los chequeos médicos que exige la ley de forma rápida y sin complicaciones.</p>
  <div class="p-3 bg-slate-50 border-l-4 border-teal-500 rounded-r-lg space-y-1.5 text-slate-800 text-xs">
    <p class="font-bold text-teal-800 uppercase">¿En qué podemos ayudarte?</p>
    <ul class="list-disc pl-4 space-y-1 text-slate-600">
      <li><strong>Exámenes médicos para trabajadores:</strong> De ingreso (cuando entra personal nuevo), chequeos anuales periódicos y de salida.</li>
      <li><strong>Exámenes especiales según el trabajo:</strong> Altura, manipulación de alimentos, ruido, polvo o esfuerzo físico.</li>
      <li><strong>Entrega súper rápida:</strong> Certificados médicos listos en 24 horas para que nadie detenga sus labores.</li>
      <li><strong>Campañas en sus propias oficinas o locales:</strong> Si tienen varios trabajadores, nuestro equipo médico puede ir directamente a su empresa.</li>
    </ul>
  </div>
  <p>Quedamos a tu disposición para coordinar una breve llamada de 5 minutos o enviarte una cotización sin ningún compromiso.</p>
  <p class="pt-2">Atentamente,<br>
  <strong>Equipo de Atención a Empresas</strong><br>
  Clínica de Salud Ocupacional</p>
</div>
`,
  },
  seguimiento_1: {
    asunto: 'Recordatorio: Exámenes médicos de salud para el personal de [Empresa]',
    cuerpo: `
<div class="space-y-3">
  <p>Hola <strong>{{contacto}}</strong>, ¿cómo estás?</p>
  <p>La semana pasada te escribimos para presentarte nuestros servicios de exámenes médicos para los colaboradores de <strong>{{empresa}}</strong>.</p>
  <p>Sabemos que en el día a día siempre hay muchas tareas pendientes; por eso queremos dejarte este recordatorio amistoso para ayudarte a mantener al día los exámenes médicos de tus colaboradores ({{trabajadores}} aprox.) y así estar totalmente tranquilos ante cualquier revisión laboral del ministerio.</p>
  <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
    <strong>Recuerda:</strong> Atendemos a tu personal de forma muy ágil para que no pierdan horas esperando y los resultados se entregan de inmediato.
  </div>
  <p>¿Te vendría bien que hablemos unos minutos por teléfono esta semana para ver qué exámenes necesitan renovar?</p>
  <p class="pt-2">Un saludo cordial,<br>
  <strong>Área de Atención a Empresas</strong></p>
</div>
`,
  },
  seguimiento_2: {
    asunto: 'Precios especiales en exámenes médicos para [Empresa]',
    cuerpo: `
<div class="space-y-3">
  <p>Hola <strong>{{contacto}}</strong>,</p>
  <p>Queríamos contarte que para empresas de <strong>{{sector}}</strong> contamos con <strong>precios especiales y paquetes con descuento</strong> según la cantidad de trabajadores.</p>
  <p>Nuestros paquetes para su equipo de aproximadamente {{trabajadores}} personas incluyen:</p>
  <ul class="list-disc pl-5 space-y-1 text-xs">
    <li>Chequeo médico general, vista y audición.</li>
    <li>Análisis de laboratorio completos.</li>
    <li>Radiografías y pruebas de pulmón con médicos especialistas.</li>
    <li>Informe final del estado de salud de toda la empresa sin costo extra.</li>
  </ul>
  <p>Si ya tienen una clínica o proveedor actual, permítenos enviarte una propuesta de comparación sin compromiso; seguro podemos darte mejor precio o una atención mucho más rápida.</p>
  <p class="pt-2">Atentamente,<br>
  <strong>Coordinación Comercial</strong></p>
</div>
`,
  },
  seguimiento_3: {
    asunto: '¿Podemos ayudarte con los chequeos de este mes en [Empresa]?',
    cuerpo: `
<div class="space-y-3">
  <p>Hola <strong>{{contacto}}</strong>,</p>
  <p>Te hemos escrito en las últimas semanas para ofrecerte nuestro apoyo con los exámenes médicos de <strong>{{empresa}}</strong>.</p>
  <p>Como no hemos tenido respuesta, entendemos que quizás en este momento ya tienen este tema cubierto o no están contratando personal nuevo.</p>
  <p>Para no saturar tu correo, <strong>dejaremos una pausa de contacto durante los próximos meses</strong>. De todos modos, guardamos tu contacto con mucho aprecio por si más adelante necesitan renovar exámenes o hacer ingresos rápidos.</p>
  <p>Cualquier consulta a futuro, solo responde a este correo y con todo gusto te atenderemos de inmediato.</p>
  <p class="pt-2">¡Muchos éxitos con todo tu equipo!<br>
  <strong>Clínica de Salud Ocupacional</strong></p>
</div>
`,
  },
  reactivacion_3m: {
    asunto:
      'Hola de nuevo de la Clínica Ocupacional: ¿Nuevos ingresos o renovaciones en [Empresa]?',
    cuerpo: `
<div class="space-y-3">
  <p>Hola <strong>{{contacto}}</strong>, qué gusto saludarte nuevamente.</p>
  <p>Hace tres meses conversamos brevemente respecto a los chequeos de salud ocupacional para <strong>{{empresa}}</strong>.</p>
  <p>Iniciando este nuevo trimestre, queríamos escribirte para saber cómo marcha todo con su equipo de trabajo y si tienen planificado:</p>
  <div class="p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-900 text-xs space-y-1">
    <p>✔ <strong>Renovación de chequeos anuales periódicos</strong> para el personal.</p>
    <p>✔ <strong>Exámenes médicos de ingreso</strong> para nuevas incorporaciones.</p>
    <p>✔ O si les gustaría conocer nuestras <strong>nuevas tarifas corporativas</strong> para empresas de {{sector}}.</p>
  </div>
  <p>Si deseas que te enviemos una cotización actualizada o revisar cómo podemos facilitarles las atenciones médicas este mes, solo respóndenos a este mensaje o avísanos para llamarte.</p>
  <p class="pt-2">Un saludo muy cordial,<br>
  <strong>Equipo de Coordinación y Chequeos Médicos</strong><br>
  Clínica de Salud Ocupacional</p>
</div>
`,
  },
};
