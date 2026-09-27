'use client';

import { useState, type FormEvent } from 'react';
import { Clock, Info, MessageSquare, ThumbsUp, X } from 'lucide-react';

import type { EventoPipeline } from '../../../domain/maquinaEstados';
import { useTransicion, type TransicionPayload } from '../../hooks/useTransicion';

/**
 * ModalRespuesta (task 9.3, spec OP-7, design D5) — records the client's
 * answer through the EXISTING transitions endpoint so every panel action
 * keeps its CRM_Transiciones/CRM_Actividades/CRM_Resultados audit trail:
 * positive → `AceptaciónOutbound` semantics, negative → `Rechazo` whose
 * motivo is the optional nota (falling back to 'No tiene interés' — the
 * machine requires a motivo ≤300). Success hands control to the parent,
 * which refreshes the panel; failures show the API's Spanish error
 * verbatim and keep the form open.
 *
 * Own shell — the batch-12 precedent: ModalBase is the input-modal shell
 * (max-w-md h2/Cancelar without the explainer box) and the mock's
 * respuesta modal carries the purple "Regla automática" box + radio
 * cards, so the mock-verbatim shape is reproduced here.
 */

/** The motivo a negative response records when the operator leaves the
 * nota empty (pure — T14 rejects an empty motivo server-side). */
export const MOTIVO_NEGATIVO_POR_DEFECTO = 'No tiene interés';

export function motivoDeRespuesta(nota: string): string {
  const limpia = nota.trim();
  return limpia === '' ? MOTIVO_NEGATIVO_POR_DEFECTO : limpia;
}

/** Pure — the machine payload for one answer (extract-before-mock). */
export function payloadDeRespuesta(
  seleccion: 'positivo' | 'negativo',
  nota: string,
): TransicionPayload {
  if (seleccion === 'positivo') {
    return { evento: 'AceptaciónOutbound' satisfies EventoPipeline };
  }
  return { evento: 'Rechazo', motivo: motivoDeRespuesta(nota) };
}

export interface ModalRespuestaProps {
  empresaId: number;
  nombreEmpresa: string;
  /** Radio preselected by the caller (ficha quick action or ¿Respondió?). */
  preseleccion: 'positivo' | 'negativo';
  onSalir: () => void;
  /** Called after the transition lands — the parent refreshes the panel. */
  onExito: () => void;
}

export function ModalRespuesta({
  empresaId,
  nombreEmpresa,
  preseleccion,
  onSalir,
  onExito,
}: ModalRespuestaProps) {
  const { ejecutar, enCurso } = useTransicion(empresaId);
  const [seleccion, setSeleccion] = useState<'positivo' | 'negativo'>(preseleccion);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(eventoForm: FormEvent<HTMLFormElement>): Promise<void> {
    eventoForm.preventDefault();
    setError(null);
    const resultado = await ejecutar(payloadDeRespuesta(seleccion, nota));
    if (resultado.ok) {
      onExito();
    } else {
      setError(resultado.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Registrar Respuesta del Cliente"
        className="w-full max-w-md space-y-4 overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 font-bold text-teal-700">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Registrar Respuesta del Cliente</h3>
              <p className="text-xs font-medium text-slate-500">{nombreEmpresa}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSalir}
            aria-label="Cerrar respuesta"
            className="rounded-lg p-1 text-slate-400 transition hover:text-slate-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs leading-relaxed text-purple-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" aria-hidden="true" />
          <span>
            <strong>Regla automática:</strong> Si el cliente responde que <strong>no tiene
            interés</strong>, se detendrán los correos de inmediato y la empresa pasará a una{' '}
            <strong>pausa de 3 meses</strong>. Cuando pasen los 3 meses, se volverá a activar para
            consultarle por si cambiaron de proveedor.
          </span>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-2.5">
            <span className="block text-xs font-semibold uppercase text-slate-500">
              Tipo de Respuesta:
            </span>

            <div className="grid grid-cols-1 gap-2.5">
              <label className="flex cursor-pointer items-start rounded-xl border-2 border-slate-200 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50">
                <input
                  type="radio"
                  name="tipo-respuesta"
                  value="positivo"
                  checked={seleccion === 'positivo'}
                  onChange={() => setSeleccion('positivo')}
                  className="mr-3 mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Respuesta Positiva (Tiene interés)
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-600">
                    Pide cotización, información de paquetes o coordinar chequeos.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start rounded-xl border-2 border-slate-200 p-3 transition hover:border-rose-300 hover:bg-rose-50/40 has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50/60">
                <input
                  type="radio"
                  name="tipo-respuesta"
                  value="negativo"
                  checked={seleccion === 'negativo'}
                  onChange={() => setSeleccion('negativo')}
                  className="mr-3 mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                    <Clock className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" />
                    No tiene interés &rarr; Pausar por 3 meses
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-600">
                    Ya tienen clínica o no necesitan ahora. Se reactivará en 3 meses.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <label
              htmlFor="nota-respuesta"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Comentario o nota (opcional):
            </label>
            <textarea
              id="nota-respuesta"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Ej. Indicó que ya tienen contrato firmado hasta noviembre..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error !== null && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end space-x-2 border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={onSalir}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enCurso}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar y Aplicar Regla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
