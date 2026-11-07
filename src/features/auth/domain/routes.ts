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
  // REQ-03: the whole /api/valoraciones surface (sigla, lookups, pdf,
  // excel, send) requires the valoraciones permiso. Longest-first
  // startsWith matching also closes the previously-public /generate
  // CSV route as a side effect (no scripted consumers verified).
  { path: '/api/valoraciones',    permiso: 'valoraciones',     label: 'API Valoraciones' },
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
  // configuracion-tabs: the /configuracion section groups the user-
  // management, areas and own-signature surfaces behind per-tab entries.
  // Each tab keeps EXACTLY ONE permiso (proxy contract): `admin` for the
  // usuarios/areas tabs, `firma_correo` for the firma tab — reused from
  // the existing registry, NO new PERMISOS entry. The prefixes are
  // independent of `/admin/...`, so longest-first startsWith matching
  // never leaks these gates onto legacy routes (and vice versa). The
  // bare `/configuracion` redirect page is deliberately UNREGISTERED:
  // it is public and renders no content, only a session-aware redirect
  // to the first allowed tab.
  { path: '/configuracion/usuarios', permiso: 'admin',         label: 'Usuarios (Configuración)' },
  { path: '/configuracion/areas',    permiso: 'admin',         label: 'Áreas (Configuración)' },
  { path: '/configuracion/firma',    permiso: 'firma_correo',  label: 'Mi Firma (Configuración)' },
  // asistencia-rrhh (Fase 1): session-gated RRHH surface (ADR-6). The
  // device namespace `/api/asistencia/*` is deliberately NOT registered —
  // devices authenticate with their own Bearer token inside the route
  // (REQ-F1-14); the routes.asistencia.test.ts guard pins that exclusion.
  { path: '/asistencia',          permiso: 'asistencia',       label: 'Asistencia' },
  { path: '/api/asistencia-rrhh', permiso: 'asistencia',       label: 'API Asistencia RRHH' },
  // crm: the plain-`crm` entries cover every CRM page (including the
  // Excel import view /crm/importar) and the whole /api/crm prefix
  // (including /api/crm/importar). Anyone who can use the CRM can import.
  // crm-consulta-sunat (T2, S2/S5): the apifacturacion (SUNAT lookup)
  // token + URL are administered at /admin/crm/configuracion and its API
  // at /api/crm/configuracion with the DEDICATED crm_configuracion
  // permiso — NOT the plain-crm gate. Both entries are LONGER prefixes
  // than the generic admin/crm gates, so longest-first startsWith
  // matching resolves to them first.
  { path: '/admin/crm/configuracion', permiso: 'crm_configuracion', label: 'Configuración' },
  { path: '/api/crm/configuracion',   permiso: 'crm_configuracion', label: 'Configuración' },
  { path: '/api/crm',             permiso: 'crm',              label: 'API CRM' },
  { path: '/crm',                 permiso: 'crm',              label: 'CRM' },
];

export function buscarRutaProtegida(pathname: string): RutaProtegida | null {
  const sorted = [...RUTAS_PROTEGIDAS].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((r) => pathname.startsWith(r.path)) ?? null;
}

/**
 * Session-only routes (login-at-entry): navigating here requires a valid
 * session cookie but NO specific permiso — any authenticated user passes.
 * Checked by the proxy ONLY when no `RUTAS_PROTEGIDAS` entry matched, so
 * longer permiso gates (e.g. `/areas/medicina/jjc` → `jjc`) always win.
 *
 * `exact: true` is load-bearing for `/`: a prefix match would catch every
 * path and silently flip the proxy to deny-by-default, breaking the
 * deliberately unregistered device API (`/api/asistencia/*` authenticates
 * with its own Bearer token inside the route).
 */
export interface RutaSoloSesion {
  path: string;
  label: string;
  exact: boolean;
}

export const RUTAS_SOLO_SESION: RutaSoloSesion[] = [
  { path: '/',      label: 'Inicio', exact: true },
  { path: '/areas', label: 'Áreas',  exact: false },
];

export function buscarRutaSoloSesion(pathname: string): RutaSoloSesion | null {
  return (
    RUTAS_SOLO_SESION.find((r) =>
      r.exact ? pathname === r.path : pathname.startsWith(r.path),
    ) ?? null
  );
}

export function permisoParaRuta(pathname: string): Permiso | null {
  return buscarRutaProtegida(pathname)?.permiso ?? null;
}
