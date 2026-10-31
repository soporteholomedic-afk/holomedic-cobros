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
export const MEDIOS = ['llamada', 'correo', 'whatsapp'] as const;
export type Medio = (typeof MEDIOS)[number];

export const MEDIO_LABELS: Record<Medio, string> = {
  llamada: 'Llamada',
  correo: 'Correo',
  whatsapp: 'WhatsApp',
};

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
  nombre: string;
  /** Free text, but always holds exactly 9 digits. */
  telefono: string;
  correo: string | null;
}

/** A company to contact. `contactos[0]` is the principal contact. */
export interface Empresa {
  idEmpresa: string;
  razonSocial: string;
  /** Exactly 11 digits. Unique across empresas. */
  ruc: string;
  sector: string | null;
  /** At least one; the first one is the principal. */
  contactos: Contacto[];
  notas: string | null;
  etapa: Etapa;
  /** Only meaningful outside "Por contactar". */
  medio: Medio | null;
  /** Only present in "Perdido". */
  motivo: Motivo | null;
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
  ruc: string;
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
