import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ListaConversaciones } from '../ListaConversaciones';
import type { ConversacionListada } from '../../../../domain/entities';

/**
 * Render contract for the E2·T6 list preview: each bandeja row shows
 * the last message preview (emisor glyph: '' cliente / '🤖 ' La
 * Guía / '👤 ' operador + cuerpo truncated ~60 chars) sourced from
 * the listar() OUTER APPLY columns; conversations without messages
 * show no preview line.
 */

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

function montar(conversaciones: ConversacionListada[]): {
  onSeleccionar: ReturnType<typeof vi.fn>;
} {
  const onSeleccionar = vi.fn();
  render(
    <ListaConversaciones
      conversaciones={conversaciones}
      total={conversaciones.length}
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

describe('ListaConversaciones preview del último mensaje (E2·T6)', () => {
  it('muestra la previa con glifo 🤖 para un último mensaje de La Guía', async () => {
    montar([
      fila({ ultimoMensajeCuerpo: 'Te confirmo el turno para el viernes', ultimoMensajeEmisor: 'IA' }),
    ]);
    expect(
      await screen.findByText('🤖 Te confirmo el turno para el viernes'),
    ).toBeInTheDocument();
  });

  it('muestra la previa con glifo 👤 para un último mensaje del operador', async () => {
    montar([
      fila({ ultimoMensajeCuerpo: 'Lo reviso y te aviso', ultimoMensajeEmisor: 'HUMANO' }),
    ]);
    expect(await screen.findByText('👤 Lo reviso y te aviso')).toBeInTheDocument();
  });

  it('sin glifo para el cliente y trunca cuerpos largos a ~60 con elipsis', async () => {
    const largo = 'a'.repeat(70);
    montar([
      fila({ ultimoMensajeCuerpo: largo, ultimoMensajeEmisor: 'CLIENTE' }),
      fila({
        id: 8,
        nombreContacto: 'Ana Ruiz',
        ultimoMensajeCuerpo: 'Segunda fila',
        ultimoMensajeEmisor: 'IA',
      }),
    ]);
    expect(await screen.findByText(`${'a'.repeat(59)}…`)).toBeInTheDocument();
    // La fila truncada sigue siendo clickeable.
    await user.click(screen.getByRole('button', { name: /Luis Medina/ }));
  });

  it('sin mensajes aún → sin línea de previa (null-safe)', async () => {
    montar([fila({ ultimoMensajeCuerpo: null, ultimoMensajeEmisor: null })]);
    expect(await screen.findByText('Luis Medina')).toBeInTheDocument();
    expect(screen.queryByText(/🤖|👤/)).not.toBeInTheDocument();
  });

  it('cuerpo blanco no genera línea de previa', async () => {
    montar([fila({ ultimoMensajeCuerpo: '   ', ultimoMensajeEmisor: 'IA' })]);
    expect(await screen.findByText('Luis Medina')).toBeInTheDocument();
    expect(screen.queryByText(/🤖/)).not.toBeInTheDocument();
  });
});
