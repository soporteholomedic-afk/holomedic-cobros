import { UsuariosPanel } from '@/app/admin/usuarios/UsuariosPanel';

/**
 * USUARIOS tab of `/configuracion` (feature `configuracion-tabs`, S3).
 *
 * Gated by the proxy on the `admin` permiso (RUTAS_PROTEGIDAS) and
 * rendering the SAME extracted panel as the legacy `/admin/usuarios`
 * entry — one implementation, two entries (S4 keeps the legacy route
 * working for bookmarks).
 */
export default function ConfiguracionUsuariosPage() {
  return <UsuariosPanel />;
}
