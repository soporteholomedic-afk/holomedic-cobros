import type { VistaAlerta } from '@/features/asistencia-rrhh/application/listarDashboard';

/**
 * Read-only alert panel (REQ-F1-11): the DB's recent capture alerts plus
 * the synthetic WORKER_CAIADO entries evaluated on read (ADR-5). F1 has
 * no acknowledge flow — the panel is informational.
 */

const ETIQUETAS_TIPO: Record<string, string> = {
  WORKER_CAIADO: 'Worker caído',
  DRIFT_RELOJ: 'Deriva de reloj',
  USER_ID_DESCONOCIDO: 'Usuario desconocido',
};

interface AlertasPanelProps {
  alertas: VistaAlerta[];
}

export function AlertasPanel({ alertas }: AlertasPanelProps) {
  if (alertas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin alertas activas.</p>;
  }

  return (
    <ul className="space-y-2">
      {alertas.map((alerta, i) => (
        <li key={i} className="rounded-md border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
              {ETIQUETAS_TIPO[alerta.tipo] ?? alerta.tipo}
            </span>
            <time className="text-xs text-muted-foreground">
              {alerta.fecha.toLocaleString('es-PE', { hour12: false })}
            </time>
          </div>
          {alerta.detalle !== '' && (
            <p className="mt-1 text-sm">{alerta.detalle}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
