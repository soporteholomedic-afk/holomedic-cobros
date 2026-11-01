/** Board columns, in display order. The stored value is the snake_case id. */
export const ETAPAS = ['por_contactar', 'contactado', 'en_seguimiento', 'cliente', 'perdido'] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABELS: Record<Etapa, string> = {
  por_contactar: 'Por contactar',
  contactado: 'Contactado',
  en_seguimiento: 'En seguimiento',
  cliente: 'Cliente',
  perdido: 'Perdido',
};

/** How the empresa was contacted. */
export const MEDIOS = ['llamada', 'correo', 'whatsapp', 'otro'] as const;
export type Medio = (typeof MEDIOS)[number];

export const MEDIO_LABELS: Record<Medio, string> = {
  llamada: 'Llamada',
  correo: 'Correo',
  whatsapp: 'WhatsApp',
  otro: 'Otro',
};

/** Direction of a contact: we reached out, or they reached out to us. */
export const DIRECCIONES = ['saliente', 'entrante'] as const;
export type Direccion = (typeof DIRECCIONES)[number];

export const DIRECCION_LABELS: Record<Direccion, string> = {
  saliente: 'Nosotros contactamos',
  entrante: 'Nos contactaron',
};

/** Outcome of one contact. */
export const RESULTADOS = ['conversamos', 'no_contesto', 'deje_mensaje', 'pendiente', 'respondido'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export const RESULTADO_LABELS: Record<Resultado, string> = {
  conversamos: 'Conversamos',
  no_contesto: 'No contestó',
  deje_mensaje: 'Dejé mensaje',
  pendiente: 'Falta responder',
  respondido: 'Respondido',
};

/** Failed attempts in a row from which the system suggests moving the card to Perdido. */
export const UMBRAL_INTENTOS = 3;

/** Kinds of next action. */
export const ACCIONES = ['responder', 'llamar', 'cotizar', 'info', 'whatsapp', 'reunion', 'otro'] as const;
export type AccionTipo = (typeof ACCIONES)[number];

export const ACCION_LABELS: Record<AccionTipo, string> = {
  responder: 'Responder',
  llamar: 'Llamar',
  cotizar: 'Enviar cotización',
  info: 'Enviar información',
  whatsapp: 'Escribir por WhatsApp',
  reunion: 'Reunión o visita',
  otro: 'Otro',
};

/** How an inbound empresa says it knew us. */
export const ORIGENES = ['nose', 'referido', 'conocia', 'internet'] as const;
export type Origen = (typeof ORIGENES)[number];

export const ORIGEN_LABELS: Record<Origen, string> = {
  nose: 'No lo sé',
  referido: 'Referido por un cliente',
  conocia: 'Ya nos conocía',
  internet: 'Búsqueda en internet',
};

/** Most contacts one empresa can have. */
export const MAX_CONTACTOS = 10;

/** Why an empresa was lost (column "Perdido"). */
export const MOTIVO_CATEGORIAS = [
  'precio',
  'proveedor',
  'sin_interes',
  'no_contestan',
  'otro',
] as const;
export type MotivoCategoria = (typeof MOTIVO_CATEGORIAS)[number];

export const MOTIVO_LABELS: Record<MotivoCategoria, string> = {
  precio: 'Precio',
  proveedor: 'Ya tienen proveedor',
  sin_interes: 'Sin interés',
  no_contestan: 'No contestan',
  otro: 'Otro',
};

export interface MotivoCampo {
  /** Label of the form field. */
  label: string;
  /** Short label used to summarize the stored value ("Ofrecimos: S/ 7,000"). */
  resumen: string;
  requerido: boolean;
}

/** Detail fields each category asks for (detalle1, detalle2). */
export const MOTIVO_CAMPOS: Record<MotivoCategoria, { detalle1?: MotivoCampo; detalle2?: MotivoCampo }> = {
  precio: {
    detalle1: { label: 'Precio que les ofrecimos', resumen: 'Ofrecimos', requerido: true },
    detalle2: { label: 'Precio que esperaban o les ofrecieron', resumen: 'Esperaban', requerido: false },
  },
  proveedor: {
    detalle1: { label: '¿Qué proveedor tienen?', resumen: 'Proveedor', requerido: false },
    detalle2: { label: '¿Hasta cuándo tienen contrato?', resumen: 'Contrato hasta', requerido: false },
  },
  sin_interes: {},
  no_contestan: {},
  otro: {
    detalle1: { label: 'Cuéntanos el motivo', resumen: 'Detalle', requerido: true },
  },
};

/** Sectors every installation starts with; more can be created from the UI. */
export const SECTORES_INICIALES = [
  'Construcción',
  'Minería y Energía',
  'Fábrica y Producción',
  'Transporte y Almacén',
  'Comercio y Tiendas',
  'Oficinas y Servicios',
] as const;

export interface Motivo {
  categoria: MotivoCategoria;
  detalle1: string | null;
  detalle2: string | null;
  notas: string | null;
}

export interface Contacto {
  /** NULL for an inbound contact that gave no name. */
  nombre: string | null;
  /** Free text, 9 digits when given; NULL when only an email is known. */
  telefono: string | null;
  correo: string | null;
}

export interface ProximaAccion {
  tipo: AccionTipo;
  detalle: string | null;
  /** Calendar day, `YYYY-MM-DD`. */
  fecha: string;
}

/** One entry of the contact history of an empresa. */
export interface Interaccion {
  idInteraccion: number;
  idEmpresa: string;
  /** ISO timestamp. */
  fecha: string;
  idUsuario: string;
  /** Snapshot of the user name at registration time. */
  nombreUsuario: string;
  direccion: Direccion;
  medio: Medio;
  medioOtro: string | null;
  resultado: Resultado;
  resumen: string | null;
}

/** Validated interaction ready to be stored. */
export interface NuevaInteraccion {
  idUsuario: string;
  nombreUsuario: string;
  direccion: Direccion;
  medio: Medio;
  medioOtro: string | null;
  resultado: Resultado;
  resumen: string | null;
}

/** A company to contact. `contactos[0]` is the principal contact. */
export interface Empresa {
  idEmpresa: string;
  razonSocial: string;
  /** Exactly 11 digits, unique across empresas; NULL while unknown ("Falta RUC"). */
  ruc: string | null;
  sector: string | null;
  /** At least one; the first one is the principal. */
  contactos: Contacto[];
  notas: string | null;
  etapa: Etapa;
  /** Only meaningful outside "Por contactar". */
  medio: Medio | null;
  /** Free-text medium, only when `medio` is "otro". */
  medioOtro: string | null;
  /** Only present in "Perdido". */
  motivo: Motivo | null;
  /** Failed attempts in a row (reset by a real conversation). */
  intentosSinRespuesta: number;
  /** Since when an inbound contact waits for our reply; NULL when none does. */
  faltaResponderDesde: string | null;
  proximaAccion: ProximaAccion | null;
  origen: Origen | null;
  /** Attempt count at which "Seguir intentando" was pressed. */
  sugerenciaDescartadaEn: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Raw contact as received from the API (not yet validated). */
export interface ContactoDatos {
  nombre: string;
  telefono: string;
  correo?: string | null;
}

/** Raw form data as received from the API (not yet validated). */
export interface CrearEmpresaDatos {
  razonSocial: string;
  ruc: string;
  contactos: ContactoDatos[];
  sector?: string | null;
  notas?: string | null;
}

/** Same shape when editing: the contacts list replaces the stored one. */
export type EditarEmpresaDatos = CrearEmpresaDatos;

/** Raw loss reason as received from the API (not yet validated). */
export interface MotivoDatos {
  categoria: string;
  detalle1?: string | null;
  detalle2?: string | null;
  notas?: string | null;
}

/** Validated empresa data ready to be stored (what the repository receives). */
export interface DatosEmpresa {
  razonSocial: string;
  /** NULL for an empresa whose RUC is not known yet. */
  ruc: string | null;
  sector: string | null;
  contactos: Contacto[];
  notas: string | null;
}

export interface NuevaEmpresa extends DatosEmpresa {
  etapa: Etapa;
}

/** Validated follow-up state written in one step. */
export interface EstadoEmpresa {
  etapa: Etapa;
  medio: Medio | null;
  motivo: Motivo | null;
}

/** Follow-up state written together with an optional new interaction. */
export interface SeguimientoEmpresa extends EstadoEmpresa {
  medioOtro: string | null;
  intentosSinRespuesta: number;
  /** ISO timestamp or NULL. */
  faltaResponderDesde: string | null;
  proximaAccion: ProximaAccion | null;
  sugerenciaDescartadaEn: number | null;
}
