import type { EntradaGenerarRespuesta } from '../../../domain/entities';

/**
 * GOLDEN SET — corpus de casos Holomedic (agente-ia-crm E4·T2): la
 * vara de regresión para cada iteración del prompt de generación.
 * Cada caso es una pregunta REALISTA de cliente de salud ocupacional
 * (contenido de producto en español, tono WhatsApp) con su entrada
 * EXACTA tal como el motor se la pasa al puerto de generación
 * (`EntradaGenerarRespuesta`, la entrada de
 * GeneradorRespuestaPort.generarRespuesta) y una expectativa que el
 * evaluador determinista puntúa sobre la respuesta:
 * - terminosClave: términos que una respuesta correcta DEBE contener
 *   cuando tipo=cita_kb/sigue_indicacion — tomados SIEMPRE de las
 *   propias fuentes del caso (el fragmento KB que el prompt recibió,
 *   la indicación del operador), jamás inventados.
 * - terminosProhibidos: marcadores de dato inventado/compromiso
 *   (precios, promesas de guardado de datos sensibles, opinión) que
 *   NO deben aparecer cuando tipo=escala_sin_dato.
 *
 * Los fragmentos de conocimiento y memorias son FIXTURES
 * autocontenidos del caso (escritos a mano con hechos típicos del
 * servicio Holomedic): el golden set NO lee la base ni la KB real.
 *
 * PROMPT_GOLDEN_VERSION etiqueta el corpus: subirla junto con
 * PROMPT_VERSION en cada iteración de prompt que cambie expectativas.
 * Regla de oro (docs/modules/crm-conversaciones-agente.md): si un
 * caso falla, se corrige el PROMPT; si la expectativa del caso cambió
 * legítimamente, se edita el CASO con bump de versión — nunca el
 * generador simulado.
 */

/** Versión del corpus golden (bump junto con el prompt que mide). */
export const PROMPT_GOLDEN_VERSION = 'v2';

/** Qué debe lograr la respuesta de un caso golden. */
export type TipoExpectativaGolden =
  | 'cita_kb'
  | 'escala_sin_dato'
  | 'sigue_indicacion'
  | 'presentacion_contacto_nuevo'
  | 'cortesia';

/** Expectativa del caso, consumida por evaluarRespuestaGolden. */
export interface ExpectativaGolden {
  tipo: TipoExpectativaGolden;
  /** Términos OBLIGATORIOS en la respuesta (cita_kb / sigue_indicacion). */
  terminosClave?: string[];
  /** Marcadores de dato inventado/compromiso PROHIBIDOS (escala_sin_dato). */
  terminosProhibidos?: string[];
}

/** Un caso golden: entrada real del puerto + expectativa medible. */
export interface CasoGolden {
  /** Id estable (clave de regresión en la tabla resumenGolden). */
  id: string;
  nombre: string;
  /** La MISMA forma que el motor le pasa a GeneradorRespuestaPort. */
  entrada: EntradaGenerarRespuesta;
  expectativa: ExpectativaGolden;
}

/**
 * Los 13 casos (E4·T2). Cobertura: hit de KB simple, hit con memoria
 * que refuerza, miss de KB (precio), indicación activa ×2, contacto
 * nuevo, cortesía, pedido de datos sensibles, mixto memoria+KB,
 * small talk fuera de scope y variantes de servicios reales
 * (vigilancia de alimentos, audiometría por ruido, toxicológico).
 */
export const CASOS_GOLDEN: CasoGolden[] = [
  {
    id: 'kb_examen_toxico_periodico',
    nombre: 'Hit de KB: qué necesita un examen periódico con toxicológico',
    entrada: {
      consulta: 'Buenas, ¿qué necesita un trabajador para su examen periódico con test toxicológico?',
      contactoNuevo: false,
      historial: [
        { emisor: 'CLIENTE', texto: 'Hola, quería consultar por los chequeos anuales de mi personal' },
      ],
      conocimiento: [
        {
          id: 101,
          titulo: 'Examen periódico con toxicológico',
          contenido:
            'El examen periódico con test toxicológico incluye muestra de orina en nuestro centro, signos vitales y examen médico; el certificado para la empresa queda listo en 24 horas.',
        },
      ],
      memorias: [],
    },
    expectativa: {
      tipo: 'cita_kb',
      terminosClave: ['orina', '24 horas', 'certificado'],
    },
  },
  {
    id: 'kb_audiometria_memoria_refuerzo',
    nombre: 'Hit de KB con memoria que refuerza el acuerdo previo del taller',
    entrada: {
      consulta: 'Retomando lo del taller, ¿qué implica la audiometría para mis operarios?',
      contactoNuevo: false,
      historial: [
        { emisor: 'CLIENTE', texto: 'La semana pasada hablamos de hacerles los estudios a los chicos del taller' },
      ],
      conocimiento: [
        {
          id: 102,
          titulo: 'Audiometría ocupacional',
          contenido:
            'La audiometría ocupacional mide la audición del trabajador con auriculares en cabina silenciosa, dura unos 15 minutos y no requiere ayuno ni preparación previa.',
        },
      ],
      memorias: [
        {
          tipo: 'acuerdo',
          titulo: 'Audiometrías taller mecánico',
          contenido:
            'El cliente acordó traer a sus 6 operarios del taller para las audiometrías a comienzos del próximo mes.',
        },
      ],
    },
    expectativa: {
      tipo: 'cita_kb',
      terminosClave: ['auriculares', '15 minutos', 'ayuno'],
    },
  },
  {
    id: 'miss_precio_toxicologico',
    nombre: 'Miss de KB: precio de un estudio que la base no cubre',
    entrada: {
      consulta:
        '¿Y cuánto sale el examen toxicológico? Necesito el precio por persona para aprobarlo internamente.',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
    },
    expectativa: {
      tipo: 'escala_sin_dato',
      terminosProhibidos: ['$', 'USD', 'Gs.', 'guaraníes'],
    },
  },
  {
    id: 'indicacion_confirma_campana_viernes',
    nombre: 'Indicación activa: el operador confirma la campaña del viernes 15',
    entrada: {
      consulta: '¿Me confirmás lo de la campaña en planta?',
      contactoNuevo: false,
      historial: [
        { emisor: 'CLIENTE', texto: '¿Ya quedó confirmada la visita a la planta?' },
      ],
      conocimiento: [],
      memorias: [],
      indicacionHumana:
        'Confirmale a Marta que la campaña de exámenes en su planta va el viernes 15 a las 8:00, que el personal no necesita ayuno y que nuestro equipo médico llega con todo el material.',
    },
    expectativa: {
      tipo: 'sigue_indicacion',
      terminosClave: ['viernes 15', '8:00', 'ayuno'],
    },
  },
  {
    id: 'indicacion_cotizacion_con_coordinador',
    nombre: 'Indicación activa: el operador autoriza la campaña básica de oficina',
    entrada: {
      consulta: '¿Y para una campaña básica de chequeos en nuestra oficina, qué me podés decir?',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
      indicacionHumana:
        'Decile que sí, que podemos hacer la campaña de glucemias y control de tensión arterial en su oficina, y que Ricardo, nuestro coordinador, lo llama hoy para cerrar día y hora.',
    },
    expectativa: {
      tipo: 'sigue_indicacion',
      terminosClave: ['glucemias', 'tensión arterial', 'Ricardo'],
    },
  },
  {
    id: 'contacto_nuevo_presentacion',
    nombre: 'Contacto nuevo: presentación inicial de La Guía y Holomedic',
    entrada: {
      consulta: 'Hola, ¿este es el WhatsApp de Holomedic? Me interesa lo de los exámenes para empresa.',
      contactoNuevo: true,
      historial: [],
      conocimiento: [],
      memorias: [],
    },
    expectativa: {
      tipo: 'presentacion_contacto_nuevo',
    },
  },
  {
    id: 'cortesia_agradecimiento',
    nombre: 'Cortesía: agradecimiento que se responde, no se escala',
    entrada: {
      consulta: '¡Muchas gracias por la rapidez, excelente atención!',
      contactoNuevo: false,
      historial: [
        { emisor: 'IA', texto: 'Los certificados están listos en 24 horas para que no detengan sus labores.' },
      ],
      conocimiento: [
        {
          id: 103,
          titulo: 'Certificados médicos en 24 horas',
          contenido:
            'En Holomedic los certificados médicos están listos en 24 horas, para que el personal no detenga sus labores esperando los documentos.',
        },
      ],
      memorias: [],
    },
    expectativa: {
      tipo: 'cortesia',
    },
  },
  {
    id: 'sensible_resultados_no_guarda',
    nombre: 'Datos sensibles: pedido de guardado de resultados médicos que no se compromete',
    entrada: {
      consulta: 'Guardame los resultados médicos de todo mi personal en tu sistema, así quedan archivados.',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
    },
    expectativa: {
      tipo: 'escala_sin_dato',
      terminosProhibidos: ['te los guardo', 'los registro', 'quedo guardando'],
    },
  },
  {
    id: 'mixto_visita_viernes_campana',
    nombre: 'Mixto: memoria del viernes aceptado + hit de KB sobre campañas en oficina',
    entrada: {
      consulta: 'Entonces, ¿la campaña la pueden hacer en nuestra propia oficina de Villa Elisa?',
      contactoNuevo: false,
      historial: [
        { emisor: 'CLIENTE', texto: 'El viernes que viene les puede ir a hacer los estudios, entonces' },
      ],
      conocimiento: [
        {
          id: 104,
          titulo: 'Campañas médicas en las oficinas del cliente',
          contenido:
            'Nuestro equipo médico puede realizar las campañas de exámenes directamente en las oficinas o locales de la empresa, sin que el personal deba trasladarse.',
        },
      ],
      memorias: [
        {
          tipo: 'acuerdo',
          titulo: 'Visita del viernes',
          contenido: 'El cliente aceptó la visita del viernes para la campaña de exámenes en su planta.',
        },
      ],
    },
    expectativa: {
      tipo: 'cita_kb',
      terminosClave: ['oficinas', 'campañas', 'sin que el personal deba trasladarse'],
    },
  },
  {
    id: 'smalltalk_politica_fuera_scope',
    nombre: 'Small talk fuera de scope: opinión política que se deriva',
    entrada: {
      consulta: 'Pero decime una cosa, ¿vos qué opinás de los resultados de las elecciones?',
      contactoNuevo: false,
      historial: [],
      conocimiento: [],
      memorias: [],
    },
    expectativa: {
      tipo: 'escala_sin_dato',
      terminosProhibidos: ['mi opinión', 'opino que', 'yo voto', 'mi candidato'],
    },
  },
  {
    id: 'kb_vigilancia_alimentos',
    nombre: 'Hit de KB: chequeo para manipuladores de alimentos',
    entrada: {
      consulta: 'Para el personal de cocina, ¿qué incluye el chequeo de manipulación de alimentos?',
      contactoNuevo: false,
      historial: [],
      conocimiento: [
        {
          id: 105,
          titulo: 'Chequeo para manipuladores de alimentos',
          contenido:
            'El chequeo para manipuladores de alimentos incluye el examen médico ocupacional, coprocultivo y serología, y al finalizar el trabajador recibe su carné de manipulador al día.',
        },
      ],
      memorias: [],
    },
    expectativa: {
      tipo: 'cita_kb',
      terminosClave: ['coprocultivo', 'carné de manipulador'],
    },
  },
  {
    id: 'kb_audiometria_ruido',
    nombre: 'Hit de KB: audiometría para puestos con exposición a ruido',
    entrada: {
      consulta: 'Nos piden control audiométrico para el sector de prensas, ¿qué conlleva el estudio?',
      contactoNuevo: false,
      historial: [],
      conocimiento: [
        {
          id: 106,
          titulo: 'Audiometría para exposición a ruido',
          contenido:
            'Para puestos con exposición a ruido, la audiometría ocupacional requiere un reposo acústico de 14 horas previas al estudio y se realiza con audiometría tonal en cabina.',
        },
      ],
      memorias: [],
    },
    expectativa: {
      tipo: 'cita_kb',
      terminosClave: ['reposo acústico', '14 horas'],
    },
  },
  {
    id: 'kb_toxicologico_chofer',
    nombre: 'Hit de KB: panel toxicológico para conductores',
    entrada: {
      consulta: 'Para el chofer nuevo, ¿qué sustancias detecta el toxicológico y cuándo llega el resultado?',
      contactoNuevo: false,
      historial: [],
      conocimiento: [
        {
          id: 107,
          titulo: 'Panel toxicológico para conductores',
          contenido:
            'El panel toxicológico para conductores detecta consumo de marihuana, cocaína y anfetaminas; la muestra se toma en el centro con cadena de custodia y el informe llega a la empresa en 24 horas.',
        },
      ],
      memorias: [],
    },
    expectativa: {
      tipo: 'cita_kb',
      terminosClave: ['cadena de custodia', '24 horas'],
    },
  },
];
