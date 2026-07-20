import type { AtencionDetalle } from '@/types/jjc';
import { FormField } from './FormField';

interface PatientSummaryFieldsProps {
  atencion: AtencionDetalle;
}

/**
 * Read-only-ish patient summary fields auto-filled from the attention
 * context. Nombre, DNI, Empresa, Ocupación (puesto), Área — all
 * displayed as read-only styled inputs.
 */
export function PatientSummaryFields({ atencion }: PatientSummaryFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Nombre">
        <input
          type="text"
          value={atencion.paciente}
          readOnly
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 cursor-default"
        />
      </FormField>

      <FormField label="DNI">
        <input
          type="text"
          value={atencion.dni}
          readOnly
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 cursor-default"
        />
      </FormField>

      <FormField label="Empresa">
        <input
          type="text"
          value={atencion.empresa}
          readOnly
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 cursor-default"
        />
      </FormField>

      <FormField label="Ocupación">
        <input
          type="text"
          value={atencion.puesto}
          readOnly
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 cursor-default"
        />
      </FormField>

      <FormField label="Área">
        <input
          type="text"
          value={atencion.area}
          readOnly
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 cursor-default"
        />
      </FormField>
    </div>
  );
}
