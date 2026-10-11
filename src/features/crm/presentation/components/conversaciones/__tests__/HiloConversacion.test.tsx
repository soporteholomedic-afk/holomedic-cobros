import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HiloConversacion } from '../HiloConversacion';
import type { ConversacionListada, MensajeCrm } from '../../../../domain/entities';

/**
 * Render contract for the IA additions of HiloConversacion (E2·T6):
 * OUT+IA messages render distinctly — indigo tint + '🤖 La Guía'
 * label, score chip ('confianza 0.80', toFixed(2)), 'Fuentes (N)'
 * popover listing each titulo (defensive JSON parse: garbage hides
 * the affordance, never crashes), and a PENDIENTE estadoEnvio shows
 * 'enviando…' instead of the time line. OUT+HUMANO keeps the teal
 * bubble. The hilo body crosses esHiloConversacion → the PENDIENTE
 * acceptance of esMensajeCrm is a precondition of these renders.
 */

const FUENTES_JSON = JSON.stringify([
  { id: 1, tipo: 'KB', titulo: 'Horarios de atención' },
  { id: 2, tipo: 'KB', titulo: 'Formas de pago' },
]);

const fila: ConversacionListada = {
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
};

function mensaje(overrides: Partial<MensajeCrm>): MensajeCrm {
  return {
    id: 1,
    conversacionId: 7,
    direccion: 'IN',
    emisor: 'CLIENTE',
    cuerpo: 'Hola, quiero info',
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: null,
    idempotenciaKey: null,
    estadoEnvio: null,
    fuentes: null,
    score: null,
    modelo: null,
    creadoEn: '2026-10-11T10:00:00Z',
    ...overrides,
  };
}

function okHilo(mensajes: MensajeCrm[]): Response {
  const conversacion = {
    id: fila.id,
    empresaId: fila.empresaId,
    contactoId: fila.contactoId,
    canal: fila.canal,
    telefono: fila.telefono,
    identificadorCanal: fila.identificadorCanal,
    estado: fila.estado,
    asignadaA: fila.asignadaA,
    modo: fila.modo,
    ultimoMensajeEn: fila.ultimoMensajeEn,
    noLeidos: fila.noLeidos,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
  return new Response(JSON.stringify({ success: true, conversacion, mensajes }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function montar(mensajes: MensajeCrm[]): void {
  fetchMock.mockResolvedValue(okHilo(mensajes));
  render(
    <HiloConversacion fila={fila} onVolver={() => {}} onCambio={() => {}} />,
  );
}

const user = userEvent.setup();

describe('HiloConversacion burbuja IA (E2·T6)', () => {
  it('renderiza etiqueta 🤖 La Guía + chip de confianza + fuentes titulos', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Te confirmo el turno para el viernes a las 9:00',
        estadoEnvio: 'ENVIADO',
        score: 0.8,
        modelo: 'gpt-probe',
        fuentes: FUENTES_JSON,
        creadoEn: '2026-10-11T10:05:00Z',
      }),
    ]);

    await waitFor(() => expect(screen.getByLabelText('Mensajes')).toBeInTheDocument());
    expect(await screen.findByText('🤖 La Guía')).toBeInTheDocument();
    expect(screen.getByText('confianza 0.80')).toBeInTheDocument();
    // El popover: cerrado muestra el resumen, al abrirlo lista los titulos.
    const resumen = screen.getByText('Fuentes (2)');
    await user.click(resumen);
    expect(screen.getByText('Horarios de atención')).toBeInTheDocument();
    expect(screen.getByText('Formas de pago')).toBeInTheDocument();
  });

  it('score null no renderiza el chip; fuentes garbage esconde el affordance sin crashear', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Respuesta sin score ni fuentes válidas',
        estadoEnvio: 'ENVIADO',
        score: null,
        fuentes: '{no json',
      }),
    ]);

    await waitFor(() =>
      expect(screen.getByText('Respuesta sin score ni fuentes válidas')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/confianza/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fuentes \(/)).not.toBeInTheDocument();
  });

  it('PENDIENTE muestra «enviando…» en vez de la línea de hora', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Respuesta en vuelo',
        estadoEnvio: 'PENDIENTE',
        wamid: null,
      }),
    ]);

    await waitFor(() => expect(screen.getByText('Respuesta en vuelo')).toBeInTheDocument());
    expect(screen.getByText('enviando…')).toBeInTheDocument();
  });

  it('FALLIDO mantiene el marcado de envío fallido; ENVIADO muestra la hora', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Reintento fallido',
        estadoEnvio: 'FALLIDO',
      }),
      mensaje({
        id: 3,
        direccion: 'OUT',
        emisor: 'HUMANO',
        cuerpo: 'Buenas, en qué te ayudo',
        estadoEnvio: 'ENVIADO',
        creadoEn: '2026-10-11T10:09:00Z',
      }),
    ]);

    await waitFor(() => expect(screen.getByText('Reintento fallido')).toBeInTheDocument());
    expect(screen.getByText(/envío fallido/)).toBeInTheDocument();
    // OUT+HUMANO sin cambios: etiqueta Operador (sin glifo IA), y la
    // burbuja IA fallida SÍ lleva su etiqueta — coexisten sin conflicto.
    expect(screen.getByText('Operador')).toBeInTheDocument();
    expect(screen.getByText('🤖 La Guía')).toBeInTheDocument();
  });
});
