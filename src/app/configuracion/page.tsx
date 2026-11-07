import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';

/**
 * Bare `/configuracion` entry (feature `configuracion-tabs`) — a
 * session-aware PURE redirect; it renders no content.
 *
 * Deliberately UNREGISTERED in RUTAS_PROTEGIDAS (the proxy leaves it
 * public): the tabs need DIFFERENT permisos (`admin` vs `firma_correo`
 * vs `crm_configuracion`) and every protected route must carry exactly
 * one, so the bare page routes each visitor the way the sidebar would —
 * unauthenticated → login (with `redirect` param, proxy TM1
 * convention), `admin` → the usuarios tab, `firma_correo` → the firma
 * tab, `crm_configuracion` → the consulta-sunat tab (T8), otherwise
 * the denegado page with the proxy's exact params.
 */
export default async function ConfiguracionRedirectPage(): Promise<never> {
  const session = await getSession();
  if (!session) {
    redirect(`/auth/login?redirect=${encodeURIComponent('/configuracion')}`);
  }
  if (session.permisos.includes('admin')) {
    redirect('/configuracion/usuarios');
  }
  if (session.permisos.includes('firma_correo')) {
    redirect('/configuracion/firma');
  }
  // crm-consulta-sunat (T8, L8): the consulta-sunat tab holder lands on
  // the LAST tab — same first-openable-tab precedence as the sidebar.
  if (session.permisos.includes('crm_configuracion')) {
    redirect('/configuracion/consulta-sunat');
  }
  redirect(
    `/auth/denegado?permiso=admin&label=${encodeURIComponent('Configuración')}&ruta=${encodeURIComponent('/configuracion')}`,
  );
}
