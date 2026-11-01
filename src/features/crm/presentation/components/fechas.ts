/**
 * Calendar-day helpers for the CRM. Days travel as `YYYY-MM-DD` strings and
 * months as `YYYY-MM`; every computation runs in UTC so the local time zone
 * never shifts a day. None of these read the current time: callers pass `hoy`
 * or `ahora`.
 */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

export const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** Column headers of the month grid, Monday first. */
export const DIAS_SEMANA = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'] as const;

function aFecha(dia: string): Date {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function aTexto(f: Date): string {
  return f.toISOString().slice(0, 10);
}

export function sumarDias(dia: string, n: number): string {
  const f = aFecha(dia);
  f.setUTCDate(f.getUTCDate() + n);
  return aTexto(f);
}

const esHabil = (dia: string): boolean => {
  const d = aFecha(dia).getUTCDay();
  return d !== 0 && d !== 6;
};

/** `n` working days (Monday to Friday) after `dia`. */
export function sumarDiasHabiles(dia: string, n: number): string {
  let actual = dia;
  let faltan = n;
  while (faltan > 0) {
    actual = sumarDias(actual, 1);
    if (esHabil(actual)) faltan--;
  }
  return actual;
}

export const esFinDeSemana = (dia: string): boolean => !esHabil(dia);

/** `dia` itself when it is a working day, else the next Monday. */
export function primerDiaHabil(dia: string): string {
  let actual = dia;
  while (!esHabil(actual)) actual = sumarDias(actual, 1);
  return actual;
}

/** Whole days from `desde` to `hasta` (negative when `hasta` is earlier). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000);
}

/** Same day number `n` months away; clamps to the last day (31 Jan + 1 month = 28 Feb). */
export function sumarMesesADia(dia: string, n: number): string {
  const mes = sumarMeses(mesDe(dia), n);
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(Number(dia.slice(8)), ultimo)).padStart(2, '0')}`;
}

/** Calendar day (`YYYY-MM-DD`) of the instant `ahora` in `zona`; late evening in Lima is still "today" there. */
export function hoyEnZona(ahora: Date, zona = 'America/Lima'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

export const esPasada = (dia: string, hoy: string): boolean => dia < hoy;

/** "sáb 31 oct". */
export function formatoCorto(dia: string): string {
  const f = aFecha(dia);
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
}

/** "sábado 31 de octubre de 2026", for screen readers. */
export function formatoLargo(dia: string): string {
  const f = aFecha(dia);
  const largo = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][f.getUTCDay()];
  return `${largo} ${f.getUTCDate()} de ${MESES_LARGOS[f.getUTCMonth()]} de ${f.getUTCFullYear()}`;
}

/** "hace un momento", "hace 25 min", "hace 3 h", "hace 2 d". */
export function formatoRelativo(iso: string, ahora: Date): string {
  const min = Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export const mesDe = (dia: string): string => dia.slice(0, 7);

export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  return aTexto(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
}

/** "noviembre 2026". */
export function nombreDelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_LARGOS[m - 1]} ${y}`;
}

/** Weeks of a month, Monday first; `null` fills the days of other months. */
export function semanasDelMes(mes: string): (string | null)[][] {
  const primero = aFecha(`${mes}-01`);
  const blancos = (primero.getUTCDay() + 6) % 7;
  const ultimo = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)).getUTCDate();
  const celdas: (string | null)[] = Array.from({ length: blancos }, () => null);
  for (let d = 1; d <= ultimo; d++) celdas.push(`${mes}-${String(d).padStart(2, '0')}`);
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

/** Monday of the week of `dia`. */
export function inicioDeSemana(dia: string): string {
  return sumarDias(dia, -((aFecha(dia).getUTCDay() + 6) % 7));
}
