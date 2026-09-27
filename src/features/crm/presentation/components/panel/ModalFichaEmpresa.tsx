'use client';

import { useState } from 'react';
import { ArrowRight, Clock, Mail, Plus, RefreshCw, Send, ThumbsDown, ThumbsUp, X } from 'lucide-react';

import type { DetalleEmpresa } from '../../../application/obtenerDetalleEmpresa';
import { PLANTILLAS_CORREO } from '../../../domain/plantillasCorreo';
import type { EnvioCorreoHistorial, PlantillaCrmKey } from '../../../domain/ports';
import { useEmpresaDetalle, type UseEmpresaDetalleResult } from '../../hooks/useEmpresaDetalle';
import { ETIQUETA_TIPO, type FilaDerivadaPanel } from '../../panelDerivado';
import type { EstadoPanel } from '../../estadoPanel';
import { ETIQUETA_ETAPA, etiquetaEvento, formatearFecha } from '../../etiquetas';

/**
 * ModalFichaEmpresa (task 9.1, design D4, spec OP-6 + EM-6) — the
 * ficha modal opened from the panel rows. Header + contacto/rubro
 * cards render immediately from the derived row; the timeline
 * (registro + transiciones ∪ envios — the task-7.3 read) and the
 * quick actions' live availability ride `useEmpresaDetalle`.
 *
 * The quick "Respuesta Positiva/Negativa" buttons REPORT the intent
 * through `onRegistrarRespuesta` — PanelCrm owns the respuesta modal
 * (task 9.3). "Enviar el siguiente correo de recordatorio ahora"
 * dispatches through the EXISTING POST /envios endpoint (task 5.2)
 * with the template `plantillaSiguienteDeEstado` resolves for the
 * current panel status, then refreshes the timeline. Everything is
 * disabled once the empresa responded (mock `hasResponded`).
 */

export interface ModalFichaEmpresaProps {
  derivada: FilaDerivadaPanel;
  onSalir: () => void;
  onRegistrarRespuesta: (preseleccion: 'positivo' | 'negativo') => void;
}

/** Pure — the single source of the request URL (useTransicion precedent). */
export function buildEnviosPath(empresaId: number): string {
  return `/api/crm/empresas/${empresaId}/envios`;
}

/**
 * The next template of the 4-send cycle per panel status (pure). Null
 * where no manual send applies: cycle complete (seguimiento_3 pauses),
 * already reactivated/responded, or an inbound advanced stage.
 */
export function plantillaSiguienteDeEstado(estado: EstadoPanel): PlantillaCrmKey | null {
  switch (estado) {
    case 'sin_carta':
      return 'carta_presentacion';
    case 'carta_enviada':
      return 'seguimiento_1';
    case 'seguimiento_1':
      return 'seguimiento_2';
    case 'seguimiento_2':
      return 'seguimiento_3';
    case 'en_pausa_3m':
      return 'reactivacion_3m';
    default:
      return null;
  }
}

export type NodoLineaTiempo = {
  clave: string;
  tipo: 'registro' | 'envio' | 'transicion';
  titulo: string;
  detalle: string;
  /** Date-only display (dd/mm/yyyy) — the mock's timeline dates. */
  fecha: string;
};

function fechaCorta(iso: string): string {
  return formatearFecha(iso.split('T')[0] ?? iso);
}

/**
 * Pure — the ficha timeline: the registration node plus the transition
 * audit and the send-log merged chronologically (both reads arrive
 * newest-first; the timeline renders oldest-first).
 */
export function construirLineaTiempo(detalle: DetalleEmpresa): NodoLineaTiempo[] {
  const registro: NodoLineaTiempo = {
    clave: 'registro',
    tipo: 'registro',
    titulo: 'Empresa en el CRM',
    detalle: `Tipo: ${ETIQUETA_TIPO[detalle.empresa.tipo]}`,
    fecha: fechaCorta(detalle.empresa.createdAt),
  };
  const eventos: NodoLineaTiempo[] = [
    ...detalle.transiciones.map((t): NodoLineaTiempo => {
      const previa = t.etapaPrevia === null ? 'Creación' : ETIQUETA_ETAPA[t.etapaPrevia];
      const motivo = t.motivo === null ? '' : ` · Motivo: ${t.motivo}`;
      return {
        clave: `t-${t.id}`,
        tipo: 'transicion',
        titulo: etiquetaEvento(t.evento),
        detalle: `${previa} → ${ETIQUETA_ETAPA[t.etapaNueva]}${motivo}`,
        fecha: fechaCorta(t.createdAt),
      };
    }),
    ...detalle.envios.map((envio: EnvioCorreoHistorial): NodoLineaTiempo => {
      const verbo = envio.estado === 'ENVIADO' ? 'Enviado a' : 'Falló el envío a';
      return {
        clave: `e-${envio.id}`,
        tipo: 'envio',
        titulo: PLANTILLAS_CORREO[envio.plantilla].titulo,
        detalle: `${verbo} ${envio.destinatario}`,
        fecha: fechaCorta(envio.createdAt),
      };
    }),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return [registro, ...eventos];
}

/** Icon + tone per timeline node (mock's per-event color language). */
function estiloNodo(nodo: NodoLineaTiempo): { Icono: typeof Mail; clases: string } {
  if (nodo.tipo === 'registro') return { Icono: Plus, clases: 'bg-slate-400 text-white' };
  if (nodo.tipo === 'envio') {
    if (nodo.titulo.includes('Carta')) return { Icono: Mail, clases: 'bg-blue-500 text-white' };
    if (nodo.titulo.includes('Reactivación')) {
      return { Icono: RefreshCw, clases: 'bg-purple-500 text-white' };
    }
    return { Icono: Clock, clases: 'bg-amber-500 text-white' };
  }
  if (nodo.titulo === 'Aceptó nuestro contacto') {
    return { Icono: ThumbsUp, clases: 'bg-emerald-500 text-white' };
  }
  if (nodo.titulo === 'Rechazar') return { Icono: ThumbsDown, clases: 'bg-rose-500 text-white' };
  return { Icono: ArrowRight, clases: 'bg-sky-500 text-white' };
}

function NodoTimeline({ nodo }: { nodo: NodoLineaTiempo }) {
  const { Icono, clases } = estiloNodo(nodo);
  return (
    <div className="relative flex items-start space-x-3 text-xs">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-xs z-10 ${clases}`}
      >
        <Icono className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <div className="flex-1 rounded-xl border border-slate-200/70 bg-slate-50 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-bold text-slate-800">{nodo.titulo}</span>
          <span className="text-[11px] text-slate-400">{nodo.fecha}</span>
        </div>
        <p className="text-xs text-slate-600">{nodo.detalle}</p>
      </div>
    </div>
  );
}

export function ModalFichaEmpresa({
  derivada,
  onSalir,
  onRegistrarRespuesta,
}: ModalFichaEmpresaProps) {
  const { fila, estado } = derivada;
  const detalleHook: UseEmpresaDetalleResult = useEmpresaDetalle(fila.empresaId);
  const respondio = estado === 'respondio_positivo' || estado === 'respondio_negativo';
  const plantillaSiguiente = plantillaSiguienteDeEstado(estado);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  async function enviarSiguiente(): Promise<void> {
    if (plantillaSiguiente === null || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const response = await fetch(buildEnviosPath(fila.empresaId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plantilla: plantillaSiguiente }),
      });
      const json: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = (json as { error?: unknown }).error;
        setErrorEnvio(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
        return;
      }
      detalleHook.refresh();
    } catch {
      setErrorEnvio('Error de red');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${fila.razonSocial}`}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">{fila.razonSocial}</h3>
            <p className="text-xs text-slate-500">
              RUC: {fila.ruc} • {ETIQUETA_TIPO[fila.tipo]}
            </p>
          </div>
          <button
            type="button"
            onClick={onSalir}
            aria-label="Cerrar ficha"
            className="rounded-lg p-1 text-slate-400 transition hover:text-slate-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="block font-medium text-slate-500">Contacto</span>
              <span className="mt-0.5 block text-sm font-bold text-slate-800">
                {fila.contactoNombre ?? 'Sin contacto registrado'}
              </span>
              <span className="text-xs text-slate-500">
                {fila.contactoCargo ?? 'Sin cargo'} • {fila.contactoCorreo ?? 'sin correo'}
              </span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="block font-medium text-slate-500">Rubro y Trabajadores</span>
              <span className="mt-0.5 block text-sm font-bold text-slate-800">
                {fila.sector ?? 'Sin rubro'}
              </span>
              <span className="text-xs text-slate-500">
                {fila.cantidadTrabajadores !== null
                  ? `${fila.cantidadTrabajadores} trabajadores estimados`
                  : 'Cantidad sin registrar'}
              </span>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              Historial de correos enviados
            </h4>
            {detalleHook.status === 'loading' && (
              <p className="text-xs text-slate-500">Cargando historial…</p>
            )}
            {detalleHook.status === 'error' && (
              <p role="alert" className="text-xs text-red-600">
                {detalleHook.error ?? 'No se pudo cargar el historial'}
              </p>
            )}
            {detalleHook.status === 'ready' && detalleHook.detalle !== null && (
              <div className="relative space-y-3 before:absolute before:bottom-2 before:left-3.5 before:top-2 before:w-0.5 before:bg-slate-200">
                {construirLineaTiempo(detalleHook.detalle).map((nodo) => (
                  <NodoTimeline key={nodo.clave} nodo={nodo} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900">
                ¿El cliente ya contestó por teléfono, WhatsApp o correo?
              </h4>
              <span className="text-[11px] text-slate-500">Detiene los envíos automáticos</span>
            </div>
            <p className="text-xs text-slate-600">
              Registra su respuesta para saber de inmediato si tiene interés o si prefiere no
              continuar:
            </p>
            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              <button
                type="button"
                disabled={respondio}
                onClick={() => onRegistrarRespuesta('positivo')}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                Respuesta Positiva (Tiene interés)
              </button>
              <button
                type="button"
                disabled={respondio}
                onClick={() => onRegistrarRespuesta('negativo')}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                Respuesta Negativa (No le interesa)
              </button>
            </div>
            <div className="flex justify-end border-t border-slate-200 pt-2">
              <button
                type="button"
                disabled={respondio || plantillaSiguiente === null || enviando}
                onClick={() => void enviarSiguiente()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                {enviando ? 'Enviando…' : 'Enviar el siguiente correo de recordatorio ahora'}
              </button>
            </div>
            {errorEnvio !== null && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {errorEnvio}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            onClick={onSalir}
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
