import type { Permiso } from './entities';

export interface RutaProtegida {
  path: string;
  permiso: Permiso;
  label: string;
}

export const RUTAS_PROTEGIDAS: RutaProtegida[] = [
  { path: '/cobranza',            permiso: 'cobranza',         label: 'Cobranza' },
  { path: '/api/cobranza/contactos', permiso: 'cobranza',      label: 'API Directorio de Contactos' },
  // REQ-02 (D1): both audit endpoints require the cobranza permiso.
  // `buscarRutaProtegida` matches longest-first `startsWith`, so the
  // historial prefix entry covers the `[ruc]` subpath. Breaking
  // change: unauthenticated/scripted callers of /api/send-email now
  // get 401 (single authenticated consumer verified; deploy note).
  { path: '/api/send-email',         permiso: 'cobranza',      label: 'API Envío de Correos' },
  { path: '/api/cobranza/historial', permiso: 'cobranza',      label: 'API Historial de Cobranza' },
  { path: '/consolidados',        permiso: 'consolidados',     label: 'Consolidados' },
  { path: '/api/consolidados/envios', permiso: 'consolidados',  label: 'API Historial de Envíos' },
  { path: '/valoraciones',        permiso: 'valoraciones',     label: 'Valoraciones' },
  { path: '/generador-pdfs',      permiso: 'generar_pdfs',     label: 'Generador de PDFs' },
  { path: '/areas/medicina/jjc',  permiso: 'jjc',              label: 'JJC (Dermatología)' },
  { path: '/areas/musculoesqueletica/jjc', permiso: 'jjc', label: 'JJC (Musculoesquelética)' },
  { path: '/api/areas/musculoesqueletica/jjc', permiso: 'jjc', label: 'API JJC (Musculoesquelética)' },
  { path: '/admin/plantillas',    permiso: 'plantillas',       label: 'Plantillas' },
  // editor-firmas (PR2 task 2.5): the self-service email signature has
  // its OWN permiso — every entry below is a LONGER prefix than
  // `/admin/plantillas`, so `buscarRutaProtegida`'s longest-first
  // `startsWith` match lets a firma_correo-only session reach the
  // signature surface without holding `plantillas` (threat TM3). The
  // canonical `/admin/plantillas/firma` (PR3 redirect page) gets its
  // own entry — otherwise it would inherit the generic plantillas gate.
  { path: '/admin/plantillas/consolidados/firma', permiso: 'firma_correo', label: 'Mi Firma (Consolidados)' },
  { path: '/admin/plantillas/cobranza/firma',     permiso: 'firma_correo', label: 'Mi Firma (Cobranza)' },
  { path: '/admin/plantillas/firma',              permiso: 'firma_correo', label: 'Mi Firma' },
  { path: '/api/plantillas/firma',                permiso: 'firma_correo', label: 'API Mi Firma' },
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
