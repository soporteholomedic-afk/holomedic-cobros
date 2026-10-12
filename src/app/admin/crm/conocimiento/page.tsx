import { PanelConocimiento } from '@/features/crm/presentation/components/conocimiento/PanelConocimiento';

/**
 * `/admin/crm/conocimiento` — carga de conocimiento para La Guía
 * (agente-ia-crm E4·T8, permiso `crm_conocimiento` via
 * RUTAS_PROTEGIDAS). Server Component shell with the header + the
 * etapa-6 caption; the interactive half (upload cards + live list)
 * lives in PanelConocimiento (client). Deliberately MINIMAL: no CRUD,
 * no editing — the E6 editor owns that.
 */
export default function ConocimientoPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Conocimiento del agente</h1>
        <p className="text-sm text-muted-foreground">
          Todo lo subido entra al conocimiento que La Guía usa de inmediato. El editor completo llega con la etapa 6.
        </p>
      </header>

      <PanelConocimiento />
    </main>
  );
}
