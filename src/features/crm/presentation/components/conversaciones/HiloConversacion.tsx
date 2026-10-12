'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';

import type { ConversacionListada, MensajeCrm } from '../../../domain/entities';
import { useHiloConversacion } from '../../hooks/useHiloConversacion';
import { formatearFecha } from '../../etiquetas';
import {
  ETIQUETA_ESTADO_CONVERSACION,
  formatearTelefono,
  iniciales,
  parsearTitulosFuentes,
  tituloFilaConversacion,
} from './guards';
import { PanelVinculacion } from './PanelVinculacion';
import { TarjetaAyuda } from './TarjetaAyuda';
import { FichaContacto } from './FichaContacto';
import { MemoriasPanel } from './MemoriasPanel';
import { AjustesChat } from './AjustesChat';
import { SelectorEscalar } from './SelectorEscalar';

/**
 * HiloConversacion (agente-ia-crm E1; E3·T5 help pattern) — the
 * bandeja's center column plus the right panel column: header
 * (nombre, empresa, estado — '⚠ NECESITA TU AYUDA' when la Guía
 * escaló), the thread oldest-first with IN bubbles left / OUT right
 * (IA tinted indigo with score+fuentes), the help card (TarjetaAyuda)
 * while a solicitud stays PENDIENTE, the composer (Enter sends /
 * Shift+Enter newline; a failed send NEVER drops the draft — the
 * draft also survives the help card, the indicación and every estado
 * change/refetch) and the estado actions ('↩ Tomar la conversación' /
 * 'Devolver a la Guía' + 'Escalar a…'). The right column (ficha +
 * memorias + ajustes, mockup .side ~320px) hides below xl and reads
 * the SAME useHiloConversacion instance — no prop drilling. CERRADA →
 * composer replaced by the closed notice; PENDIENTE_VINCULACION →
 * PanelVinculacion. Opening the hilo already marks it read (GET).
 */

export interface HiloConversacionProps {
  /** The selected bandeja row (names come from the list's JOIN). */
  fila: ConversacionListada;
  /** Mobile only: back to the list (BandejaConversaciones owns it). */
  onVolver: () => void;
  /** Fired after a reply or vinculación so the list refetches. */
  onCambio: () => void;
}

const ETIQUETA_EMISOR: Record<MensajeCrm['emisor'], string> = {
  CLIENTE: 'Cliente',
  IA: '🤖 La Guía',
  HUMANO: 'Operador',
};

function Burbuja({
  mensaje,
  onMarcarDeficiente,
  marcandoDeficiente = false,
}: {
  mensaje: MensajeCrm;
  /** E4·T5: presente SOLO cuando la marca está disponible para esta burbuja. */
  onMarcarDeficiente?: (mensajeId: number) => void;
  marcandoDeficiente?: boolean;
}) {
  const esOut = mensaje.direccion === 'OUT';
  // OUT+IA se distingue (E2·T6): tinte índigo en vez del teal del
  // operador — la respuesta de La Guía se reconoce de un vistazo.
  const esIa = esOut && mensaje.emisor === 'IA';
  const fondo = esIa
    ? 'self-end bg-indigo-600 text-white dark:bg-indigo-700'
    : esOut
      ? 'self-end bg-teal-600 text-white dark:bg-teal-700'
      : 'self-start border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200';
  const tonoSuave = esIa
    ? 'text-indigo-100'
    : esOut
      ? 'text-teal-100'
      : 'text-slate-400 dark:text-slate-500';
  // Parse defensivo por render (sin estado): JSON garbage → [] y el
  // affordance simplemente no aparece (contrato de parsearTitulosFuentes).
  const titulosFuentes = esIa ? parsearTitulosFuentes(mensaje.fuentes) : [];
  // E4·T5: la fidelidad autoevaluada se muestra SOLO cuando la fila la
  // trae (guard tolerante — filas pre-E4 → undefined → sin línea).
  const fidelidad = esIa && typeof mensaje.fidelidad === 'number' ? mensaje.fidelidad : null;
  const puedeMarcarDeficiente = esIa && mensaje.deficiente !== true && onMarcarDeficiente !== undefined;
  return (
    <div
      className={`flex max-w-[80%] flex-col rounded-2xl px-3.5 py-2 text-sm shadow-sm ${fondo}`}
    >
      <span className={`mb-0.5 text-[10px] font-bold uppercase tracking-wide ${tonoSuave}`}>
        {ETIQUETA_EMISOR[mensaje.emisor]}
      </span>
      <span className="whitespace-pre-wrap break-words">{mensaje.cuerpo}</span>
      {(mensaje.score !== null && esIa) || titulosFuentes.length > 0 || fidelidad !== null ? (
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {esIa && mensaje.score !== null && (
            <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
              confianza {mensaje.score.toFixed(2)}
            </span>
          )}
          {/* E4·T5: marca de respuesta deficiente (estado desde la fila,
              sobrevive al refetch — el hueco #id llega por la respuesta
              de la ruta, no necesita ir inline en el listado). */}
          {esIa && mensaje.deficiente === true && (
            <span className="inline-flex items-center rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
              ⚠ marcada deficiente
            </span>
          )}
          {(titulosFuentes.length > 0 || fidelidad !== null) && (
            <details className="w-fit">
              <summary className="inline-flex cursor-pointer select-none items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                Fuentes ({titulosFuentes.length})
              </summary>
              <ul className="mt-1 list-disc pl-4 text-[11px] leading-snug">
                {titulosFuentes.map((titulo, indice) => (
                  <li key={`${indice}-${titulo}`}>{titulo}</li>
                ))}
                {/* E4·T5: la autoevaluación de fidelidad vive junto a las
                    fuentes citadas (0.90 → «Fidelidad: 0.90»). */}
                {fidelidad !== null && <li>Fidelidad: {fidelidad.toFixed(2)}</li>}
              </ul>
            </details>
          )}
        </span>
      ) : null}
      {/* E4·T5: la marca SOLO se ofrece en respuestas IA sin marcar;
          la visibilidad (estado del hilo) la decide el padre. */}
      {puedeMarcarDeficiente && (
        <button
          type="button"
          onClick={() => onMarcarDeficiente?.(mensaje.id)}
          disabled={marcandoDeficiente}
          className="mt-1 self-start rounded-lg border border-white/30 px-2 py-0.5 text-[10px] font-semibold text-indigo-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {marcandoDeficiente ? 'Marcando…' : '⚠ Marcar deficiente'}
        </button>
      )}
      {/* PENDIENTE (outbox en vuelo, E2): ni hora ni wamid — un estado
          sutil de enviando; FALLIDO mantiene el marcado de error. */}
      {mensaje.estadoEnvio === 'PENDIENTE' ? (
        <span className={`mt-1 text-right text-[10px] italic ${tonoSuave}`}>enviando…</span>
      ) : (
        <span className={`mt-1 text-right text-[10px] ${tonoSuave}`}>
          {formatearFecha(mensaje.creadoEn).split(' ')[1]}
          {mensaje.estadoEnvio === 'FALLIDO' ? ' · envío fallido' : ''}
        </span>
      )}
    </div>
  );
}

export function HiloConversacion({ fila, onVolver, onCambio }: HiloConversacionProps) {
  const {
    hilo,
    status,
    error,
    enviando,
    errorEnvio,
    limpiarErrorEnvio,
    enviarMensaje,
    vincular,
    vinculando,
    errorVinculacion,
    // E3·T5: side column + help pattern
    ficha,
    statusFicha,
    errorFicha,
    confirmandoFicha,
    errorConfirmacionFicha,
    confirmarDatoFicha,
    memorias,
    empresaIdMemorias,
    statusMemorias,
    errorMemorias,
    gestionandoMemoria,
    errorMemoriaAccion,
    pinearMemoria,
    eliminarMemoria,
    guardarMemoria,
    ajustes,
    statusAjustes,
    errorAjustes,
    alternandoMemoria,
    errorToggleMemoria,
    toggleMemoriaActiva,
    usuariosAsignables,
    statusUsuarios,
    errorUsuarios,
    cargarUsuariosAsignables,
    enviandoIndicacion,
    errorIndicacion,
    enviarIndicacion,
    transicionando,
    errorTransicion,
    tomar,
    devolver,
    escalar,
    // E4·T5: marca de respuesta deficiente
    marcandoDeficiente,
    errorDeficiente,
    limpiarErrorDeficiente,
    marcarDeficiente,
  } = useHiloConversacion(fila.id, fila.ultimoMensajeEn);

  const [borrador, setBorrador] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Éxito de la indicación: vive ACÁ (no en la tarjeta) para sobrevivir
  // al refetch del hilo que desmonta la solicitud (el ✓ debe verse).
  const [exitoIndicacion, setExitoIndicacion] = useState(false);
  const solicitud = hilo?.solicitudAyuda ?? null;

  // Nueva solicitud (o conversación distinta) → el ✓ caduca. OJO:
  // cuando el refetch DESMONTA la solicitud (id → undefined) NO se
  // resetea — el ✓ debe sobrevivir justo a ese refetch.
  const prevSolicitudRef = useRef<number | null>(null);
  useEffect(() => {
    const idActual = solicitud?.id ?? null;
    if (idActual !== null && prevSolicitudRef.current !== idActual) {
      setExitoIndicacion(false);
      prevSolicitudRef.current = idActual;
    }
  }, [solicitud?.id, fila.id]);

  // Auto-scroll al fondo: al abrir y con cada mensaje nuevo.
  useEffect(() => {
    const nodo = scrollRef.current;
    if (nodo !== null) nodo.scrollTop = nodo.scrollHeight;
  }, [hilo?.mensajes.length, fila.id, solicitud?.id]);

  // La conversación cerrada o pendiente reemplaza el composer; el
  // borrador NO se limpia al cambiar de estado para no perder texto.
  const estado = hilo?.conversacion.estado ?? fila.estado;
  const composerHabilitado = estado !== 'CERRADA' && estado !== 'PENDIENTE_VINCULACION';

  async function manejarEnvio(): Promise<void> {
    const cuerpo = borrador.trim();
    if (cuerpo === '' || enviando) return;
    const ok = await enviarMensaje(cuerpo);
    if (ok) {
      setBorrador(''); // solo se pierde el texto cuando YA está enviado
      onCambio();
    }
  }

  async function manejarTomar(): Promise<void> {
    if (transicionando) return;
    const ok = await tomar();
    if (ok) onCambio();
  }

  async function manejarDevolver(): Promise<void> {
    if (transicionando) return;
    const ok = await devolver();
    if (ok) onCambio();
  }

  // E4·T5: la marca por burbuja (el refetch del hilo ya corre en el
  // hook — el chip llega desde la fila refetchada).
  function manejarDeficiente(mensajeId: number): void {
    if (marcandoDeficiente) return;
    void marcarDeficiente(mensajeId);
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <header className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 px-4 py-3">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a la lista"
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white"
        >
          {iniciales(fila.nombreContacto ?? fila.razonSocial ?? fila.telefono ?? '?')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tituloFilaConversacion(fila)}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {fila.razonSocial ?? 'Sin empresa vinculada'}
            {fila.telefono !== null ? ` · ${formatearTelefono(fila.telefono)}` : ''}
          </p>
        </div>
        {estado === 'REQUIERE_HUMANO' ? (
          <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
            ⚠ NECESITA TU AYUDA
          </span>
        ) : (
          <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
            {ETIQUETA_ESTADO_CONVERSACION[estado]}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto bg-slate-50/60 dark:bg-slate-950/30 p-4"
        aria-label="Mensajes"
      >
        {status === 'loading' && (
          <div role="status" className="flex items-center justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">Cargando hilo…</span>
          </div>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="self-center rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-4 text-center text-sm text-red-700 dark:text-red-400"
          >
            {error ?? 'Error al cargar el hilo'}
          </div>
        )}

        {status === 'ready' &&
          hilo?.mensajes.map((mensaje) => (
            <Burbuja
              key={mensaje.id}
              mensaje={mensaje}
              // E4·T5: la marca se ofrece solo en hilos atendibles —
              // PENDIENTE_VINCULACION no (guarda de acciones existente:
              // el composer y las acciones tampoco se ofrecen ahí).
              onMarcarDeficiente={
                estado === 'PENDIENTE_VINCULACION' ? undefined : manejarDeficiente
              }
              marcandoDeficiente={marcandoDeficiente}
            />
          ))}

        {/* E4·T5: error inline de la marca (junto al hilo, visible sin
            importar el estado del composer). */}
        {errorDeficiente !== null && (
          <p
            role="alert"
            className="self-center rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400"
          >
            {errorDeficiente}{' '}
            <button
              type="button"
              onClick={limpiarErrorDeficiente}
              className="underline underline-offset-2 hover:opacity-80"
            >
              ocultar
            </button>
          </p>
        )}

        {status === 'ready' && hilo !== null && hilo.mensajes.length === 0 && (
          <p className="self-center py-8 text-xs text-slate-400 dark:text-slate-500">
            Sin mensajes todavía.
          </p>
        )}

        {/* E3·T5: la tarjeta de ayuda vive al pie del hilo (mockup
            .helpcard) — solo con solicitud PENDIENTE; el ✓ de éxito
            sobrevive al refetch que la desmonta. */}
        {status === 'ready' && (solicitud !== null || exitoIndicacion) && (
          <TarjetaAyuda
            solicitud={solicitud}
            enviada={exitoIndicacion}
            onEnviada={setExitoIndicacion}
            enviando={enviandoIndicacion}
            error={errorIndicacion}
            onEnviar={enviarIndicacion}
          />
        )}
      </div>

      {estado === 'CERRADA' && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-3">
          <p className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            La conversación está cerrada — no se pueden enviar mensajes.
          </p>
        </div>
      )}

      {estado === 'PENDIENTE_VINCULACION' && (
        <PanelVinculacion
          conversacionId={fila.id}
          telefono={fila.telefono}
          onVincular={async (entrada) => {
            const ok = await vincular(entrada);
            if (ok) onCambio();
            return ok;
          }}
          vinculando={vinculando}
          errorVinculacion={errorVinculacion}
        />
      )}

      {composerHabilitado && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-3">
          {/* E3·T5: acciones de estado junto al composer (mockup
              .draftarea .actions) — el borrador NUNCA se limpia por
              estas acciones. */}
          {(estado === 'ACTIVA_IA' ||
            estado === 'REQUIERE_HUMANO' ||
            estado === 'TOMADA_HUMANO') && (
            <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
              {errorTransicion !== null && (
                <p role="alert" className="mr-auto text-xs font-medium text-red-600 dark:text-red-400">
                  {errorTransicion}
                </p>
              )}
              {(estado === 'ACTIVA_IA' || estado === 'REQUIERE_HUMANO') && (
                <button
                  type="button"
                  onClick={() => void manejarTomar()}
                  disabled={transicionando}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ↩ Tomar la conversación
                </button>
              )}
              {estado === 'TOMADA_HUMANO' && (
                <>
                  <button
                    type="button"
                    onClick={() => void manejarDevolver()}
                    disabled={transicionando}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Devolver a la Guía
                  </button>
                  <SelectorEscalar
                    usuarios={usuariosAsignables}
                    status={statusUsuarios}
                    error={errorUsuarios}
                    escalando={transicionando}
                    errorEscalar={errorTransicion}
                    onCargar={cargarUsuariosAsignables}
                    onEscalar={async (usuarioId) => {
                      const ok = await escalar(usuarioId);
                      if (ok) onCambio();
                      return ok;
                    }}
                  />
                </>
              )}
            </div>
          )}

          {errorEnvio !== null && (
            <p
              role="alert"
              className="mb-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-medium text-red-700 dark:text-red-400"
            >
              {errorEnvio}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Mensaje a enviar"
              placeholder="Escribí tu respuesta… (Enter envía, Shift+Enter salta línea)"
              rows={2}
              value={borrador}
              onChange={(evento) => {
                setBorrador(evento.target.value);
                if (errorEnvio !== null) limpiarErrorEnvio();
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' && !evento.shiftKey) {
                  evento.preventDefault();
                  void manejarEnvio();
                }
              }}
              className="flex-1 resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 px-3 py-2 text-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="button"
              onClick={() => void manejarEnvio()}
              disabled={borrador.trim() === '' || enviando}
              aria-label="Enviar mensaje"
              className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      </div>

      {/* E3·T5: columna derecha (mockup .side ~320px) — ficha,
          memorias y ajustes; se oculta por debajo de xl. */}
      <aside
        aria-label="Panel de la conversación"
        className="hidden w-80 flex-none flex-col gap-4 overflow-y-auto xl:flex"
      >
        <FichaContacto
          ficha={ficha}
          status={statusFicha}
          error={errorFicha}
          confirmando={confirmandoFicha}
          errorConfirmacion={errorConfirmacionFicha}
          onConfirmar={confirmarDatoFicha}
        />
        <MemoriasPanel
          memorias={memorias}
          empresaId={empresaIdMemorias}
          status={statusMemorias}
          error={errorMemorias}
          gestionando={gestionandoMemoria}
          errorAccion={errorMemoriaAccion}
          onPinear={pinearMemoria}
          onEliminar={eliminarMemoria}
          onGuardar={guardarMemoria}
        />
        <AjustesChat
          ajustes={ajustes}
          status={statusAjustes}
          error={errorAjustes}
          alternando={alternandoMemoria}
          errorToggle={errorToggleMemoria}
          onToggleMemoriaActiva={toggleMemoriaActiva}
        />
      </aside>
    </div>
  );
}
