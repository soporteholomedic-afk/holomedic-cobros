/** Oportunidad (deal) stages, in board display order. The stored value is the snake_case id. */
export const ETAPAS_OPORTUNIDAD = [
  'por_contactar',
  'contactado',
  'en_seguimiento',
  'cotizado',
  'ganada',
  'perdida',
] as const;
export type EtapaOportunidad = (typeof ETAPAS_OPORTUNIDAD)[number];

export const ETAPA_OPORTUNIDAD_LABELS: Record<EtapaOportunidad, string> = {
  por_contactar: 'Por contactar',
  contactado: 'Contactado',
  en_seguimiento: 'En seguimiento',
  cotizado: 'Cotizado',
  ganada: 'Ganada',
  perdida: 'Perdida',
};

/** Stages still being negotiated; their próxima acción raises day alerts. */
export const ETAPAS_ABIERTAS: readonly EtapaOportunidad[] = ['contactado', 'en_seguimiento', 'cotizado'];

/** Terminal stages: the negotiation is over (won or lost) and has no próxima acción. */
export const ETAPAS_CERRADAS: readonly EtapaOportunidad[] = ['ganada', 'perdida'];

/** Commercial relationship of an empresa with Holomedic — never a board column. */
export const RELACIONES = ['prospecto', 'cliente'] as const;
export type Relacion = (typeof RELACIONES)[number];

export const RELACION_LABELS: Record<Relacion, string> = {
  prospecto: 'Prospecto',
  cliente: 'Cliente',
};

/** Months without a performed service after which a cliente shows "Sin actividad reciente". */
export const UMBRAL_MESES_INACTIVIDAD = 4;

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

/** Closed list of sector icon keys (stored in `CrmSector.icono`). */
export const ICONOS_SECTOR = [
  'edificio',
  'casco',
  'pico',
  'fabrica',
  'camion',
  'tienda',
  'maletin',
  'salud',
  'agro',
  'educacion',
  'tecnologia',
  'alimentos',
] as const;
export type IconoSector = (typeof ICONOS_SECTOR)[number];

export const ICONO_SECTOR_LABELS: Record<IconoSector, string> = {
  edificio: 'Edificio',
  casco: 'Casco de obra',
  pico: 'Pico',
  fabrica: 'Fábrica',
  camion: 'Camión',
  tienda: 'Tienda',
  maletin: 'Maletín',
  salud: 'Salud',
  agro: 'Agro',
  educacion: 'Educación',
  tecnologia: 'Tecnología',
  alimentos: 'Alimentos',
};

/** Icon of each initial sector, in the order of `SECTORES_INICIALES`. */
export const ICONOS_INICIALES: readonly IconoSector[] = ['casco', 'pico', 'fabrica', 'camion', 'tienda', 'maletin'];

/** A stored sector; `icono` is null for older sectors and those created without one. */
export interface Sector {
  nombre: string;
  icono: IconoSector | null;
}

export function esIconoSector(valor: unknown): valor is IconoSector {
  return typeof valor === 'string' && (ICONOS_SECTOR as readonly string[]).includes(valor);
}

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

/** One entry of the activity history of an empresa (its own, or of one of its oportunidades). */
export interface Interaccion {
  idInteraccion: number;
  idEmpresa: string;
  /** Oportunidad this activity belongs to; NULL when it is a general activity. */
  idOportunidad: string | null;
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
  /** Oportunidad the activity is linked to; NULL for a general activity. */
  idOportunidad: string | null;
}

/** A company Holomedic keeps a commercial relationship with. A permanent ficha,
 *  never a board card: the board shows oportunidades. */
export interface Empresa {
  idEmpresa: string;
  razonSocial: string;
  /** Exactly 11 digits, unique across empresas; NULL while unknown ("Falta RUC"). */
  ruc: string | null;
  sector: string | null;
  /** At least one; the first one is the principal. */
  contactos: Contacto[];
  notas: string | null;
  /** Fiscal address (e.g. from the SUNAT lookup); NULL when unknown. */
  direccion: string | null;
  /** Prospecto or cliente. Winning or losing an oportunidad never changes it. */
  relacion: Relacion;
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
  /** Optional fiscal address, at most 300 characters after trim. */
  direccion?: string | null;
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
  /** Fiscal address (NULL when unknown); at most 300 characters. */
  direccion: string | null;
}

export interface NuevaEmpresa extends DatosEmpresa {
  /** Prospecto or cliente. Set at creation; never derived from an oportunidad result. */
  relacion: Relacion;
}

// ---------------------------------------------------------------------------
// Oportunidad — one concrete deal with an empresa. One etapa at a time; its
// result never changes the empresa's relacion nor its other oportunidades.
// ---------------------------------------------------------------------------

/** Longest stored oportunidad name / service of interest. */
export const MAX_NOMBRE_OPORTUNIDAD = 120;
export const MAX_SERVICIO_OPORTUNIDAD = 120;
/** Upper bound for the estimated amount in soles. */
export const MONTO_MAXIMO = 99_999_999;

/** Validated oportunidad data ready to be stored (what the repository receives). */
export interface DatosOportunidad {
  nombre: string;
  /** Who manages the deal (usuario id + name snapshot); NULL when unassigned. */
  responsableId: string | null;
  responsableNombre: string | null;
  /** How they knew us; NULL for manual creates and imports. */
  origen: Origen | null;
  /** Service the empresa is interested in (free text). */
  servicio: string | null;
  montoEstimado: number | null;
}

/** Validated data for a new oportunidad, including its initial stage. */
export interface NuevaOportunidad extends DatosOportunidad {
  etapa: EtapaOportunidad;
  /** Medium of the first contact; only meaningful outside "Por contactar". */
  medio: Medio | null;
  medioOtro: string | null;
}

/** Stage, medium and loss reason written together. */
export interface EstadoOportunidad {
  etapa: EtapaOportunidad;
  medio: Medio | null;
  medioOtro: string | null;
  motivo: Motivo | null;
}

/** Follow-up state written together with an optional new interaction. */
export interface SeguimientoOportunidad extends EstadoOportunidad {
  intentosSinRespuesta: number;
  faltaResponderDesde: string | null;
  proximaAccion: ProximaAccion | null;
  sugerenciaDescartadaEn: number | null;
}

/** One commercial deal of an empresa. A board card. */
export interface Oportunidad {
  idOportunidad: string;
  idEmpresa: string;
  nombre: string;
  responsableId: string | null;
  /** Snapshot of the responsable name at assignment time. */
  responsableNombre: string | null;
  origen: Origen | null;
  servicio: string | null;
  montoEstimado: number | null;
  etapa: EtapaOportunidad;
  /** Only meaningful outside "Por contactar". */
  medio: Medio | null;
  /** Free-text medium, only when `medio` is "otro". */
  medioOtro: string | null;
  /** Only present in "Perdida". */
  motivo: Motivo | null;
  /** Failed attempts in a row (reset by a real conversation). */
  intentosSinRespuesta: number;
  /** Since when an inbound contact waits for our reply; NULL when none does. */
  faltaResponderDesde: string | null;
  proximaAccion: ProximaAccion | null;
  /** Attempt count at which "Seguir intentando" was pressed. */
  sugerenciaDescartadaEn: number | null;
  /** Created by the etapa→oportunidad data migration, not by a user. */
  migrada: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Platform configuration (agente-ia-crm E5·T2) — key/value rows the admin
// edits at runtime (agent guardrails, Kapso channel, memory). Secret rows
// hold an already-ENCRYPTED payload (cifradoSecretos); the audit trail never
// stores secret values, only the fact that they changed.
// ---------------------------------------------------------------------------

/** One CrmConfig row. `valor` is ciphertext when `esSecreto`. */
export interface EntradaConfigCrm {
  clave: string;
  valor: string;
  esSecreto: boolean;
  actualizadoPor: string;
  actualizadoEn: Date;
}

/** One CrmConfigAuditoria row. Values are null for secrets (never stored) and for absent old/new sides. */
export interface AuditoriaConfigCrm {
  id: number;
  clave: string;
  usuario: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  esSecreto: boolean;
  creadoEn: Date;
}

// ---------------------------------------------------------------------------
// SUNAT lookup (crm-consulta-sunat T4, S1) — empresa data as returned by
// apifacturacion.com AFTER runtime validation. The adapter maps the
// external snake_case JSON (razon_social, direccion, estado, condicion);
// unknown fields are ignored and unusable ones become null.
// ---------------------------------------------------------------------------

/** Empresa data from one SUNAT lookup (apifacturacion.com). */
export interface DatosSunat {
  razonSocial: string;
  /** Fiscal address; null when the service omits it or it is not text. */
  direccion: string | null;
  /** SUNAT state (e.g. "ACTIVO"); null when not text. */
  estado: string | null;
  /** SUNAT condition (e.g. "HABIDO"); null when not text. */
  condicion: string | null;
}
