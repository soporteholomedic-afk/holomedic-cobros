'use client';

import { BellOff, BellRing } from 'lucide-react';

import { useAuth } from '@/features/auth/presentation/hooks/useAuth';

import { useNotificacionesNavegador } from './useNotificacionesNavegador';

/**
 * crm-notificaciones (S1/S2): the browser-notification front for `crm`
 * users, mounted once in the session shell. While the switch is OFF an
 * amber banner sits at the very top of every page and does NOT go away —
 * only activation (granted permission + opt-in) removes it; a denied
 * permission keeps the banner with a hint and a disabled switch. Once ON
 * it becomes a slim status bar that offers the switch off.
 */
export function BannerNotificaciones() {
  const { user, loading } = useAuth();
  const esCrm = user?.permisos.includes('crm') ?? false;
  const { soporte, activado, activar, desactivar } = useNotificacionesNavegador({ idUsuario: user?.idUsuario ?? null });

  if (loading || !esCrm || soporte === 'unsupported') return null;

  if (activado) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-slate-200 bg-white/80 px-6 py-1.5 text-xs text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400"
      >
        <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="flex-1">Notificaciones del navegador activadas</span>
        <button
          type="button"
          role="switch"
          aria-checked="true"
          onClick={desactivar}
          className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Desactivar notificaciones del navegador
        </button>
      </div>
    );
  }

  const bloqueado = soporte === 'denied';
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100"
    >
      <BellOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-64">
        {bloqueado
          ? 'Las notificaciones del navegador están bloqueadas para este sitio: habilítalas en la configuración del sitio para enterarte de los seguimientos pendientes.'
          : 'Activa las notificaciones del navegador para enterarte de seguimientos vencidos y respuestas pendientes aunque estés en otra página.'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked="false"
        disabled={bloqueado}
        onClick={() => void activar()}
        className="inline-flex items-center gap-2 rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-slate-800"
      >
        <span aria-hidden="true" className={`inline-block h-4 w-7 rounded-full p-0.5 ${bloqueado ? 'bg-slate-300 dark:bg-slate-700' : 'bg-amber-300 dark:bg-amber-800'}`}>
          <span aria-hidden="true" className={`block h-3 w-3 rounded-full bg-white shadow ${bloqueado ? '' : 'translate-x-3'}`} />
        </span>
        Activar notificaciones del navegador
      </button>
    </div>
  );
}
