import { ListarFichasPendientesUseCase } from '@/features/asistencia-rrhh/application/listarFichasPendientes';
import { getAsistenciaDb } from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import { ColaFichas } from '@/features/asistencia-rrhh/presentation/components/ColaFichas';

/**
 * `/asistencia/fichas` — RRHH pending-fichas queue (REQ-F1-13).
 * Protected by RUTAS_PROTEGIDAS (permiso `asistencia`). Server
 * Component: resolves the ordered queue through the use case and hands
 * it to the presentational ColaFichas (one completion form per ficha).
 */
export const dynamic = 'force-dynamic';

export default async function AsistenciaFichasPage() {
  const db = await getAsistenciaDb();
  const fichas = await new ListarFichasPendientesUseCase(db).execute();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Asistencia — fichas pendientes</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios reportados por los equipos que aún no tienen ficha completa ({fichas.length}).
        </p>
      </header>

      <ColaFichas fichas={fichas} />
    </main>
  );
}
