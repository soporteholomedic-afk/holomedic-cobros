import { ListarDashboardUseCase } from '@/features/asistencia-rrhh/application/listarDashboard';
import { getAsistenciaDb } from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import { AlertasPanel } from '@/features/asistencia-rrhh/presentation/components/AlertasPanel';
import { RefrescarButton } from '@/features/asistencia-rrhh/presentation/components/RefrescarButton';
import { TablaMarcaciones } from '@/features/asistencia-rrhh/presentation/components/TablaMarcaciones';

/**
 * `/asistencia` — capture dashboard (REQ-F1-11). Protected by
 * RUTAS_PROTEGIDAS via the proxy (permiso `asistencia`, registered in
 * WU4); the page itself is a thin Server Component that resolves the
 * read model through the use case and hands it to presentational
 * components. Live data: force-dynamic — every request re-reads the DB
 * and re-evaluates WORKER_CAIADO on read (ADR-5).
 */
export const dynamic = 'force-dynamic';

export default async function AsistenciaDashboardPage() {
  const db = await getAsistenciaDb();
  const dashboard = await new ListarDashboardUseCase(db).execute();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Asistencia — marcaciones del día</h1>
          <p className="text-sm text-muted-foreground">{dashboard.fecha} (America/Lima)</p>
        </div>
        <RefrescarButton />
      </header>

      <section aria-label="Marcaciones del día">
        <h2 className="mb-2 text-lg font-medium">
          Marcaciones ({dashboard.marcaciones.length})
        </h2>
        <TablaMarcaciones marcaciones={dashboard.marcaciones} />
      </section>

      <section aria-label="Alertas">
        <h2 className="mb-2 text-lg font-medium">
          Alertas ({dashboard.alertas.length})
        </h2>
        <AlertasPanel alertas={dashboard.alertas} />
      </section>
    </main>
  );
}
