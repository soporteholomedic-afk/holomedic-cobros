import type { MarcacionRaw } from '@/features/asistencia-rrhh/domain/entities';

/**
 * Read-only table of the day's raw punches (REQ-F1-11). Presentational
 * only — the server page resolves the data through listarDashboard.
 * Empleado shows the resolved id, or a "Sin ficha" hint when the punch
 * has not been backfilled yet (ficha still PENDIENTE_FICHA).
 */

const HORA_FORMATO = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

interface TablaMarcacionesProps {
  marcaciones: MarcacionRaw[];
}

export function TablaMarcaciones({ marcaciones }: TablaMarcacionesProps) {
  if (marcaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin marcaciones registradas hoy.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="px-3 py-2 font-medium">Hora</th>
            <th className="px-3 py-2 font-medium">Usuario</th>
            <th className="px-3 py-2 font-medium">Empleado</th>
            <th className="px-3 py-2 font-medium">Punch</th>
            <th className="px-3 py-2 font-medium">Verificación</th>
          </tr>
        </thead>
        <tbody>
          {marcaciones.map((m) => (
            <tr key={m.id} className="border-b last:border-b-0">
              <td className="px-3 py-1.5 font-mono">{HORA_FORMATO.format(m.fechaHora)}</td>
              <td className="px-3 py-1.5 font-mono">{m.userId}</td>
              <td className="px-3 py-1.5">
                {m.empleadoId === null ? (
                  <span className="text-muted-foreground">Sin ficha</span>
                ) : (
                  `#${m.empleadoId}`
                )}
              </td>
              <td className="px-3 py-1.5">{m.punch}</td>
              <td className="px-3 py-1.5">{m.tipoVerificacion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
