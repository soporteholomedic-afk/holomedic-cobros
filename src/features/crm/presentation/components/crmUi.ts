import { Mail, MessageCircle, MoreHorizontal, Phone, type LucideIcon } from 'lucide-react';

import { MOTIVO_CAMPOS, SECTORES_INICIALES, type Empresa, type Etapa, type Medio } from '../../domain/entities';

/** Color of the dot that goes next to each stage name (board columns and detail header). */
export const ETAPA_PUNTO: Record<Etapa, string> = {
  por_contactar: 'bg-slate-400',
  contactado: 'bg-sky-500',
  en_seguimiento: 'bg-amber-500',
  cliente: 'bg-emerald-500',
  perdido: 'bg-red-500',
};

export const INPUT =
  'w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export const BOTON_PRIMARIO =
  'h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-sky-600/25 hover:brightness-110 disabled:opacity-60';

export const BOTON_SECUNDARIO =
  'h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

export const ALERTA =
  'rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200';

/** Icon and colors of each contact medium: chip on the card, tile in the dialog. */
export const MEDIO_ESTILO: Record<Medio, { icono: LucideIcon; chip: string; casilla: string }> = {
  llamada: {
    icono: Phone,
    chip: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
    casilla: 'text-sky-800 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 dark:text-sky-200 dark:has-[:checked]:bg-sky-950/40',
  },
  correo: {
    icono: Mail,
    chip: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
    casilla: 'text-red-800 has-[:checked]:border-red-500 has-[:checked]:bg-red-50 dark:text-red-200 dark:has-[:checked]:bg-red-950/40',
  },
  whatsapp: {
    icono: MessageCircle,
    chip: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    casilla: 'text-emerald-800 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 dark:text-emerald-200 dark:has-[:checked]:bg-emerald-950/40',
  },
  otro: {
    icono: MoreHorizontal,
    chip: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
    casilla: 'text-slate-700 has-[:checked]:border-slate-500 has-[:checked]:bg-slate-100 dark:text-slate-200 dark:has-[:checked]:bg-slate-800',
  },
};

/** The six initial sectors keep the color of the approved design, by position. */
const COLOR_INICIALES = [
  'bg-amber-100 text-amber-800',
  'bg-slate-200 text-slate-700',
  'bg-blue-100 text-blue-800',
  'bg-teal-100 text-teal-800',
  'bg-pink-100 text-pink-800',
  'bg-violet-100 text-violet-800',
] as const;

/** Sectors created later get one of these, picked from the name so it never changes. */
const COLOR_NUEVOS = [
  'bg-lime-100 text-lime-800',
  'bg-orange-100 text-orange-800',
  'bg-cyan-100 text-cyan-800',
  'bg-fuchsia-100 text-fuchsia-800',
] as const;

export function colorDeSector(sector: string | null): string {
  if (!sector) return 'bg-slate-200 text-slate-700';
  const minuscula = sector.toLowerCase();
  const inicial = SECTORES_INICIALES.findIndex((x) => x.toLowerCase() === minuscula);
  if (inicial >= 0) return COLOR_INICIALES[inicial] ?? COLOR_INICIALES[0];
  let h = 0;
  for (const ch of minuscula) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_NUEVOS[h % COLOR_NUEVOS.length] ?? COLOR_NUEVOS[0];
}

/** Summary lines of the loss reason, e.g. "Ofrecimos: S/ 7,000". */
export function lineasDeMotivo(e: Empresa): string[] {
  const m = e.motivo;
  if (!m) return [];
  const campos = MOTIVO_CAMPOS[m.categoria];
  const lineas: string[] = [];
  if (campos.detalle1 && m.detalle1) lineas.push(`${campos.detalle1.resumen}: ${m.detalle1}`);
  if (campos.detalle2 && m.detalle2) lineas.push(`${campos.detalle2.resumen}: ${m.detalle2}`);
  if (m.notas) lineas.push(m.notas);
  return lineas;
}
