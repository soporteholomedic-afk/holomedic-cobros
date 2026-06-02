import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailComposerModal } from '../EmailComposerModal';
import { mockClients } from '../../utils/__tests__/mockData';

// Mock buildEmailHtml to return a predictable HTML string
vi.mock('../../utils/buildEmailHtml', () => ({
  buildEmailHtml: vi.fn((client: { razonSocial: string }) => {
    const name = client?.razonSocial || 'Unknown';
    return `<!DOCTYPE html><html lang="es"><head></head><body><h1>${name}</h1><table><tr><td>F001-101</td></tr></table><p>HOLOMEDIC SERVICIOS INTEGRALES S.A.C.</p></body></html>`;
  }),
}));

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
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const toField = screen.getByPlaceholderText('correo1@dominio.com, correo2@dominio.com');
    expect(toField).toHaveValue('administracion@holomedicsac.com');

    // CC field should be present and empty
    const ccField = screen.getByPlaceholderText('cc@dominio.com, cc2@dominio.com (opcional)');
    expect(ccField).toHaveValue('');

    const subjectInput = screen.getByDisplayValue(/RECORDATORIO DE PAGO - HOLOMEDIC/);
    expect(subjectInput).toHaveValue('RECORDATORIO DE PAGO - HOLOMEDIC - HOLOMEDIC S.A.C.');

    expect(buildEmailHtml).toHaveBeenCalledWith(mockClients[0]);

    // "HOLOMEDIC S.A.C." appears in the payment info block
    expect(screen.getByText('HOLOMEDIC S.A.C.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/Estimados señores/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Cuerpo/i })).not.toBeInTheDocument();
  });

  it('debe generar datos correctos para un cliente con documentos en USD', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[1]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // El destinatario se deriva del razonSocial
    const toField = screen.getByPlaceholderText('correo1@dominio.com, correo2@dominio.com');
    expect(toField).toHaveValue('administracion@juanperezsa.com');
    // El asunto contiene la razón social
    expect(screen.getByDisplayValue(/JUAN PEREZ/)).toBeInTheDocument();
    // buildEmailHtml fue llamado con el cliente correcto
    expect(buildEmailHtml).toHaveBeenCalledWith(mockClients[1]);
  });

  it('debe mostrar spinner mientras se envía el correo', () => {
    // Mock fetch to never resolve — keeps sending state active
    global.fetch = vi.fn(() => new Promise(() => {})) as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Click "Enviar correo" → shows confirmation
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    // Confirm the send
    fireEvent.click(screen.getByRole('button', { name: /confirmar envío/i }));

    expect(screen.getByText('Enviando...')).toBeInTheDocument();
  });

  it('debe mostrar mensaje de error cuando la API responde con error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Error SMTP del servidor', code: 'SMTP_ERROR' }),
    }) as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Click "Enviar correo" → confirm → send
    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error SMTP del servidor/i)).toBeInTheDocument();
    });
  });

  it('debe mostrar botón Reintentar al fallar y permitir re-envío exitoso', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'Error SMTP', code: 'SMTP_ERROR' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
    global.fetch = fetchMock as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // First attempt → confirm → error
    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error SMTP/i)).toBeInTheDocument();
    });

    // Form data should still be intact after error
    expect(screen.getByDisplayValue('administracion@holomedicsac.com')).toBeInTheDocument();

    // Click "Reintentar" → should succeed this time (retry skips confirmation)
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });
  });

  it('debe deshabilitar el botón Cancelar mientras se está enviando', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const sendButton = screen.getByRole('button', { name: /^Enviar correo$/i });

    fireEvent.click(sendButton);
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));

    expect(screen.getByText('Enviando...')).toBeInTheDocument();
    // Re-query Cancelar after re-render (form was unmounted/remounted)
    expect(screen.getByText('Cancelar')).toBeDisabled();
  });

  it('NO debe contener enlace mailto ni el texto "Abrir en Outlook/Gmail"', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.queryByText('Abrir en Outlook/Gmail')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /outlook/i })).not.toBeInTheDocument();
  });

  it('debe mostrar mensaje de error de conexión cuando el servidor no responde', async () => {
    // Simular network error (fetch rejected, not just HTTP error)
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch')) as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error de conexión/i)).toBeInTheDocument();
    });

    // Form data should still be intact after network error
    expect(screen.getByDisplayValue('administracion@holomedicsac.com')).toBeInTheDocument();
  });

  it('debe mostrar pantalla de confirmación antes de enviar con datos del destinatario', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Click "Enviar correo"
    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));

    // Should show confirmation with recipient and "Cancelar" + "Confirmar envío"
    expect(screen.getByText(/¿Confirmar envío?/i)).toBeInTheDocument();
    expect(screen.getByText(/administracion@holomedicsac.com/)).toBeInTheDocument();
    // CC line should NOT be shown when CC is empty
    expect(screen.queryByText(/^Cc:/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancelar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Confirmar envío$/i })).toBeInTheDocument();
  });

  it('debe volver al formulario al cancelar la confirmación', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Click "Enviar correo" → confirmation shown
    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
    expect(screen.getByText(/¿Confirmar envío?/i)).toBeInTheDocument();

    // Click "Cancelar" → back to form
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }));
    expect(screen.queryByText(/¿Confirmar envío?/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Enviar correo$/i })).toBeInTheDocument();
  });

  it('debe mostrar pantalla de éxito cuando la API responde 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });
  });

  it('debe permitir múltiples destinatarios en el campo Para', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Add another email to the existing one
    const toField = screen.getByPlaceholderText('correo1@dominio.com, correo2@dominio.com');
    fireEvent.change(toField, {
      target: { value: 'administracion@holomedicsac.com, cobranzas@holomedic.com' },
    });

    // Go to confirmation
    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));

    // Both emails should appear
    expect(screen.getByText(/administracion@holomedicsac.com/)).toBeInTheDocument();
    expect(screen.getByText(/cobranzas@holomedic.com/)).toBeInTheDocument();
  });

  it('debe incluir CC en la confirmación y en el payload cuando se proporciona', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Fill CC field
    const ccField = screen.getByPlaceholderText('cc@dominio.com, cc2@dominio.com (opcional)');
    fireEvent.change(ccField, { target: { value: 'gerencia@holomedic.com, contabilidad@holomedic.com' } });

    // Go to confirmation
    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));

    // CC should be displayed in confirmation
    expect(screen.getByText(/gerencia@holomedic.com/)).toBeInTheDocument();
    expect(screen.getByText(/contabilidad@holomedic.com/)).toBeInTheDocument();
    expect(screen.getByText(/^Cc:/i)).toBeInTheDocument();

    // Confirm send
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    // Verify fetch was called with CC in payload
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/send-email',
      expect.objectContaining({
        body: expect.stringContaining('"cc":'),
      })
    );

    // Verify CC contains the right emails
    const fetchCall = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(fetchCall.body);
    expect(body.cc).toEqual(['gerencia@holomedic.com', 'contabilidad@holomedic.com']);
  });

  it('debe omitir CC en el payload cuando el campo está vacío', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as any;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EmailComposerModal
        client={mockClients[0]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Go to confirmation and send without filling CC
    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    // Verify fetch was called WITHOUT cc in payload
    const fetchCall = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(fetchCall.body);
    expect(body).not.toHaveProperty('cc');
    expect(body.to).toEqual(['administracion@holomedicsac.com']);
  });
});
