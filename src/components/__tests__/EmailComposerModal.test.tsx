import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmailComposerModal from '../EmailComposerModal';
import { mockClients } from '../../utils/__tests__/mockData';

// Mock buildEmailHtml to return a predictable HTML string
vi.mock('../../utils/buildEmailHtml', () => ({
  buildEmailHtml: vi.fn((client: { razonSocial: string }) => {
    const name = client?.razonSocial || 'Unknown';
    return `<!DOCTYPE html><html lang="es"><head></head><body><h1>${name}</h1><table><tr><td>F001-101</td></tr></table><p>HOLOMEDIC SERVICIOS INTEGRALES S.A.C.</p></body></html>`;
  }),
}));

// Import the mocked module for assertions
import { buildEmailHtml } from '../../utils/buildEmailHtml';

describe('EmailComposerModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe pre-poblar los campos de destinatario, asunto y mostrar el HTML renderizado', () => {
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

    // buildEmailHtml fue llamado con los datos del cliente
    expect(buildEmailHtml).toHaveBeenCalledWith(mockClients[0]);

    // El HTML renderizado está visible en el DOM (no como texto plano)
    // "HOLOMEDIC S.A.C." aparece tanto en el HTML renderizado como en la info bancaria
    const holomedicTexts = screen.getAllByText('HOLOMEDIC S.A.C.');
    expect(holomedicTexts.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('F001-101')).toBeInTheDocument();
    // Payment info is rendered as HTML, not raw text
    expect(screen.getByText('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.')).toBeInTheDocument();

    // No debe haber textarea para el cuerpo del mensaje
    expect(screen.queryByDisplayValue(/Estimados señores/)).not.toBeInTheDocument();
    // El cuerpo del mensaje ya no es un textarea
    expect(screen.queryByRole('textbox', { name: /Cuerpo/i })).not.toBeInTheDocument();
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

  it('debe generar HTML diferente para un cliente con documentos en USD', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[1]} // JUAN PEREZ S.A. — saldo negativo en USD
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // El HTML renderizado debe contener el nombre del cliente correcto
    expect(screen.getByText('JUAN PEREZ S.A.')).toBeInTheDocument();
    // buildEmailHtml fue llamado con el cliente correcto
    expect(buildEmailHtml).toHaveBeenCalledWith(mockClients[1]);
    // El mailto fallback usa texto plano (no HTML) para el otro cliente
    const mailtoLink = screen.getByText('Abrir en Outlook/Gmail');
    const href = mailtoLink.closest('a')?.getAttribute('href') || '';
    expect(href).toContain('JUAN%20PEREZ');
  });

  it('debe mantener el enlace mailto con cuerpo en texto plano como fallback', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const mailtoLink = screen.getByText('Abrir en Outlook/Gmail');
    const href = mailtoLink.closest('a')?.getAttribute('href') || '';

    // El mailto debe tener el destinatario
    expect(href).toContain('mailto:administracion@holomedicsac.com');
    // El asunto debe estar presente
    expect(href).toContain('RECORDATORIO%20DE%20PAGO');
    // El body debe ser texto plano (no HTML) — no debe contener etiquetas HTML escapadas
    expect(href).not.toContain('%3Chtml%3E');
    expect(href).not.toContain('%3Ctable%3E');
    // Debe contener datos de los documentos en texto plano
    expect(href).toContain('FE%20F001-101');
    expect(href).toContain('S%2F%201%2C000.00');
  });
});
