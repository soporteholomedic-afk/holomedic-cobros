'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AlertaCrm, ResumenAlertas } from '../../application/calcularAlertas';

/** Mirror of `Notification.permission`, plus `unsupported` when the API is absent. */
export type SoporteNotificaciones = 'unsupported' | 'default' | 'granted' | 'denied';

export interface EstadoNotificaciones {
  soporte: SoporteNotificaciones;
  /** The user's switch: true only with granted permission AND persisted opt-in. */
  activado: boolean;
  activar: () => Promise<'granted' | 'denied' | 'unsupported'>;
  desactivar: () => void;
}

const INTERVALO_MS = 60_000;
const TAG = 'crm-alertas';
const llave = (idUsuario: string): string => `crm-notificaciones-nav:${idUsuario}`;
const identidad = (a: AlertaCrm): string => `${a.clase}:${a.idEmpresa}`;

/** "2 vencidas · 1 hoy · 1 sin responder". */
function cuerpoDe(nuevas: AlertaCrm[]): string {
  const conteo = { accion_vencida: 0, accion_hoy: 0, sin_responder: 0 } as Record<AlertaCrm['clase'], number>;
  for (const a of nuevas) conteo[a.clase]++;
  const partes: string[] = [];
  if (conteo.accion_vencida) partes.push(`${conteo.accion_vencida} vencida${conteo.accion_vencida === 1 ? '' : 's'}`);
  if (conteo.accion_hoy) partes.push(`${conteo.accion_hoy} vence${conteo.accion_hoy === 1 ? '' : 'n'} hoy`);
  if (conteo.sin_responder) partes.push(`${conteo.sin_responder} sin responder`);
  return `${partes.join(' · ')} — abrí el CRM para verlas`;
}

/**
 * Browser front of crm-notificaciones (S1): while the user's switch is on
 * (localStorage per user, needs granted permission) it polls /api/crm/alertas
 * every minute and fires ONE notification per batch of NEW alerts — same
 * alerts never re-notify; acting on the empresa makes them vanish. The tab
 * must stay open (no service worker / push in v1).
 *
 * The switch does NOT gate the in-app panel: with the switch off the user
 * still gets the "Tu día" panel and, per S2, the activation banner stays.
 */
export function useNotificacionesNavegador({ idUsuario }: { idUsuario: string | null }): EstadoNotificaciones {
  const [permiso, setPermiso] = useState<SoporteNotificaciones>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? (Notification.permission as SoporteNotificaciones) : 'unsupported',
  );

  // The persisted switch is read when the hook first renders with a known
  // user, and re-read at render time when the user changes (React's
  // adjust-state-during-render pattern; no setState inside effects).
  const [usuarioPrevio, setUsuarioPrevio] = useState<string | null>(idUsuario);
  const [preferencia, setPreferencia] = useState<boolean>(() =>
    idUsuario !== null && permiso === 'granted' ? localStorage.getItem(llave(idUsuario)) === '1' : false,
  );
  if (idUsuario !== usuarioPrevio) {
    setUsuarioPrevio(idUsuario);
    setPreferencia(idUsuario !== null && permiso === 'granted' ? localStorage.getItem(llave(idUsuario)) === '1' : false);
  }

  const activado = preferencia && permiso === 'granted';
  const conocidas = useRef<Set<string>>(new Set());

  const activar = useCallback(async (): Promise<'granted' | 'denied' | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    const resultado = (await Notification.requestPermission()) as SoporteNotificaciones;
    setPermiso(resultado);
    if (resultado === 'granted') {
      setPreferencia(true);
      if (idUsuario) localStorage.setItem(llave(idUsuario), '1');
      return 'granted';
    }
    return 'denied';
  }, [idUsuario]);

  const desactivar = useCallback((): void => {
    setPreferencia(false);
    conocidas.current = new Set();
    if (idUsuario) localStorage.removeItem(llave(idUsuario));
  }, [idUsuario]);

  // Poll while on: first consult fires once with whatever is pending (the
  // explicit intent of the switch), later ones only for NEW alerts.
  useEffect(() => {
    if (!activado || typeof window === 'undefined' || !('Notification' in window)) return;
    let viva = true;
    const consultar = async (): Promise<void> => {
      try {
        const res = await fetch('/api/crm/alertas');
        if (!res.ok) return;
        const body = (await res.json()) as { success?: boolean; alertas?: AlertaCrm[]; resumen?: ResumenAlertas };
        if (!body?.success || !Array.isArray(body.alertas)) return;
        const actuales = new Set(body.alertas.map(identidad));
        const nuevas = body.alertas.filter((a) => !conocidas.current.has(identidad(a)));
        conocidas.current = actuales;
        if (nuevas.length === 0) return;
        const aviso = new Notification('CRM: seguimientos pendientes', { body: cuerpoDe(nuevas), tag: TAG });
        aviso.onclick = (): void => {
          window.focus();
          window.location.assign('/crm');
        };
      } catch {
        // offline or endpoint down: the next tick retries
      }
    };
    void consultar();
    const temporizador = setInterval(() => {
      if (viva) void consultar();
    }, INTERVALO_MS);
    return () => {
      viva = false;
      clearInterval(temporizador);
    };
  }, [activado]);

  return { soporte: permiso, activado, activar, desactivar };
}
