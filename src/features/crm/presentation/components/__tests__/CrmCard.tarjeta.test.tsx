import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { Empresa } from '../../../domain/entities';
import { CrmCard } from '../CrmCard';
import { empresa } from './crmFixtures';

const AHORA = new Date('2026-10-31T15:00:00Z');
const HOY = '2026-10-31';

function pintar(e: Empresa, extra: { onAbrir?: (id: string) => void; onSugerencia?: (id: string, a: 'perder' | 'seguir') => void } = {}) {
  render(
    <CrmCard
      empresa={e}
      anterior={undefined}
      siguiente={undefined}
      onMover={vi.fn()}
      onEditarMedio={vi.fn()}
      onEditarMotivo={vi.fn()}
      onAbrir={extra.onAbrir ?? vi.fn()}
      seleccionada={false}
      onDragStart={vi.fn()}
      ahora={AHORA}
      hoy={HOY}
      onSugerencia={extra.onSugerencia ?? vi.fn()}
      onRegistrar={vi.fn()}
    />,
  );
  return screen.getByRole('article');
}

describe('CrmCard — RUC (S6)', () => {
  it('shows "RUC <ruc>" and no mark when the empresa has a RUC', () => {
    const c = pintar(empresa());
    expect(within(c).getByText('RUC 20512345678')).toBeInTheDocument();
    expect(within(c).queryByText('Falta RUC')).toBeNull();
  });

  it('shows an amber "Falta RUC" mark with an icon when the RUC is null', () => {
    const c = pintar(empresa({ ruc: null }));
    const marca = within(c).getByText('Falta RUC');
    expect(marca.className).toMatch(/bg-amber-100/);
    expect(marca.className).toMatch(/text-amber-800/);
    expect(marca.className).toMatch(/border-amber-500\/45/);
    expect(marca.className).toMatch(/rounded-lg/);
    expect(marca.className).toMatch(/text-xs/);
    expect(marca.className).toMatch(/font-semibold/);
    expect(marca.querySelector('svg')).not.toBeNull();
    expect(within(c).queryByText(/^RUC /)).toBeNull();
  });
});

describe('CrmCard — follow-up label (S4)', () => {
  it('conversamos: emerald with an icon', () => {
    const c = pintar(empresa({ etapa: 'contactado', medio: 'llamada' }));
    const l = within(c).getByText('Conversamos');
    expect(l.className).toMatch(/text-emerald-800/);
    expect(l.querySelector('svg')).not.toBeNull();
  });

  it('sin_respuesta: amber with an icon', () => {
    const c = pintar(empresa({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 2 }));
    const l = within(c).getByText('Sin respuesta · 2');
    expect(l.className).toMatch(/bg-amber-100/);
    expect(l.querySelector('svg')).not.toBeNull();
  });

  it('falta_responder: amber with the waiting time', () => {
    const c = pintar(empresa({ etapa: 'contactado', medio: 'correo', faltaResponderDesde: '2026-10-31T12:00:00Z' }));
    const l = within(c).getByText('Falta responder · hace 3 h');
    expect(l.className).toMatch(/text-amber-800/);
    expect(l.querySelector('svg')).not.toBeNull();
  });

  it('intentos: slate label outside Contactado', () => {
    const c = pintar(empresa({ etapa: 'por_contactar', intentosSinRespuesta: 1 }));
    const l = within(c).getByText('1 intento sin respuesta');
    expect(l.className).toMatch(/bg-slate-50/);
    expect(l.className).toMatch(/text-slate-700/);
  });

  it('renders as before for an empresa with a RUC and no follow-up state', () => {
    const c = pintar(empresa());
    expect(within(c).getByText('Constructora Andina S.A.C.')).toBeInTheDocument();
    expect(within(c).getByText('RUC 20512345678')).toBeInTheDocument();
    expect(within(c).getByText('Construcción')).toBeInTheDocument();
    expect(within(c).getByText('Marcela Quispe')).toBeInTheDocument();
    expect(within(c).getByText('987 654 321')).toBeInTheDocument();
    expect(within(c).queryByText(/Próximo|Vencida|Conversamos|Sin respuesta|Falta/)).toBeNull();
    expect(within(c).queryByRole('group')).toBeNull();
    expect(within(c).queryByText(/Medio:/)).toBeNull();
  });
});

describe('CrmCard — next action (S8)', () => {
  it('future: "Próximo: <acción> · <fecha>" with a calendar icon', () => {
    const c = pintar(empresa({ proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } }));
    const t = within(c).getByText('Próximo: Llamar · mar 3 nov');
    expect(t.className).not.toMatch(/text-red-800/);
    expect(t.querySelector('svg')).not.toBeNull();
  });

  it('today renders like future', () => {
    const c = pintar(empresa({ proximaAccion: { tipo: 'cotizar', detalle: null, fecha: HOY } }));
    expect(within(c).getByText('Próximo: Enviar cotización · sáb 31 oct')).toBeInTheDocument();
  });

  it('overdue: "Vencida: …" in red-800 semibold', () => {
    const c = pintar(empresa({ proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-10-29' } }));
    const t = within(c).getByText('Vencida: Llamar · jue 29 oct');
    expect(t.className).toMatch(/text-red-800/);
    expect(t.className).toMatch(/font-semibold/);
    expect(within(c).queryByText(/^Próximo/)).toBeNull();
  });

  it('"otro" shows the detail as the action text', () => {
    const c = pintar(empresa({ proximaAccion: { tipo: 'otro', detalle: 'Visitar planta', fecha: '2026-11-03' } }));
    expect(within(c).getByText('Próximo: Visitar planta · mar 3 nov')).toBeInTheDocument();
  });

  it('"otro" without detail falls back to the label', () => {
    const c = pintar(empresa({ proximaAccion: { tipo: 'otro', detalle: null, fecha: '2026-11-03' } }));
    expect(within(c).getByText('Próximo: Otro · mar 3 nov')).toBeInTheDocument();
  });

  it('shows nothing without next action or in Cliente/Perdido', () => {
    const c = pintar(empresa({ etapa: 'cliente', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } }));
    expect(within(c).queryByText(/Próximo|Vencida/)).toBeNull();
  });
});

describe('CrmCard — medium chip', () => {
  it('shows the free text when the medium is "otro"', () => {
    const c = pintar(empresa({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria Expomina' }));
    expect(within(c).getByRole('button', { name: 'Medio: Feria Expomina' })).toBeInTheDocument();
  });

  it('shows the label for the other media', () => {
    const c = pintar(empresa({ etapa: 'contactado', medio: 'correo' }));
    expect(within(c).getByRole('button', { name: 'Medio: Correo' })).toBeInTheDocument();
  });
});

describe('CrmCard — Perdido suggestion (S2)', () => {
  const con3 = () => empresa({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 3 });

  it('shows the amber group with the text and both buttons', () => {
    const c = pintar(con3());
    const g = within(c).getByRole('group', { name: 'Sugerencia para Constructora Andina S.A.C.' });
    expect(within(g).getByText('3 intentos sin respuesta. ¿Pasar a Perdido con el motivo «No contestan»?')).toBeInTheDocument();
    expect(within(g).getByRole('button', { name: 'Pasar a Perdido' })).toBeInTheDocument();
    expect(within(g).getByRole('button', { name: 'Seguir intentando' })).toBeInTheDocument();
    expect(g.className).toMatch(/bg-amber-100/);
  });

  it('the buttons call back without opening the detail', () => {
    const onAbrir = vi.fn();
    const onSugerencia = vi.fn();
    const c = pintar(con3(), { onAbrir, onSugerencia });
    fireEvent.click(within(c).getByRole('button', { name: 'Pasar a Perdido' }));
    fireEvent.click(within(c).getByRole('button', { name: 'Seguir intentando' }));
    expect(onSugerencia.mock.calls).toEqual([
      ['e-1', 'perder'],
      ['e-1', 'seguir'],
    ]);
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it('hidden below 3 attempts', () => {
    expect(within(pintar(empresa({ intentosSinRespuesta: 2 }))).queryByRole('group')).toBeNull();
  });

  it('hidden once dismissed at the same count', () => {
    expect(within(pintar({ ...con3(), sugerenciaDescartadaEn: 3 })).queryByRole('group')).toBeNull();
  });
});
