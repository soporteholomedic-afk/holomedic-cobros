import { PanelApifacturacion } from '@/features/crm/presentation/components/configuracion/PanelApifacturacion';

/**
 * CONSULTA SUNAT tab of `/configuracion` (crm-consulta-sunat T8, log
 * L8 — "necesito que 'CONSULTA SUNAT' esté dentro de la vista de
 * 'CONFIGURACIÓN' como un tab más").
 *
 * Renders the SAME apifacturacion panel the dedicated
 * /admin/crm/configuracion page used to render (removed in T8) — one
 * implementation, one entry. Gated by the proxy on the
 * `crm_configuracion` permiso (RUTAS_PROTEGIDAS), same per-tab
 * contract as the usuarios/areas/firma tabs.
 */
export default function ConfiguracionConsultaSunatPage() {
  return <PanelApifacturacion />;
}
