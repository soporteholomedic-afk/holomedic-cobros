import { AreasPanel } from './AreasPanel';

/**
 * ÁREAS tab of `/configuracion` (feature `areas-crud`): the full area
 * catalog CRUD. Replaces the feature `configuracion-tabs` empty
 * placeholder (S3 "AREAS (VISTA VACÍA)") now that the `dbo.areas`
 * table and the `/api/areas` routes exist. Still gated by the proxy
 * on the `admin` permiso (RUTAS_PROTEGIDAS).
 */
export default function ConfiguracionAreasPage() {
  return <AreasPanel />;
}
