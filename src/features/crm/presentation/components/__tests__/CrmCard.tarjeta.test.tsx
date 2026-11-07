import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { Empresa, Oportunidad } from '../../../domain/entities';
import { CrmCard } from '../CrmCard';
import { empresa, oportunidad } from './crmFixtures';

const AHORA = new Date('2026-10-31T15:00:00Z');
const HOY = '2026-10-31';

function pintar(o: Oportunidad, e: Empresa = empresa(), extra: { onAbrir?: (id: string) => void; onSugerencia?: (id: string, a: 'perder' | 'seguir') => void; onRegistrar?: (id: string) => void } = {}) {
  const vista = render(
    <CrmCard
      empresa={e}
      oportunidad={o}
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
      onRegistrar={extra.onRegistrar ?? vi.fn()}
    />,
  );
  return vista.container.querySelector('article') as HTMLElement;
}

describe('CrmCard — identidad (S2)', () => {
  it('shows the empresa name bold as the title and the oportunidad name below it', () => {
    const c = pintar(oportunidad());
    const titulo = within(c).getByRole('heading', { level: 3, name: 'Constructora Andina S.A.C.' });
    expect(titulo.className).toMatch(/font-semibold/);
    expect(within(c).getByText('Equipos de protección para obra')).toBeInTheDocument();
  });

  it('shows "RUC <ruc>" from the empresa and no mark when the ficha has a RUC', () => {
    const c = pintar(oportunidad());
    expect(within(c).getByText('RUC 20512345678')).toBeInTheDocument();
    expect(within(c).queryByText('Falta RUC')).toBeNull();
  });

  it('shows an amber "Falta RUC" mark when the RUC of the empresa is null', () => {
    const c = pintar(oportunidad(), empresa({ ruc: null }));
    const marca = within(c).getByText('Falta RUC');
    expect(marca.className).toMatch(/bg-amber-100/);
    expect(marca.className).toMatch(/text-amber-800/);
    expect(marca.className).toMatch(/border-amber-500\/45/);
    expect(marca.querySelector('svg')).not.toBeNull();
    expect(within(c).queryByText(/^RUC /)).toBeNull();
  });

  it('shows the sector chip of the empresa, and "Sin sector" when it has none', () => {
    const c = pintar(oportunidad());
    expect(within(c).getByText('Construcción')).toBeInTheDocument();
    const sin = pintar(oportunidad(), empresa({ sector: null }));
    expect(within(sin).getByText('Sin sector')).toBeInTheDocument();
  });
});

describe('CrmCard — datos de la oportunidad (S2)', () => {
  it('shows the servicio de interés when set, and nothing when null', () => {
    const con = pintar(oportunidad({ servicio: 'Audiometrías' }));
    expect(within(con).getByText('Audiometrías')).toBeInTheDocument();
    expect(within(pintar(oportunidad())).queryByText('Audiometrías')).toBeNull();
  });

  it('shows the responsable name when assigned, and nothing when unassigned', () => {
    const con = pintar(oportunidad({ responsableNombre: 'Luis Cárdenas' }));
    expect(within(con).getByText('Luis Cárdenas')).toBeInTheDocument();
    expect(within(pintar(oportunidad())).queryByText('Luis Cárdenas')).toBeNull();
  });

  it('formats the montoEstimado as soles ("S/ 12,000") when present', () => {
    const con = pintar(oportunidad({ montoEstimado: 12000 }));
    expect(within(con).getByText('S/ 12,000')).toBeInTheDocument();
    expect(within(pintar(oportunidad())).queryByText(/^S\//)).toBeNull();
  });

  it('shows the origen chip with its label when set', () => {
    const con = pintar(oportunidad({ origen: 'referido' }));
    expect(within(con).getByText('Referido por un cliente')).toBeInTheDocument();
    expect(within(pintar(oportunidad())).queryByText('Referido por un cliente')).toBeNull();
  });

  it('shows a subtle "Migrada" chip only when the deal came from the migration', () => {
    const con = pintar(oportunidad({ migrada: true }));
    const chip = within(con).getByText('Migrada');
    expect(chip.className).toMatch(/text-\[11px\]/);
    expect(within(pintar(oportunidad())).queryByText('Migrada')).toBeNull();
  });
});

describe('CrmCard — follow-up label (S2)', () => {
  it('conversamos: emerald with an icon', () => {
    const c = pintar(oportunidad({ etapa: 'contactado', medio: 'llamada' }));
    const l = within(c).getByText('Conversamos');
    expect(l.className).toMatch(/text-emerald-800/);
    expect(l.querySelector('svg')).not.toBeNull();
  });

  it('sin_respuesta: amber with the count', () => {
    const c = pintar(oportunidad({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 2 }));
    const l = within(c).getByText('Sin respuesta · 2');
    expect(l.className).toMatch(/bg-amber-100/);
    expect(l.querySelector('svg')).not.toBeNull();
  });

  it('falta_responder: amber with the waiting time', () => {
    const c = pintar(oportunidad({ etapa: 'contactado', medio: 'correo', faltaResponderDesde: '2026-10-31T12:00:00Z' }));
    const l = within(c).getByText('Falta responder · hace 3 h');
    expect(l.className).toMatch(/text-amber-800/);
    expect(l.querySelector('svg')).not.toBeNull();
  });

  it('intentos: slate label outside Contactado on open stages', () => {
    const c = pintar(oportunidad({ etapa: 'cotizado', intentosSinRespuesta: 1 }));
    const l = within(c).getByText('1 intento sin respuesta');
    expect(l.className).toMatch(/bg-slate-50/);
    expect(l.className).toMatch(/text-slate-700/);
  });

  it('renders the base content with no follow-up state for a plain deal', () => {
    const c = pintar(oportunidad());
    expect(within(c).getByText('Constructora Andina S.A.C.')).toBeInTheDocument();
    expect(within(c).getByText('RUC 20512345678')).toBeInTheDocument();
    expect(within(c).getByText('Construcción')).toBeInTheDocument();
    expect(within(c).queryByText(/Próximo|Vencida|Conversamos|Sin respuesta|Falta responder/)).toBeNull();
    expect(within(c).queryByRole('group')).toBeNull();
    expect(within(c).queryByText(/Medio:/)).toBeNull();
  });
});

describe('CrmCard — próxima acción (S2, S8)', () => {
  it('future: "Próximo: <acción> · <fecha>" with a calendar icon', () => {
    const c = pintar(oportunidad({ proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } }));
    const t = within(c).getByText('Próximo: Llamar · mar 3 nov');
    expect(t.className).not.toMatch(/text-red-800/);
    expect(t.querySelector('svg')).not.toBeNull();
  });

  it('today renders like future', () => {
    const c = pintar(oportunidad({ proximaAccion: { tipo: 'cotizar', detalle: null, fecha: HOY } }));
    expect(within(c).getByText('Próximo: Enviar cotización · sáb 31 oct')).toBeInTheDocument();
  });

  it('overdue: "Vencida: …" in red-800 semibold', () => {
    const c = pintar(oportunidad({ proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-10-29' } }));
    const t = within(c).getByText('Vencida: Llamar · jue 29 oct');
    expect(t.className).toMatch(/text-red-800/);
    expect(t.className).toMatch(/font-semibold/);
    expect(within(c).queryByText(/^Próximo/)).toBeNull();
  });

  it('"otro" shows the detail as the action text, and falls back to the label without one', () => {
    const con = pintar(oportunidad({ proximaAccion: { tipo: 'otro', detalle: 'Visitar planta', fecha: '2026-11-03' } }));
    expect(within(con).getByText('Próximo: Visitar planta · mar 3 nov')).toBeInTheDocument();
    const sin = pintar(oportunidad({ proximaAccion: { tipo: 'otro', detalle: null, fecha: '2026-11-03' } }));
    expect(within(sin).getByText('Próximo: Otro · mar 3 nov')).toBeInTheDocument();
  });

  it('shows nothing in Ganada/Perdida: a closed deal has no próxima acción', () => {
    const c = pintar(oportunidad({ etapa: 'ganada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } }));
    expect(within(c).queryByText(/Próximo|Vencida/)).toBeNull();
  });
});

describe('CrmCard — medium chip', () => {
  it('shows the free text when the medium is "otro"', () => {
    const c = pintar(oportunidad({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria Expomina' }));
    expect(within(c).getByRole('button', { name: 'Medio: Feria Expomina' })).toBeInTheDocument();
  });

  it('shows the label for the other media', () => {
    const c = pintar(oportunidad({ etapa: 'contactado', medio: 'correo' }));
    expect(within(c).getByRole('button', { name: 'Medio: Correo' })).toBeInTheDocument();
  });
});

describe('CrmCard — Perdida suggestion (S2)', () => {
  const con3 = () => oportunidad({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 3 });

  it('shows the amber group with the text and both buttons', () => {
    const c = pintar(con3());
    const g = within(c).getByRole('group', { name: 'Sugerencia para Equipos de protección para obra' });
    expect(within(g).getByText('3 intentos sin respuesta. ¿Pasar a Perdida con el motivo «No contestan»?')).toBeInTheDocument();
    expect(within(g).getByRole('button', { name: 'Pasar a Perdida' })).toBeInTheDocument();
    expect(within(g).getByRole('button', { name: 'Seguir intentando' })).toBeInTheDocument();
    expect(g.className).toMatch(/bg-amber-100/);
  });

  it('the buttons call back with the idOportunidad without opening the ficha', () => {
    const onAbrir = vi.fn();
    const onSugerencia = vi.fn();
    const c = pintar(con3(), empresa(), { onAbrir, onSugerencia });
    fireEvent.click(within(c).getByRole('button', { name: 'Pasar a Perdida' }));
    fireEvent.click(within(c).getByRole('button', { name: 'Seguir intentando' }));
    expect(onSugerencia.mock.calls).toEqual([
      ['o-1', 'perder'],
      ['o-1', 'seguir'],
    ]);
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it('hidden below 3 attempts', () => {
    expect(within(pintar(oportunidad({ intentosSinRespuesta: 2 }))).queryByRole('group')).toBeNull();
  });

  it('hidden once dismissed at the same count', () => {
    expect(within(pintar({ ...con3(), sugerenciaDescartadaEn: 3 })).queryByRole('group')).toBeNull();
  });

  it('hidden on closed stages: Ganada/Perdida are never suggested', () => {
    expect(within(pintar({ ...con3(), etapa: 'ganada' })).queryByRole('group')).toBeNull();
    expect(within(pintar({ ...con3(), etapa: 'perdida' })).queryByRole('group')).toBeNull();
  });
});

describe('CrmCard — motivo (S2/S5)', () => {
  it('shows the reason summary lines only on a lost deal', () => {
    const perdida = pintar(
      oportunidad({ etapa: 'perdida', motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: 'Muy caro' } }),
    );
    expect(within(perdida).getByText(/Motivo · Precio/)).toBeInTheDocument();
    expect(within(perdida).getByText('Ofrecimos: S/ 7,000')).toBeInTheDocument();
    expect(within(perdida).getByText('Muy caro')).toBeInTheDocument();
    expect(within(perdida).getByRole('button', { name: /Editar motivo/ })).toBeInTheDocument();
    const abierta = pintar(oportunidad({ etapa: 'en_seguimiento', motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: null } }));
    expect(within(abierta).queryByText(/Motivo ·/)).toBeNull();
  });
});

describe('CrmCard — Registrar actividad', () => {
  it('offers "Registrar actividad" on open deals and calls back with the idOportunidad', () => {
    const onRegistrar = vi.fn();
    const c = pintar(oportunidad(), empresa(), { onRegistrar });
    fireEvent.click(within(c).getByRole('button', { name: 'Registrar actividad' }));
    expect(onRegistrar).toHaveBeenCalledWith('o-1');
  });

  it('says "Responder" while an inbound contact waits for our reply', () => {
    const c = pintar(oportunidad({ etapa: 'contactado', medio: 'correo', faltaResponderDesde: '2026-10-31T12:00:00Z' }));
    expect(within(c).getByRole('button', { name: 'Responder' })).toBeInTheDocument();
    expect(within(c).queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
  });

  it('offers nothing on Perdida: the negotiation is over', () => {
    const c = pintar(oportunidad({ etapa: 'perdida' }));
    expect(within(c).queryByRole('button', { name: /Registrar actividad|Responder/ })).toBeNull();
  });
});
