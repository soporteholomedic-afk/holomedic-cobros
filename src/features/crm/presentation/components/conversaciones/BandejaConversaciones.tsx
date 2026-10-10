'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';

import { useConversaciones } from '../../hooks/useConversaciones';
import { HiloConversacion } from './HiloConversacion';
import { ListaConversaciones } from './ListaConversaciones';
import { SimuladorEntrada } from './SimuladorEntrada';

/**
 * BandejaConversaciones (agente-ia-crm E1) — the bandeja orchestrator:
 * two columns (lista+buscador | hilo+composer) from the approved
 * mockup, responsive — below md only ONE column shows (the list, or
 * the hilo once a row is selected, with a back button). Owns the
 * search text and the selection id; all data lives in the hooks
 * (useConversaciones / useHiloConversacion inside HiloConversacion).
 * The simulator card renders only while the server reports
 * modoSimulado (mock-first E1). Visual tokens copied from panel/
 * (PanelCrm header + card, slate/teal).
 */

export function BandejaConversaciones() {
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const { conversaciones, total, modoSimulado, status, error, refetch, simularEntrada } =
    useConversaciones(busqueda);

  // Fila seleccionada: DERIVADA de la lista (nunca estado duplicado —
  // regla del repo) — al refrescar llega el dato nuevo (badge limpio,
  // estado post-vincular). Si una búsqueda filtra la fila fuera de la
  // lista, el hilo se cierra: la selección vuelve a la lista visible.
  const filaSeleccionada =
    seleccionadaId === null
      ? null
      : (conversaciones.find((c) => c.id === seleccionadaId) ?? null);

  return (
    <section aria-label="Conversaciones" className="space-y-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Conversaciones
            </h1>
            <span className="rounded-full border border-teal-200 dark:border-teal-900/50 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              WhatsApp
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Bandeja de chats del CRM: respondé a mano o vinculá lo que entró sin contacto.
          </p>
        </div>
      </header>

      {modoSimulado && (
        <SimuladorEntrada
          onSimular={async (telefono, texto) => {
            const resultado = await simularEntrada(telefono, texto);
            // Éxito → refresco (dentro del hook) + abrir la conversación
            // resultante: el operador aterriza en el hilo que simuló.
            if (resultado.ok && resultado.conversacionId !== null) {
              setSeleccionadaId(resultado.conversacionId);
            }
            return resultado;
          }}
        />
      )}

      <div className="grid h-[calc(100vh-16rem)] min-h-[28rem] grid-cols-1 gap-4 md:grid-cols-[340px_1fr]">
        <div className={filaSeleccionada === null ? 'h-full' : 'hidden h-full md:block'}>
          <ListaConversaciones
            conversaciones={conversaciones}
            total={total}
            status={status}
            error={error}
            busqueda={busqueda}
            onBuscar={setBusqueda}
            seleccionada={seleccionadaId}
            onSeleccionar={(id) => setSeleccionadaId(id)}
            onReintentar={() => refetch()}
          />
        </div>

        <div className={filaSeleccionada === null ? 'hidden h-full md:block' : 'h-full'}>
          {filaSeleccionada === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/20 p-8 text-center">
              <MessageSquare
                className="h-10 w-10 text-slate-300 dark:text-slate-600"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Seleccioná una conversación
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                El hilo se abre acá con el historial completo y el composer para responder.
              </p>
            </div>
          ) : (
            <HiloConversacion
              fila={filaSeleccionada}
              onVolver={() => setSeleccionadaId(null)}
              onCambio={() => refetch(true)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
