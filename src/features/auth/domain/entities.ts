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
  nombre: string;
  area: string;
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
  nombre: string;
  area: string;
  permisos: Permiso[];
  contrasena: string;
}

export interface UpdateUsuarioInput {
  nombre?: string;
  area?: string;
  permisos?: Permiso[];
  contrasena?: string;
  activo?: boolean;
}
