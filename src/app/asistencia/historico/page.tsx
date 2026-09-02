import { BuscarMarcacionesRawUseCase, CriterioInvalidoError } from '@/features/asistencia-rrhh/application/buscarMarcacionesRaw';
import type { MarcacionRaw } from '@/features/asistencia-rrhh/domain/entities';
import { getAsistenciaDb } from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import { BuscadorHistorico } from '@/features/asistencia-rrhh/presentation/components/BuscadorHistorico';
import { TablaMarcaciones } from '@/features/asistencia-rrhh/presentation/components/TablaMarcaciones';
import { normalizarCriterioHistorico, type SearchParamsHistorico } from './criterio';

/**
 * `/asistencia/historico` — raw punch search (REQ-F1-12). Protected by
 * RUTAS_PROTEGIDAS (permiso `asistencia`). Server Component: reads the
 * searchParams (empleado/userId + date range), normalizes them to the
 * domain criterion and lists EVERY matching punch — no collapse in F1;
 * punches of unresolved user_ids show the "Sin ficha" label.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<SearchParamsHistorico>;
}

export default async function AsistenciaHistoricoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const criterio = normalizarCriterioHistorico(params);

  const db = await getAsistenciaDb();
  let marcaciones: MarcacionRaw[] = [];
  let error: string | null = null;
  try {
    marcaciones = await new BuscarMarcacionesRawUseCase(db).execute(criterio);
  } catch (e) {
    if (e instanceof CriterioInvalidoError) {
      marcaciones = [];
      error = e.message;
    } else {
      throw e;
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Asistencia — histórico de marcaciones</h1>
        <p className="text-sm text-muted-foreground">
          Búsqueda sin colapso: cada marca cruda, una fila.
        </p>
      </header>

      <BuscadorHistorico valores={{ ...params, desde: criterio.desde, hasta: criterio.hasta }} />

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section aria-label="Resultados">
        <h2 className="mb-2 text-lg font-medium">Resultados ({marcaciones.length})</h2>
        <TablaMarcaciones marcaciones={marcaciones} />
      </section>
    </main>
  );
}
