import { PanelConfiguracion } from '@/features/crm/presentation/components/configuracion/PanelConfiguracion';

/**
 * `/admin/crm/configuracion` — runtime configuration of La Guía
 * (agente-ia-crm E5·T6, permiso `crm_configuracion` via
 * RUTAS_PROTEGIDAS). Server Component shell with the header; the
 * interactive half (kill-switch bar + four tabs) lives in
 * PanelConfiguracion (client).
 */
export default function ConfiguracionPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Configuración del agente</h1>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Ajusta las reglas de La Guía, el canal de WhatsApp y la memoria. Los cambios aplican en la siguiente ejecución del
          agente.
        </p>
      </header>

      <PanelConfiguracion />
    </main>
  );
}
