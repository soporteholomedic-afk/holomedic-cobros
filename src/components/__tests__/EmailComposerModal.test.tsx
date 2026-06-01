import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EmailComposerModal from '../EmailComposerModal';
import { mockClients } from '../../utils/__tests__/mockData';

describe('EmailComposerModal Component', () => {
  it('debe pre-poblar los campos de destinatario, asunto y cuerpo correctamente', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]} // HOLOMEDIC S.A.C
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Destinatario y Asunto
    const toInput = screen.getByPlaceholderText('correo@cliente.com');
    expect(toInput).toHaveValue('administracion@holomedicsac.com');

    const subjectInput = screen.getByDisplayValue(/RECORDATORIO DE PAGO - HOLOMEDIC/);
    expect(subjectInput).toHaveValue('RECORDATORIO DE PAGO - HOLOMEDIC - HOLOMEDIC S.A.C.');

    // Cuerpo
    const bodyTextarea = screen.getByDisplayValue(/Estimados señores/);
    expect(bodyTextarea.value).toContain('HOLOMEDIC S.A.C.');
    // Debe incluir la factura pendiente
    expect(bodyTextarea.value).toContain('F001-101');
    // No debe incluir la cancelada (F001-102) que tiene saldo 0
    expect(bodyTextarea.value).not.toContain('F001-102');
    expect(bodyTextarea.value).toContain('S/ 1,000.00');
    // Cuentas de banco
    expect(bodyTextarea.value).toContain('193-2345678-0-91');
  });

  it('debe simular el envío del correo y llamar a onSuccess al completarse', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const submitButton = screen.getByText('Enviar (Simulación)');
    fireEvent.click(submitButton);

    // El botón debe cambiar a Enviando...
    expect(screen.getByText('Enviando...')).toBeInTheDocument();

    // Avanzar el primer timer (1500ms) para simular el envío
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Se muestra pantalla de éxito
    expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();

    // Avanzar el segundo timer (1800ms) para disparar el callback
    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('Correo de cobro enviado con éxito a HOLOMEDIC S.A.C.');
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
