import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// T7/T8 own the side panels: this file pins the visual of the board cards only.
vi.mock('../PanelDia', () => ({ PanelDia: () => null }));
vi.mock('../DetallePanel', () => ({ DetallePanel: () => null }));
vi.mock('../EntrantePanel', () => ({ EntrantePanel: () => null }));
vi.mock('../RegistrarContactoPanel', () => ({ RegistrarContactoPanel: () => null }));
vi.mock('../AltaPanel', () => ({ AltaPanel: () => null }));

import { CrmBoard } from '../CrmBoard';
import { mockApi } from './crmFixtures';

const tarjeta = (nombre: string) => screen.getByText(nombre).closest('article') as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('Details of the approved design', () => {
  it('a lost card has a 3 px light-red left border and its reason label is uppercase', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const perdida = tarjeta('Ergonomía industrial');
    expect(perdida.className).toMatch(/border-l-\[3px\]/);
    expect(perdida.className).toMatch(/border-l-red-300/);
    expect(within(perdida).getByText(/^Motivo · /).className).toMatch(/\buppercase\b/);
    expect(tarjeta('Equipos de protección para obra').className).not.toMatch(/border-l-\[3px\]/);
  });
});
