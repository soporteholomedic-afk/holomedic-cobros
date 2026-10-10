import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ListaConversaciones } from '../components/conversaciones/ListaConversaciones';
import { esConversacionListada, formatearTelefono } from '../components/conversaciones/guards';
import type { ConversacionListada } from '../../domain/entities';

/**
 * Render contract for ListaConversaciones (agente-ia-crm E1): the
 * bandeja rows — a PENDIENTE_VINCULACION conversation shows "Sin
 * vincular · <teléfono>" instead of a contact name, the noLeidos
 * badge renders only when > 0, and selecting a row reports its id.
 */

function fila(overrides: Partial<ConversacionListada>): ConversacionListada {
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

function montar(overrides: Partial<ConversacionListada> = {}): {
  onSeleccionar: ReturnType<typeof vi.fn>;
} {
  const onSeleccionar = vi.fn();
  render(
    <ListaConversaciones
      conversaciones={[fila(overrides)]}
      total={1}
      status="ready"
      error={null}
      busqueda=""
      onBuscar={() => {}}
      seleccionada={null}
      onSeleccionar={onSeleccionar}
      onReintentar={() => {}}
    />,
  );
  return { onSeleccionar };
}

const user = userEvent.setup();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---- helpers puros ----

describe('formatearTelefono', () => {
  it('groups an E.164 celular number in threes for display', () => {
    expect(formatearTelefono('+595981234567')).toBe('+595 981 234 567');
  });

  it('passes through null and free-text values', () => {
    expect(formatearTelefono(null)).toBeNull();
    expect(formatearTelefono('0981 234 567')).toBe('0981 234 567');
  });
});

// ---- guards (triangulación del narrowing) ----

describe('esConversacionListada', () => {
  it('accepts a valid bandeja row', () => {
    expect(esConversacionListada(fila({}))).toBe(true);
  });

  it('rejects a row whose join fields have the wrong type', () => {
    expect(esConversacionListada({ ...fila({}), razonSocial: 5 })).toBe(false);
    expect(esConversacionListada({ ...fila({}), noLeidos: '3' })).toBe(false);
    expect(esConversacionListada({ ...fila({}), estado: 'CUALQUIERA' })).toBe(false);
    expect(esConversacionListada(null)).toBe(false);
  });
});

// ---- filas ----

describe('ListaConversaciones', () => {
  it('renders the contact name + razón social for a linked conversation', async () => {
    montar();
    expect(await screen.findByText('Luis Medina')).toBeInTheDocument();
    expect(screen.getByText('Comercio Central')).toBeInTheDocument();
    expect(screen.queryByText(/Sin vincular/)).not.toBeInTheDocument();
  });

  it('shows "Sin vincular · <teléfono>" for PENDIENTE_VINCULACION', async () => {
    montar({
      id: 8,
      estado: 'PENDIENTE_VINCULACION',
      empresaId: null,
      contactoId: null,
      razonSocial: null,
      nombreContacto: null,
      telefono: '+595981234567',
    });
    expect(await screen.findByText(`Sin vincular · ${formatearTelefono('+595981234567')}`)).toBeInTheDocument();
  });

  it('renders the unread badge only when noLeidos > 0', async () => {
    montar({ noLeidos: 3 });
    expect(await screen.findByText('Luis Medina'));
    expect(screen.getByLabelText('3 mensajes sin leer')).toBeInTheDocument();
  });

  it('omits the unread badge when noLeidos is 0 and reports the row click', async () => {
    const { onSeleccionar } = montar({ noLeidos: 0 });
    await user.click(screen.getByRole('button', { name: /Luis Medina/ }));
    expect(onSeleccionar).toHaveBeenCalledWith(7);
    expect(screen.queryByLabelText(/mensajes sin leer/)).not.toBeInTheDocument();
  });
});
