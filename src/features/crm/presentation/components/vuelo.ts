import type { Etapa } from '../../domain/entities';

/** Same curve as the approved design (Material "standard"). */
export const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

type Foco = { tipo: 'tarjeta' } | { tipo: 'flecha'; mover: string } | null;

/** What the DOM looked like just before a card changed column. */
export interface Captura {
  id: string;
  origen: DOMRect;
  /** Copy of the card that will travel above the board (columns clip what overflows them). */
  clon: HTMLElement | null;
  /** Position of the other cards of both columns, to slide them to their new place. */
  vecinas: Map<string, DOMRect>;
  foco: Foco;
  /** False with prefers-reduced-motion or when the browser has no Element.animate. */
  anima: boolean;
}

/** In-flight trips, by empresa id. Each entry finishes its trip right now. */
export type Registro = Map<string, (conFoco: boolean) => void>;

export function movimientoReducido(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function tarjetaDe(id: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[data-empresa-id]')].find((e) => e.dataset.empresaId === id) ?? null;
}

function columna(etapa: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('section[data-etapa]')].find((s) => s.dataset.etapa === etapa) ?? null;
}

/** Take the "before" picture. Call it right before the list is replaced; `null` when the card is not on screen. */
export function capturar(id: string, destino: Etapa): Captura | null {
  const el = tarjetaDe(id);
  if (!el) return null;

  const activo = document.activeElement;
  let foco: Foco = null;
  if (activo === el) foco = { tipo: 'tarjeta' };
  else if (activo instanceof HTMLElement && el.contains(activo) && activo.dataset.mover) {
    foco = { tipo: 'flecha', mover: activo.dataset.mover };
  }

  const anima = !movimientoReducido() && typeof el.animate === 'function';
  const vecinas = new Map<string, DOMRect>();
  let clon: HTMLElement | null = null;
  const destinoEl = columna(destino);
  if (destinoEl && typeof destinoEl.scrollIntoView === 'function') {
    destinoEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const origen = el.getBoundingClientRect();
  if (anima) {
    const columnas = new Set([el.closest('section'), destinoEl]);
    for (const col of columnas) {
      col?.querySelectorAll<HTMLElement>('[data-empresa-id]').forEach((v) => {
        const vid = v.dataset.empresaId;
        if (vid && vid !== id) vecinas.set(vid, v.getBoundingClientRect());
      });
    }
    clon = el.cloneNode(true) as HTMLElement;
    for (const a of ['data-empresa-id', 'tabindex', 'aria-current', 'draggable', 'data-destello']) clon.removeAttribute(a);
  }
  return { id, origen, clon, vecinas, foco, anima };
}

function restaurarFoco(el: HTMLElement, foco: Foco) {
  if (!foco) return;
  if (foco.tipo === 'tarjeta') {
    el.focus({ preventScroll: true });
    return;
  }
  const boton =
    el.querySelector<HTMLElement>(`[data-mover="${foco.mover}"]:not(:disabled)`) ??
    el.querySelector<HTMLElement>('[data-mover]:not(:disabled)');
  boton?.focus({ preventScroll: true });
}

/** Blink the card so the eye finds it. The attribute is removed when the CSS animation ends. */
function destellar(el: HTMLElement, modo: 'normal' | 'reducido') {
  el.removeAttribute('data-destello');
  void el.offsetWidth; // restart the animation if it was still running
  el.setAttribute('data-destello', modo);
  const alTerminar = (ev: Event) => {
    if (ev.target !== el) return;
    el.removeAttribute('data-destello');
    el.removeEventListener('animationend', alTerminar);
  };
  el.addEventListener('animationend', alTerminar);
}

/**
 * Play the trip once the card sits in its new column: the copy flies over the
 * board while the real card waits hidden, the neighbours slide, and on arrival
 * the card blinks and gets its focus back. Without animation it just blinks.
 */
export function reproducir(c: Captura, registro: Registro): void {
  const el = tarjetaDe(c.id);
  if (!el) return;
  const reducido = movimientoReducido();
  let terminado = false;
  let copia: HTMLElement | null = null;
  let viaje: Animation | null = null;

  const fin = (conFoco: boolean) => {
    if (terminado) return;
    terminado = true;
    registro.delete(c.id);
    viaje?.cancel();
    copia?.remove();
    const actual = tarjetaDe(c.id);
    if (!actual) return;
    actual.style.visibility = '';
    destellar(actual, reducido ? 'reducido' : 'normal');
    if (conFoco) restaurarFoco(actual, c.foco);
  };

  const lista = el.parentElement;
  if (lista) lista.scrollTop = 0;
  if (!c.anima || !c.clon) {
    fin(true);
    return;
  }

  const destino = el.getBoundingClientRect();
  c.vecinas.forEach((antes, vid) => {
    const v = tarjetaDe(vid);
    if (!v) return;
    const ahora = v.getBoundingClientRect();
    const x = antes.left - ahora.left;
    const y = antes.top - ahora.top;
    if (x || y) v.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: 320, easing: EASE });
  });

  const dx = destino.left - c.origen.left;
  const dy = destino.top - c.origen.top;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    fin(true);
    return;
  }

  copia = c.clon;
  copia.setAttribute('data-testid', 'crm-ghost');
  copia.setAttribute('aria-hidden', 'true');
  copia.setAttribute('inert', '');
  copia.className += ' fixed pointer-events-none z-[70] !m-0 cursor-grabbing !border-sky-500 shadow-2xl will-change-transform';
  Object.assign(copia.style, {
    left: `${c.origen.left}px`,
    top: `${c.origen.top}px`,
    width: `${c.origen.width}px`,
    height: `${c.origen.height}px`,
  });
  document.body.append(copia);
  el.style.visibility = 'hidden';

  const duracion = Math.round(Math.min(760, Math.max(380, 320 + dist * 0.45)));
  registro.set(c.id, fin);
  viaje = copia.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(1.04)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)` },
    ],
    { duration: duracion, easing: EASE, fill: 'forwards' },
  );
  viaje.onfinish = () => fin(true);
}
