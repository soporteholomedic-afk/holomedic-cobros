/** Board columns, in display order. The stored value is the snake_case id. */
export const ETAPAS = ['por_contactar', 'contactado', 'en_seguimiento', 'cliente'] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABELS: Record<Etapa, string> = {
  por_contactar: 'Por contactar',
  contactado: 'Contactado',
  en_seguimiento: 'En seguimiento',
  cliente: 'Cliente',
};

export const SECTORES = [
  'Construcción',
  'Minería y Energía',
  'Fábrica y Producción',
  'Transporte y Almacén',
  'Comercio y Tiendas',
  'Oficinas y Servicios',
] as const;
export type Sector = (typeof SECTORES)[number];

/** A company to contact, with its principal contact (one row, one card). */
export interface Empresa {
  idEmpresa: string;
  razonSocial: string;
  /** Exactly 11 digits. Unique across empresas. */
  ruc: string;
  sector: Sector | null;
  contactoNombre: string;
  contactoTelefono: string;
  contactoCorreo: string | null;
  notas: string | null;
  etapa: Etapa;
  createdAt: string;
  updatedAt: string;
}

/** Raw form data as received from the API (not yet validated). */
export interface CrearEmpresaDatos {
  razonSocial: string;
  ruc: string;
  contactoNombre: string;
  contactoTelefono: string;
  sector?: string | null;
  contactoCorreo?: string | null;
  notas?: string | null;
}

/** Validated data ready to be stored (what the repository receives). */
export interface NuevaEmpresa {
  razonSocial: string;
  ruc: string;
  sector: Sector | null;
  contactoNombre: string;
  contactoTelefono: string;
  contactoCorreo: string | null;
  notas: string | null;
  etapa: Etapa;
}
