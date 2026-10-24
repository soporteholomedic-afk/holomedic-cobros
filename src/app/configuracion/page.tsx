import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';

/**
 * Bare `/configuracion` entry (feature `configuracion-tabs`) — a
 * session-aware PURE redirect; it renders no content.
 *
 * Deliberately UNREGISTERED in RUTAS_PROTEGIDAS (the proxy leaves it
 * public): the three tabs need DIFFERENT permisos (`admin` vs
 * `firma_correo`) and every protected route must carry exactly one, so
 * the bare page routes each visitor the way the sidebar would —
 * unauthenticated → login (with `redirect` param, proxy TM1
 * convention), `admin` → the usuarios tab, `firma_correo` → the firma
 * tab, otherwise the denegado page with the proxy's exact params.
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
  redirect(
    `/auth/denegado?permiso=admin&label=${encodeURIComponent('Configuración')}&ruta=${encodeURIComponent('/configuracion')}`,
  );
}
