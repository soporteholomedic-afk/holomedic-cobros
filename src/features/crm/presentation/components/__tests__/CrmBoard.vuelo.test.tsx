import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { ETAPAS } from '../../../domain/entities';
import { CrmBoard } from '../CrmBoard';
import { mockApi } from './crmFixtures';

const TEXTILES = 'Textiles Pacífico S.A.C.';
const CONSTRUCTORA = 'Constructora Andina S.A.C.';

interface Animacion {
  el: Element;
  keyframes: Keyframe[];
  opciones: KeyframeAnimationOptions;
  onfinish: (() => void) | null;
  cancel: ReturnType<typeof vi.fn>;
}
let animaciones: Animacion[] = [];

/** jsdom has no Element.animate: a recorder stands in for it, the test finishes each animation by hand. */
function instalarAnimate() {
  animaciones = [];
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value(this: Element, keyframes: Keyframe[], opciones: KeyframeAnimationOptions) {
      const a: Animacion = { el: this, keyframes, opciones, onfinish: null, cancel: vi.fn() };
      animaciones.push(a);
      return a;
    },
  });
}

function instalarMatchMedia(reducido: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches: reducido }),
  });
}

const caja = (left: number, top: number) =>
  ({ left, top, right: left + 260, bottom: top + 90, width: 260, height: 90, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** Layout of a fake board: 300 px per column, 100 px per card inside the column. */
function instalarPosiciones() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const seccion = this.closest('section[data-etapa]');
    if (!this.hasAttribute('data-empresa-id') || !seccion) return caja(0, 0);
    const col = ETAPAS.indexOf(seccion.getAttribute('data-etapa') as (typeof ETAPAS)[number]);
    const fila = [...seccion.querySelectorAll('[data-empresa-id]')].indexOf(this);
    return caja(col * 300, fila * 100);
  });
}

const copias = () => document.querySelectorAll<HTMLElement>('[data-testid="crm-ghost"]');
const crudo = (id: string) => document.querySelector<HTMLElement>(`[data-empresa-id="${id}"]`) as HTMLElement;
const animacionDe = (el: Element) => animaciones.find((a) => a.el === el);

function tarjeta(nombre: string): HTMLElement {
  return screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;
}
const flecha = (nombre: string, destino: string) =>
  within(tarjeta(nombre)).getByRole('button', { name: new RegExp(`Mover .* a ${destino}`) });

async function cargado() {
  await screen.findByText(CONSTRUCTORA);
}

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
  Reflect.deleteProperty(window, 'matchMedia');
  vi.restoreAllMocks();
});

describe('Movimiento de tarjetas — traslado y parpadeo', () => {
  it('travels as a fixed copy above the board while the real card waits hidden in its column', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    await waitFor(() => expect(copias()).toHaveLength(1));
    const copia = copias()[0]!;
    expect(copia).toHaveAttribute('aria-hidden', 'true');
    expect(copia).not.toHaveAttribute('data-empresa-id');
    expect(copia.className).toMatch(/\bfixed\b/);
    expect(copia.className).toMatch(/pointer-events-none/);
    expect([copia.style.left, copia.style.top, copia.style.width, copia.style.height]).toEqual(['300px', '0px', '260px', '90px']);
    const real = crudo('e-3');
    expect(real.style.visibility).toBe('hidden');
    expect(real.closest('section')).toHaveAttribute('data-etapa', 'en_seguimiento');
    const a = animacionDe(copia)!;
    expect(a.keyframes.map((k) => k.transform)).toEqual([
      'translate(0px, 0px) scale(1)',
      'translate(150px, 0px) scale(1.04)',
      'translate(300px, 0px) scale(1)',
    ]);
    expect(a.keyframes[1]?.offset).toBe(0.5);
    expect(a.opciones).toMatchObject({ duration: 455, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
    expect(real).not.toHaveAttribute('data-destello');
  });

  it('on arrival the copy goes away, the card shows up and blinks, and the focus returns to the same arrow', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const boton = flecha(TEXTILES, 'En seguimiento');
    boton.focus();
    fireEvent.click(boton);
    await waitFor(() => expect(copias()).toHaveLength(1));
    animacionDe(copias()[0]!)!.onfinish?.();
    expect(copias()).toHaveLength(0);
    const real = crudo('e-3');
    expect(real.style.visibility).toBe('');
    expect(real).toHaveAttribute('data-destello', 'normal');
    expect(within(real).getByRole('button', { name: /Mover .* a Cliente/ })).toHaveFocus();
  });

  it('the blink ends with the animation; a second finish call does nothing more', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    await waitFor(() => expect(copias()).toHaveLength(1));
    const a = animacionDe(copias()[0]!)!;
    a.onfinish?.();
    expect(crudo('e-3')).toHaveAttribute('data-destello', 'normal');
    fireEvent.animationEnd(crudo('e-3'));
    expect(crudo('e-3')).not.toHaveAttribute('data-destello');
    a.onfinish?.();
    expect(crudo('e-3')).not.toHaveAttribute('data-destello');
  });

  it('a long trip (dragging across three columns) lasts longer than a short one', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const dataTransfer = { setData: vi.fn(), getData: () => 'e-4', effectAllowed: '' };
    fireEvent.dragStart(tarjeta('Agroindustrial Valle Verde S.A.C.'), { dataTransfer });
    fireEvent.drop(screen.getByRole('region', { name: 'Por contactar' }), { dataTransfer });
    await waitFor(() => expect(copias()).toHaveLength(1));
    expect(animacionDe(copias()[0]!)!.opciones.duration).toBe(725);
    expect(copias()[0]!.style.left).toBe('900px');
  });

  it('the other cards of both columns slide to their new place (320 ms)', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(CONSTRUCTORA, 'Contactado'));
    const dialogo = await screen.findByRole('dialog', { name: /Cómo lo contactaste/ });
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Llamada/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(copias()).toHaveLength(1));
    // e-2 was second in Por contactar and is now first; e-3 was first in Contactado and is now second
    expect(animacionDe(crudo('e-2'))!.keyframes).toEqual([{ transform: 'translate(0px, 100px)' }, { transform: 'none' }]);
    expect(animacionDe(crudo('e-2'))!.opciones).toMatchObject({ duration: 320 });
    expect(animacionDe(crudo('e-3'))!.keyframes).toEqual([{ transform: 'translate(0px, -100px)' }, { transform: 'none' }]);
    expect(animacionDe(crudo('e-5'))).toBeUndefined();
  });

  it('with prefers-reduced-motion nothing travels or slides: the card is just there, blinking softly, focus kept', async () => {
    instalarAnimate();
    instalarMatchMedia(true);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const boton = flecha(TEXTILES, 'En seguimiento');
    boton.focus();
    fireEvent.click(boton);
    await waitFor(() => expect(crudo('e-3').closest('section')).toHaveAttribute('data-etapa', 'en_seguimiento'));
    expect(copias()).toHaveLength(0);
    expect(animaciones).toHaveLength(0);
    expect(crudo('e-3').style.visibility).toBe('');
    expect(crudo('e-3')).toHaveAttribute('data-destello', 'reducido');
    expect(within(crudo('e-3')).getByRole('button', { name: /Mover .* a Cliente/ })).toHaveFocus();
  });

  it('without Element.animate (old browsers) the move still happens and the card still blinks', async () => {
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    await waitFor(() => expect(crudo('e-3').closest('section')).toHaveAttribute('data-etapa', 'en_seguimiento'));
    expect(copias()).toHaveLength(0);
    expect(crudo('e-3')).toHaveAttribute('data-destello', 'normal');
  });

  it('does not touch the focus when it was not on the card that moved', async () => {
    instalarAnimate();
    instalarMatchMedia(true);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const buscar = screen.getByRole('searchbox');
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    buscar.focus();
    await waitFor(() => expect(crudo('e-3').closest('section')).toHaveAttribute('data-etapa', 'en_seguimiento'));
    expect(buscar).toHaveFocus();
  });

  it('a trip cut short by the next move does not pull the focus back from where the user went', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const boton = flecha(TEXTILES, 'En seguimiento');
    boton.focus();
    fireEvent.click(boton);
    await waitFor(() => expect(copias()).toHaveLength(1));
    const buscar = screen.getByRole('searchbox');
    buscar.focus();
    fireEvent.click(flecha('Agroindustrial Valle Verde S.A.C.', 'En seguimiento'));
    await waitFor(() => expect(crudo('e-4').closest('section')).toHaveAttribute('data-etapa', 'en_seguimiento'));
    expect(crudo('e-3').style.visibility).toBe('');
    expect(buscar).toHaveFocus();
  });

  it('a card that ends up where it was (no distance) just blinks: no flying copy', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => caja(40, 40));
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    await waitFor(() => expect(crudo('e-3').closest('section')).toHaveAttribute('data-etapa', 'en_seguimiento'));
    expect(copias()).toHaveLength(0);
    expect(crudo('e-3').style.visibility).toBe('');
    expect(crudo('e-3')).toHaveAttribute('data-destello', 'normal');
  });

  it('a failed move shows no travel and no blink', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi({ etapa: () => ({ status: 500, body: { success: false, error: 'Error' } }) });
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(copias()).toHaveLength(0);
    expect(animaciones).toHaveLength(0);
    expect(document.querySelector('[data-destello]')).toBeNull();
  });

  it('editing the medium of a card does not make it travel or blink', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta(TEXTILES)).getByRole('button', { name: /Medio: Llamada/ }));
    const dialogo = screen.getByRole('dialog', { name: /Editar medio de contacto/ });
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Correo/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(fn.mock.calls.some(([u]) => String(u).endsWith('/seguimiento'))).toBe(true));
    await waitFor(() => expect(within(tarjeta(TEXTILES)).getByRole('button', { name: /Medio: Correo/ })).toBeInTheDocument());
    expect(copias()).toHaveLength(0);
    expect(animaciones).toHaveLength(0);
    expect(document.querySelector('[data-destello]')).toBeNull();
  });

  it('a new move while a card is still travelling finishes the first trip at once', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    await waitFor(() => expect(copias()).toHaveLength(1));
    const primera = animacionDe(copias()[0]!)!;
    fireEvent.click(flecha('Agroindustrial Valle Verde S.A.C.', 'En seguimiento'));
    await waitFor(() => expect(primera.cancel).toHaveBeenCalled());
    await waitFor(() => expect(crudo('e-4').closest('section')).toHaveAttribute('data-etapa', 'en_seguimiento'));
    expect(copias()).toHaveLength(1);
    expect(crudo('e-3').style.visibility).toBe('');
    expect(crudo('e-3')).toHaveAttribute('data-destello', 'normal');
    expect(crudo('e-4').style.visibility).toBe('hidden');
  });

  it('leaving the page in the middle of a trip removes the copy', async () => {
    instalarAnimate();
    instalarMatchMedia(false);
    instalarPosiciones();
    mockApi();
    const { unmount } = render(<CrmBoard />);
    await cargado();
    fireEvent.click(flecha(TEXTILES, 'En seguimiento'));
    await waitFor(() => expect(copias()).toHaveLength(1));
    const a = animacionDe(copias()[0]!)!;
    unmount();
    expect(copias()).toHaveLength(0);
    expect(a.cancel).toHaveBeenCalled();
  });

  it('the cards expose their column so the board can scroll to it', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    for (const etapa of ETAPAS) {
      expect(document.querySelectorAll(`section[data-etapa="${etapa}"]`)).toHaveLength(1);
    }
  });
});
