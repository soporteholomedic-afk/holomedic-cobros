/**
 * Shared Tailwind class sets for the /admin/crm/configuracion surface
 * (agente-ia-crm E5·T6). Every colored surface ships paired light/dark
 * variants, every interactive control a visible focus ring and every
 * transition respects `prefers-reduced-motion`.
 */

const ANILLO_FOCO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-slate-900';

export const CLASES_INPUT =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 read-only:bg-slate-50 dark:read-only:bg-slate-900 focus-visible:outline-none focus-visible:border-sky-600 dark:focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-600/40 dark:focus-visible:ring-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400';

export const CLASES_BOTON_PRIMARIO = `inline-flex items-center justify-center rounded-lg bg-sky-700 dark:bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 dark:hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors motion-reduce:transition-none ${ANILLO_FOCO}`;

export const CLASES_BOTON_SECUNDARIO = `inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors motion-reduce:transition-none ${ANILLO_FOCO}`;

export const CLASES_BOTON_PELIGRO = `inline-flex items-center justify-center rounded-lg bg-red-700 dark:bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 dark:hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors motion-reduce:transition-none ${ANILLO_FOCO}`;

export const CLASES_TARJETA =
  'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6';

export const CLASES_ETIQUETA = 'text-sm font-medium text-slate-700 dark:text-slate-200';

export const CLASES_AYUDA = 'text-xs text-slate-600 dark:text-slate-400';

export const CLASES_ERROR_CAMPO = 'text-xs font-medium text-red-700 dark:text-red-400';

export const CLASES_AVISO_ERROR =
  'rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200';

export const CLASES_AVISO_OK =
  'rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200';

export const CLASES_AVISO_ADVERTENCIA =
  'rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-100';
