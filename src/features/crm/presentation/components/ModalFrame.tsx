'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: ReactNode;
}

/**
 * Centered dialog over a dimmed backdrop. Escape and a click on the backdrop
 * close it, focus enters on open and returns to where it was on close.
 */
export function ModalFrame({ titulo, subtitulo, onCerrar, children }: Props) {
  const tituloId = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);

  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    caja.current
      ?.querySelector<HTMLElement>('input:checked, input, textarea, select, button')
      ?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      cerrar.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previo && previo.isConnected) previo.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="flex max-h-full w-[460px] max-w-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 id={tituloId} className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {titulo}
        </h2>
        {subtitulo && <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">{subtitulo}</p>}
        {children}
      </div>
    </div>
  );
}
