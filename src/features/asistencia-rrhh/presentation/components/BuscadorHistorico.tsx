import type { SearchParamsHistorico } from '@/app/asistencia/historico/criterio';

/**
 * Search form for the histórico page (REQ-F1-12). A plain GET form —
 * no client JS needed: submitting navigates to the same route with the
 * fields as searchParams and the Server Component page re-renders.
 * Values of the current search round-trip as defaults.
 */
interface BuscadorHistoricoProps {
  valores: Required<Pick<SearchParamsHistorico, 'desde' | 'hasta'>> & SearchParamsHistorico;
}

export function BuscadorHistorico({ valores }: BuscadorHistoricoProps) {
  return (
    <form
      method="get"
      action="/asistencia/historico"
      aria-label="Búsqueda del histórico"
      className="grid grid-cols-1 gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Empleado (id)</span>
        <input
          type="number"
          name="empleado"
          min={1}
          defaultValue={valores.empleado ?? ''}
          className="rounded-md border px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Usuario de equipo</span>
        <input
          type="text"
          name="userId"
          maxLength={20}
          defaultValue={valores.userId ?? ''}
          className="rounded-md border px-2 py-1.5 font-mono"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Desde</span>
        <input
          type="date"
          name="desde"
          defaultValue={valores.desde}
          className="rounded-md border px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Hasta</span>
        <input
          type="date"
          name="hasta"
          defaultValue={valores.hasta}
          className="rounded-md border px-2 py-1.5"
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Buscar
      </button>
    </form>
  );
}
