/**
 * Legacy `/admin/usuarios` entry (feature `configuracion-tabs` T3).
 *
 * Kept working for bookmarks (S4): the proxy still gates this route on
 * the `admin` permiso and the page renders the SAME `UsuariosPanel`
 * that the `/configuracion/usuarios` tab uses. The implementation was
 * extracted verbatim — `page.test.tsx` pins the behavior through this
 * default export.
 */
export { UsuariosPanel as default } from './UsuariosPanel';
