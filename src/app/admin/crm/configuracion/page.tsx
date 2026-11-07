import { PanelApifacturacion } from '@/features/crm/presentation/components/configuracion/PanelApifacturacion';

/**
 * `/admin/crm/configuracion` — administration of the apifacturacion.com
 * (SUNAT lookup) token and URL (crm-consulta-sunat T2, specs S2/S5).
 * Gated by the proxy on the `crm_configuracion` permiso (RUTAS_PROTEGIDAS)
 * and rendered inside the shared SessionShell. NOTE: the Sidebar entry is
 * deferred to T7 (task log L6) — reach it directly by URL until then.
 */
export default function PaginaConfiguracionCrm() {
  return <PanelApifacturacion />;
}
