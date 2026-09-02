import type { Empleado } from '@/features/asistencia-rrhh/domain/entities';
import { CompletarFichaForm } from '@/features/asistencia-rrhh/presentation/components/CompletarFichaForm';

/**
 * RRHH pending-fichas queue (REQ-F1-13), oldest first (the use case
 * owns the ordering). Presentational: one completion form per ficha.
 */
interface ColaFichasProps {
  fichas: Empleado[];
}

const FECHA_FORMATO = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
});

export function ColaFichas({ fichas }: ColaFichasProps) {
  if (fichas.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay fichas pendientes de completar.</p>;
  }

  return (
    <ul className="space-y-4">
      {fichas.map((ficha) => (
        <li key={ficha.id} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{ficha.nombres ?? ficha.userId}</span>
            <span className="font-mono text-sm text-muted-foreground">{ficha.userId}</span>
            <span className="text-xs text-muted-foreground">
              en cola desde {FECHA_FORMATO.format(ficha.createdAt)}
            </span>
          </div>
          <CompletarFichaForm ficha={ficha} />
        </li>
      ))}
    </ul>
  );
}
