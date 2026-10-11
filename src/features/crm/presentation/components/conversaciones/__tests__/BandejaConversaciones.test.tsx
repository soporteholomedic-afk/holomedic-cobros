import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ConversacionListada } from '../../../../domain/entities';

/**
 * Deep-link preselection contract for BandejaConversaciones
 * (agente-ia-crm E3·T6): `?conversacion=<id>` (arriving from the
 * global toast's 'Ver conversación' action) preselects that row ONCE
 * the list loads and the row is present; when absent (or no param)
 * the bandeja falls back to today's behavior — nothing selected, the
 * 'Seleccioná una conversación' placeholder. Afterwards the internal
 * selection wins: a user click moves the selection and the param
 * never re-applies.
 */

let query = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query),
}));

const useConversacionesMock = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useConversaciones', () => ({
  useConversaciones: useConversacionesMock,
}));

vi.mock('../HiloConversacion', () => ({
  HiloConversacion: ({ fila }: { fila: ConversacionListada }) => (
    <div data-testid="hilo-mock">{`hilo-${fila.id}`}</div>
  ),
}));

import { BandejaConversaciones } from '../BandejaConversaciones';

function fila(overrides: Partial<ConversacionListada> = {}): ConversacionListada {
  return {
    id: 7,
    empresaId: 1,
    contactoId: 11,
    canal: 'WHATSAPP',
    telefono: '+595981234567',
    identificadorCanal: null,
    estado: 'TOMADA_HUMANO',
    asignadaA: 'jperez',
    modo: 'HUMANO',
    ultimoMensajeEn: '2026-10-11T14:02:00.000Z',
    noLeidos: 0,
    creadoEn: '2026-10-11T10:00:00.000Z',
    actualizadoEn: '2026-10-11T14:02:00.000Z',
    razonSocial: 'Comercio Central',
    nombreContacto: 'Luis Medina',
    ...overrides,
  };
}

const filas = [fila(), fila({ id: 8, nombreContacto: 'Ana Ruiz' })];

function montarConFilas(items: ConversacionListada[]): void {
  useConversacionesMock.mockReturnValue({
    conversaciones: items,
    total: items.length,
    modoSimulado: false,
    status: 'ready',
    error: null,
    refetch: vi.fn(),
    simularEntrada: vi.fn(),
  });
}

const user = userEvent.setup();

beforeEach(() => {
  query = '';
  useConversacionesMock.mockReset();
  montarConFilas(filas);
});

describe('BandejaConversaciones deep-link ?conversacion= (E3·T6)', () => {
  it('preselecciona la fila indicada cuando está en la lista', async () => {
    query = 'conversacion=7';
    render(<BandejaConversaciones />);

    const filaAna = await screen.findByRole('button', { name: /Luis Medina/ });
    expect(filaAna).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('hilo-mock')).toHaveTextContent('hilo-7');
  });

  it('id ausente de la lista → fallback al comportamiento de hoy (nada seleccionado)', async () => {
    query = 'conversacion=99';
    render(<BandejaConversaciones />);

    expect(await screen.findByText('Seleccioná una conversación')).toBeInTheDocument();
    expect(screen.queryByTestId('hilo-mock')).not.toBeInTheDocument();
    const filaAna = screen.getByRole('button', { name: /Luis Medina/ });
    expect(filaAna).not.toHaveAttribute('aria-current', 'true');
  });

  it('parámetro inválido (no numérico) → fallback limpio', async () => {
    query = 'conversacion=abc';
    render(<BandejaConversaciones />);

    expect(await screen.findByText('Seleccioná una conversación')).toBeInTheDocument();
  });

  it('sin parámetro → nada preseleccionado (comportamiento de hoy)', async () => {
    render(<BandejaConversaciones />);

    expect(await screen.findByText('Seleccioná una conversación')).toBeInTheDocument();
  });

  it('el clic del usuario gana: cambia la selección y el parámetro no vuelve a aplicar', async () => {
    query = 'conversacion=7';
    render(<BandejaConversaciones />);
    expect(await screen.findByTestId('hilo-mock')).toHaveTextContent('hilo-7');

    await user.click(screen.getByRole('button', { name: /Ana Ruiz/ }));

    expect(screen.getByTestId('hilo-mock')).toHaveTextContent('hilo-8');
    const filaLuis = within(screen.getByRole('list')).getByRole('button', { name: /Luis Medina/ });
    expect(filaLuis).not.toHaveAttribute('aria-current', 'true');
    const filaAna = screen.getByRole('button', { name: /Ana Ruiz/ });
    expect(filaAna).toHaveAttribute('aria-current', 'true');
  });
});
