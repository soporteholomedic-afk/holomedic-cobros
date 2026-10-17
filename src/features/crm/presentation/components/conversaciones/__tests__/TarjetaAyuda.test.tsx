import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TarjetaAyuda } from '../TarjetaAyuda';
import type { SolicitudAyudaVista } from '../guards';

/**
 * Render contract for the thread's help card (E3·T5, mockup
 * temp/diagrama-flujo/mockup.html .helpcard): head '🤖 La Guía
 * pregunta: ¿cómo sigo?', the escalated consulta quoted, the RAG
 * términos as chips, the score when present; the indicación textarea
 * ('Tu indicación para la Guía…') + 'Enviar indicación'; success
 * shows '✓ Indicación guardada — la Guía continúa con el cliente'
 * (aria-live) and clears ONLY the card input — the composer draft
 * lives in HiloConversacion and is never touched from here.
 */

const SOLICITUD: SolicitudAyudaVista = {
  id: 9,
  conversacionId: 7,
  mensajeId: 55,
  consulta: '¿facturan con crédito fiscal a 30 días?',
  terminosBuscados: ['crédito', 'facturación', 'plazos de pago'],
  score: 0.29,
  estado: 'PENDIENTE',
  indicacion: null,
  resueltaPor: null,
  creadoEn: '2026-10-11T14:03:00.000Z',
  resueltaEn: null,
};

const user = userEvent.setup();

function montar(
  sobres: Partial<Parameters<typeof TarjetaAyuda>[0]> = {},
): ReturnType<typeof render> {
  const props: Parameters<typeof TarjetaAyuda>[0] = {
    solicitud: SOLICITUD,
    enviada: false,
    onEnviada: () => {},
    enviando: false,
    error: null,
    onEnviar: () => Promise.resolve(true),
    ...sobres,
  };
  return render(<TarjetaAyuda {...props} />);
}

describe('TarjetaAyuda (E3·T5)', () => {
  it('renderiza la cabeza, la consulta citada, los términos como chips y el score', () => {
    montar();

    expect(screen.getByText('🤖 La Guía pregunta: ¿cómo sigo?')).toBeInTheDocument();
    expect(screen.getByText(/¿facturan con crédito fiscal a 30 días\?/)).toBeInTheDocument();
    expect(screen.getByText('crédito')).toBeInTheDocument();
    expect(screen.getByText('facturación')).toBeInTheDocument();
    expect(screen.getByText('plazos de pago')).toBeInTheDocument();
    expect(screen.getByText('score 0.29')).toBeInTheDocument();
  });

  it('términos repetidos → un chip por término distinto y sin warning de key duplicada', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    montar({
      solicitud: { ...SOLICITUD, score: null, terminosBuscados: ['que', 'hora', 'que', 'canal'] },
    });

    expect(screen.getAllByText('que')).toHaveLength(1);
    expect(screen.getByText('hora')).toBeInTheDocument();
    expect(screen.getByText('canal')).toBeInTheDocument();
    expect(screen.getByText('La Guía buscó:')).toBeInTheDocument();
    const chips = screen.getByText('La Guía buscó:').parentElement?.querySelectorAll('span.rounded-full');
    expect(chips).toHaveLength(3);
    const avisosKey = errorSpy.mock.calls.filter((llamada) =>
      llamada.some((arg) => typeof arg === 'string' && arg.includes('same key')),
    );
    expect(avisosKey).toHaveLength(0);
  });

  it('score null → sin chip de score; términos vacíos → sin chips', () => {
    montar({
      solicitud: { ...SOLICITUD, score: null, terminosBuscados: [] },
    });

    expect(screen.queryByText(/score/)).not.toBeInTheDocument();
    expect(screen.queryByText('crédito')).not.toBeInTheDocument();
  });

  it('envía la indicación: onEnviar con el texto; éxito limpia SOLO el input de la tarjeta', async () => {
    const onEnviar = vi.fn().mockResolvedValue(true);
    const onEnviada = vi.fn();
    montar({ onEnviar, onEnviada });

    const input = screen.getByPlaceholderText('Tu indicación para la Guía…');
    await user.type(input, 'Decile que sí, con presentación el jueves');
    await user.click(screen.getByRole('button', { name: 'Enviar indicación' }));

    await waitFor(() => expect(onEnviar).toHaveBeenCalledWith('Decile que sí, con presentación el jueves'));
    expect(onEnviada).toHaveBeenCalledWith(true);
    // Solo el input de la tarjeta se limpia (el composer no vive acá).
    expect(input).toHaveValue('');
  });

  it('éxito reportado (enviada) → muestra el mensaje de éxito en aria-live', () => {
    montar({ enviada: true });

    const aviso = screen.getByText('✓ Indicación guardada — la Guía continúa con el cliente');
    expect(aviso).toBeInTheDocument();
    // El formulario ya no se muestra: la solicitud está resuelta.
    expect(screen.queryByPlaceholderText('Tu indicación para la Guía…')).not.toBeInTheDocument();
  });

  it('fallo del envío → error visible y el texto NO se pierde', async () => {
    const onEnviar = vi.fn().mockResolvedValue(false);
    montar({ onEnviar, error: 'La conversación no tiene una solicitud de ayuda pendiente' });

    const input = screen.getByPlaceholderText('Tu indicación para la Guía…');
    await user.type(input, 'una indicación');
    await user.click(screen.getByRole('button', { name: 'Enviar indicación' }));

    await waitFor(() => expect(onEnviar).toHaveBeenCalled());
    expect(screen.getByRole('alert')).toHaveTextContent('solicitud de ayuda pendiente');
    expect(input).toHaveValue('una indicación');
  });

  it('botón deshabilitado con texto vacío o enviando', () => {
    const { rerender } = montar();
    expect(screen.getByRole('button', { name: 'Enviar indicación' })).toBeDisabled();

    rerender(
      <TarjetaAyuda
        solicitud={SOLICITUD}
        enviada={false}
        onEnviada={() => {}}
        enviando
        error={null}
        onEnviar={() => Promise.resolve(true)}
      />,
    );
    expect(screen.getByRole('button', { name: 'Enviar indicación' })).toBeDisabled();
  });
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
