import type { Permiso } from './entities';

export interface RutaProtegida {
  path: string;
  permiso: Permiso;
  label: string;
}

export const RUTAS_PROTEGIDAS: RutaProtegida[] = [
  { path: '/cobranza',            permiso: 'cobranza',         label: 'Cobranza' },
  { path: '/consolidados',        permiso: 'consolidados',     label: 'Consolidados' },
  { path: '/valoraciones',        permiso: 'valoraciones',     label: 'Valoraciones' },
  { path: '/generador-pdfs',      permiso: 'generar_pdfs',     label: 'Generador de PDFs' },
  { path: '/areas/medicina/jjc',  permiso: 'jjc',              label: 'JJC (Dermatología)' },
  { path: '/admin/plantillas',    permiso: 'plantillas',       label: 'Plantillas' },
  { path: '/admin/usuarios',      permiso: 'admin',            label: 'Gestión de Usuarios' },
  { path: '/api/usuarios',        permiso: 'admin',            label: 'API Usuarios' },
];

export function buscarRutaProtegida(pathname: string): RutaProtegida | null {
  const sorted = [...RUTAS_PROTEGIDAS].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((r) => pathname.startsWith(r.path)) ?? null;
}

export function permisoParaRuta(pathname: string): Permiso | null {
  return buscarRutaProtegida(pathname)?.permiso ?? null;
}
