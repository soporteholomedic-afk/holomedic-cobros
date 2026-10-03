'use client';

import { Building2, Hourglass, MailPlus, ThumbsDown, ThumbsUp, Timer } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ConteosPanel } from '../../panelDerivado';

/**
 * KpiCards (task 8.2, design D4, spec OP-2) — the 6 "Resumen de
 * Cifras en Palabras Sencillas" cards. Every number is rendered AS-IS
 * from `conteos` (tallied once by derivarPanel): the component NEVER
 * recounts, so each KPI equals its tab count by construction. Labels
 * and subtitles are verbatim from the design mock; the first card
 * carries the "N clientes / M posibles" split. Per-status colors are
 * part of the mock layout here (plain cards, no interaction to test —
 * strict-tdd bans asserting classes, the LABELS are the contract).
 */

interface TarjetaKpi {
  etiqueta: string;
  valor: number;
  subtitulo: ReactNode;
  icono: typeof Building2;
  /** Mock color tone per card (label / value / subtitle / icon chip). */
  tono: {
    etiqueta: string;
    valor: string;
    subtitulo: string;
    icono: string;
  };
  /** Colored dot before the label (positivos / sin interés / pausa). */
  punto?: string;
  /** Grid span of the wide first card (mock layout). */
  ancha?: boolean;
}

export interface KpiCardsProps {
  /** Tallied counts from derivarPanel — rendered verbatim. */
  conteos: ConteosPanel;
}

export function KpiCards({ conteos }: KpiCardsProps) {
  const tarjetas: TarjetaKpi[] = [
    {
      etiqueta: 'Empresas',
      valor: conteos.todas,
      subtitulo: `${conteos.clientes} clientes / ${conteos.posibles} posibles`,
      icono: Building2,
      tono: {
        etiqueta: 'text-slate-500 dark:text-slate-400',
        valor: 'text-slate-900 dark:text-white',
        subtitulo: 'text-slate-500 dark:text-slate-400',
        icono: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
      },
      ancha: true,
    },
    {
      etiqueta: 'En espera',
      valor: conteos.enEspera,
      subtitulo: '1 correo por semana',
      icono: Hourglass,
      tono: {
        etiqueta: 'text-slate-500 dark:text-slate-400',
        valor: 'text-amber-600 dark:text-amber-400',
        subtitulo: 'text-amber-700 dark:text-amber-400',
        icono: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
      },
    },
    {
      etiqueta: 'Positivos',
      valor: conteos.positivos,
      subtitulo: 'Tienen interés / Cotizan',
      icono: ThumbsUp,
      tono: {
        etiqueta: 'text-emerald-700 dark:text-emerald-400',
        valor: 'text-emerald-600 dark:text-emerald-400',
        subtitulo: 'text-emerald-800 dark:text-emerald-300',
        icono: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
      },
      punto: 'bg-emerald-500',
    },
    {
      etiqueta: 'Sin interés',
      valor: conteos.sinInteres,
      subtitulo: 'No desean por ahora',
      icono: ThumbsDown,
      tono: {
        etiqueta: 'text-rose-700 dark:text-rose-400',
        valor: 'text-rose-600 dark:text-rose-400',
        subtitulo: 'text-rose-700 dark:text-rose-400',
        icono: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400',
      },
      punto: 'bg-rose-500',
    },
    {
      etiqueta: 'Pausa 3 meses',
      valor: conteos.pausa3m,
      subtitulo: 'Vuelven el próx. trimestre',
      icono: Timer,
      tono: {
        etiqueta: 'text-purple-700 dark:text-purple-300',
        valor: 'text-purple-700 dark:text-purple-300',
        subtitulo: 'text-purple-600 dark:text-purple-400',
        icono: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
      },
      punto: 'bg-purple-500',
    },
    {
      etiqueta: 'Falta carta',
      valor: conteos.faltaCarta,
      subtitulo: 'Recién anotados',
      icono: MailPlus,
      tono: {
        etiqueta: 'text-slate-500 dark:text-slate-400',
        valor: 'text-slate-700 dark:text-slate-200',
        subtitulo: 'text-slate-500 dark:text-slate-400',
        icono: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
      },
    },
  ];

  return (
    <section
      aria-label="Resumen de cifras"
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6"
    >
      {tarjetas.map(({ etiqueta, valor, subtitulo, icono: Icono, tono, punto, ancha }) => (
        <div
          key={etiqueta}
          className={`flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs${
            ancha ? ' col-span-2 sm:col-span-1' : ''
          }`}
        >
          <div>
            <p
              className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${tono.etiqueta}`}
            >
              {punto !== undefined && (
                <span className={`inline-block h-2 w-2 rounded-full ${punto}`} aria-hidden="true" />
              )}
              {etiqueta}
            </p>
            <h3 className={`mt-1 text-2xl font-bold ${tono.valor}`}>{valor}</h3>
            <p className={`mt-0.5 text-[11px] ${tono.subtitulo}`}>{subtitulo}</p>
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tono.icono}`}
          >
            <Icono className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      ))}
    </section>
  );
}
