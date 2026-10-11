'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { DetalleAyudaNotificacion, ResumenNotificaciones } from '../../domain/entities';
import { esResumenNotificaciones } from '../components/conversaciones/guards';

/**
 * useNotificacionesConversaciones(habilitado) — the shell-wide
 * notification read (agente-ia-crm E3·T6) behind the Sidebar badge
 * and the global "La Guía necesita tu ayuda" toasts:
 *
 * - `habilitado` (Sidebar passes permisos.includes('crm_conversaciones')):
 *   immediate first fetch + light polling every
 *   INTERVALO_POLLING_NOTIFICACIONES_MS (mirrors the bandeja's 15s
 *   cadence convention from useConversaciones; hidden tabs skip).
 *   When disabled: no timers, no fetches — clean mount/unmount, no
 *   setState after unmount (mountedRef + cleared interval).
 * - Stale-while-error: a failed poll (HTTP or network) keeps the last
 *   resumen and stays SILENT — a background badge must never shout.
 * - Toasts live INSIDE this hook by design (documented choice): the
 *   Sidebar is the single global mount point, so the polling, the
 *   badge and the toasts share one lifecycle — no companion hook and
 *   no double polling. A per-conversacion `vistos` Set (in-memory
 *   ref, deliberately NOT sessionStorage: reloading the page SHOULD
 *   re-toast still-pending help) dedupes: each successful poll toasts
 *   every detalle row whose conversacionId was not seen yet, ONE
 *   toast each. When a row leaves the detalle (resolved) its id is
 *   pruned from `vistos` so a NEW solicitud for the same conversation
 *   re-toasts — but pruning only runs while the detalle window covers
 *   every pending conversation (len >= requiereAyuda); under cap
 *   pressure a row may just have fallen off the top-5, and a false
 *   prune would re-toast a still-pending solicitud.
 * - The toast's action 'Ver conversación' is the ONLY navigation
 *   (locked design: toasts never navigate alone, drafts never
 *   destroyed) — it router.pushes the bandeja deep link and dismisses
 *   the toast.
 */

export const INTERVALO_POLLING_NOTIFICACIONES_MS = 15_000;

const RUTA_NOTIFICACIONES = '/api/crm/conversaciones/notificaciones';

/** ~80 chars of the consulta inside the toast description (task spec). */
const LARGO_CONSULTA_TOAST = 80;

/** Stable sonner id per conversation (sendToasts stable-id convention). */
export function idToastAyuda(conversacionId: number): string {
  return `crm-ayuda-${conversacionId}`;
}

/** Collapse whitespace and cut at LARGO_CONSULTA_TOAST chars + ellipsis. */
function recortarConsulta(consulta: string): string {
  const texto = consulta.replace(/\s+/g, ' ').trim();
  return texto.length > LARGO_CONSULTA_TOAST ? `${texto.slice(0, LARGO_CONSULTA_TOAST - 1)}…` : texto;
}

/**
 * Fire ONE help toast (mockup copy, Spanish verbatim): title
 * 'La Guía necesita tu ayuda · <etiqueta>', description
 * '«<consulta>» está fuera de su alcance. Te espera una indicación.'
 * ('Te espera una indicación.' alone when the consulta is null —
 * repo without the solicitud capability or row resolved mid-poll).
 */
function dispararToastAyuda(
  detalle: DetalleAyudaNotificacion,
  router: ReturnType<typeof useRouter>,
): void {
  const id = idToastAyuda(detalle.conversacionId);
  toast(`La Guía necesita tu ayuda · ${detalle.etiqueta}`, {
    id,
    description:
      detalle.consulta === null
        ? 'Te espera una indicación.'
        : `«${recortarConsulta(detalle.consulta)}» está fuera de su alcance. Te espera una indicación.`,
    action: {
      label: 'Ver conversación',
      onClick: () => {
        router.push(`/crm/conversaciones?conversacion=${detalle.conversacionId}`);
        toast.dismiss(id);
      },
    },
  });
}

export interface UseNotificacionesConversacionesResult {
  /** Último resumen válido (null hasta la primera respuesta OK). */
  resumen: ResumenNotificaciones | null;
  /** true hasta el primer resumen (no reflashea en fallos). */
  cargando: boolean;
}

export function useNotificacionesConversaciones(
  habilitado: boolean,
): UseNotificacionesConversacionesResult {
  const [resumen, setResumen] = useState<ResumenNotificaciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const mountedRef = useRef(true);
  const vistosRef = useRef<Set<number>>(new Set());
  // useSearchParams/usePathname re-render, pero el router de Next es
  // estable — como dep del callback no re-arma el polling.
  const router = useRouter();

  // Toast side-effect on every successful poll (see docblock): unseen
  // ids toast once; ids that left the detalle get pruned so a NEW
  // solicitud re-toasts — only while the window shows every pending.
  const procesarResumen = useCallback((nuevo: ResumenNotificaciones): void => {
    const detalle = nuevo.requiereAyudaDetalle ?? [];
    for (const fila of detalle) {
      if (vistosRef.current.has(fila.conversacionId)) continue;
      vistosRef.current.add(fila.conversacionId);
      dispararToastAyuda(fila, router);
    }
    if (detalle.length >= nuevo.requiereAyuda) {
      const pendientes = new Set(detalle.map((fila) => fila.conversacionId));
      for (const id of vistosRef.current) {
        if (!pendientes.has(id)) vistosRef.current.delete(id);
      }
    }
  }, [router]);

  const fetchOnce = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(RUTA_NOTIFICACIONES, { method: 'GET' });
      if (!mountedRef.current) return;
      const json: unknown = await response.json().catch(() => ({}));
      if (!mountedRef.current) return;
      // Stale-while-error silencioso: badge global, jamás grita.
      if (!response.ok || !esResumenNotificaciones(json)) return;
      const nuevo: ResumenNotificaciones = {
        requiereAyuda: json.requiereAyuda,
        pendienteVinculacion: json.pendienteVinculacion,
        total: json.total,
        ultimaActividad: json.ultimaActividad,
        requiereAyudaDetalle: json.requiereAyudaDetalle ?? [],
      };
      procesarResumen(nuevo);
      setResumen(nuevo);
      setCargando(false);
    } catch {
      // Red caída / abort: conserva el último resumen en silencio.
    }
  }, [procesarResumen]);

  // Carga inmediata + polling ligero (useConversaciones precedent):
  // la pestaña oculta salta el refresh; el unmount limpia el timer.
  useEffect(() => {
    if (!habilitado) return;
    mountedRef.current = true;
    void fetchOnce();
    const intervalo = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchOnce();
    }, INTERVALO_POLLING_NOTIFICACIONES_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalo);
    };
  }, [habilitado, fetchOnce]);

  return { resumen, cargando };
}
