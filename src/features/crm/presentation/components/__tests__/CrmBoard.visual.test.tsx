import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CrmBoard } from '../CrmBoard';
import { mockApi } from './crmFixtures';

const card = (nombre: string) => screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('Details of the approved design', () => {
  it('a lost card has a 3 px light-red left border and its reason label is uppercase', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const perdida = card('Ferretería El Maestro S.R.L.');
    expect(perdida.className).toMatch(/border-l-\[3px\]/);
    expect(perdida.className).toMatch(/border-l-red-300/);
    expect(within(perdida).getByText(/^Motivo · /).className).toMatch(/\buppercase\b/);
    expect(card('Constructora Andina S.A.C.').className).not.toMatch(/border-l-\[3px\]/);
  });

  it('the detail form keeps Cancel and Save stuck to the bottom, so they never need a scroll', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    fireEvent.click(within(card('Textiles Pacífico S.A.C.')).getByText(/^RUC /));
    const panel = screen.getByRole('dialog', { name: 'Textiles Pacífico S.A.C.' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Editar' }));
    const pie = within(panel).getByRole('button', { name: 'Guardar cambios' }).closest('[data-pie-detalle]') as HTMLElement;
    expect(pie).not.toBeNull();
    expect(pie.className).toMatch(/\bsticky\b/);
    expect(pie.className).toMatch(/\bbottom-0\b/);
    expect(within(pie).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('the create form keeps Cancel and Create stuck to the bottom (short screens), and the form fields stay above them', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    const panel = screen.getByRole('dialog', { name: /Nueva empresa/ });
    const pie = within(panel).getByRole('button', { name: 'Crear empresa' }).closest('[data-pie-alta]') as HTMLElement;
    expect(pie).not.toBeNull();
    expect(pie.className).toMatch(/\bsticky\b/);
    expect(pie.className).toMatch(/\bbottom-0\b/);
    expect(within(pie).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    // the submit button still belongs to the form, so Enter and the click keep creating
    expect(within(panel).getByRole('button', { name: 'Crear empresa' })).toHaveAttribute('type', 'submit');
    expect(within(panel).getByRole('button', { name: 'Crear empresa' }).closest('form')).not.toBeNull();
  });
});
