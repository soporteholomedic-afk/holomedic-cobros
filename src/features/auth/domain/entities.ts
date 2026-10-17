export const PERMISOS = [
  'admin',
  'cobranza',
  'consolidados',
  'valoraciones',
  'envio_resultados',
  'plantillas',
  'firma_correo',
  'generar_pdfs',
  'informes',
  'pacientes',
  'jjc',
  // asistencia-rrhh (Fase 1): RRHH dashboard/fichas access. Only
  // `asistencia` carries protected routes in F1; `asistencia_admin`
  // is reserved for F2+ administration surfaces.
  'asistencia',
  'asistencia_admin',
  // crm (S1a/pr1): B2B occupational CRM. `crm` covers the CRM pages and
  // API (pipeline, detail, own surfaces); `crm_admin` additionally opens
  // the Excel import surface and administration. Same split precedent
  // as asistencia/asistencia_admin — no implication between them.
  'crm',
  'crm_admin',
  // agente-ia-crm (E1): dedicated gate for the conversations view
  // (/crm/conversaciones + /api/crm/conversaciones). Separate from
  // plain `crm` so conversation access can be granted or revoked on
  // its own — same additive pattern as crm_admin.
  'crm_conversaciones',
  // agente-ia-crm (E4·T8): dedicated gate for knowledge ingestion
  // (/admin/crm/conocimiento + /api/crm/conocimiento/ingestas).
  // Separate from `crm` so uploading to La Guía's knowledge base can
  // be granted on its own — same additive pattern as crm_conversaciones.
  'crm_conocimiento',
  // agente-ia-crm (E5·T4): dedicated gate for the agent configuration
  // tab (/admin/crm/configuracion + /api/crm/configuracion). Separate
  // from `crm` so the kill switch and audit trail are admin-grantable.
  'crm_configuracion',
] as const;

export type Permiso = (typeof PERMISOS)[number];

export interface Usuario {
  idUsuario: string;
  /** Login identifier (e.g. "jdoe") — what the user types to log in. */
  usuario: string;
  /** Display full name (e.g. "John Doe") — what the UI shows. */
  nombre: string;
  area: string;
  /** Optional email used by the sending modules' signatures. */
  correo: string | null;
  permisos: Permiso[];
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsuarioRow extends Usuario {
  contrasenaHash: string;
  firma: Buffer | null;
}

export interface LoginInput {
  usuario: string;
  contrasena: string;
}

export interface LoginResult {
  usuario: Omit<UsuarioRow, 'contrasenaHash'>;
  token: string;
}

export interface CreateUsuarioInput {
  usuario: string;
  nombre: string;
  area: string;
  correo?: string | null;
  permisos: Permiso[];
  contrasena: string;
}

export interface UpdateUsuarioInput {
  usuario?: string;
  nombre?: string;
  area?: string;
  correo?: string | null;
  permisos?: Permiso[];
  contrasena?: string;
  activo?: boolean;
}
