export const PERMISOS = [
  'admin',
  'cobranza',
  'consolidados',
  'valoraciones',
  'envio_resultados',
  'plantillas',
  'generar_pdfs',
  'informes',
  'pacientes',
  'jjc',
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
